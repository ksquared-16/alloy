import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { mintPacketPublicLinkForAdmin } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";
import { resolveOpportunityEnrollmentSelection } from "@/lib/forms/packets/opportunityPacketLaunchValidation";
import {
    activeOutboundBindings,
    availableComposerChannels,
    type BindingSummary,
} from "@/lib/communications/composerChannels";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    assertCommunicationsSendAllowed,
} from "@/lib/communications/communicationPermissions";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import {
    assertRecipientPersonEligibleForDrawerEmail,
    getPersonEmailOrNull,
} from "@/lib/communications/drawerEmailRecipients";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";
import { emitOpportunityEnrollmentPacketSentSafe } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deriveEmbedBaseUrl(request: NextRequest): string | null {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host?.trim()) return null;
    const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
    return `${proto}://${host.trim()}`;
}

function parseUuidList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const x of raw) {
        if (typeof x !== "string") continue;
        const t = x.trim();
        if (UUID_RE.test(t) && !out.includes(t)) out.push(t);
    }
    return out;
}

/** POST — mint one packet link per selected child (or one household link), optional Communications email. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    if (!UUID_RE.test(String(opportunityId ?? "").trim())) {
        return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const packetDefinitionId = typeof body.packet_definition_id === "string" ? body.packet_definition_id.trim() : "";
    if (!UUID_RE.test(packetDefinitionId)) {
        return NextResponse.json({ error: "packet_definition_id is required" }, { status: 400 });
    }

    const recipientRaw = body.recipient_person_id;
    const recipient_person_id =
        recipientRaw === null || recipientRaw === undefined || recipientRaw === ""
            ? null
            : typeof recipientRaw === "string" && UUID_RE.test(recipientRaw.trim())
              ? recipientRaw.trim()
              : null;
    if (recipientRaw !== null && recipientRaw !== undefined && recipientRaw !== "" && !recipient_person_id) {
        return NextResponse.json({ error: "recipient_person_id must be a UUID or null" }, { status: 400 });
    }

    const memberIds = parseUuidList(body.customer_member_ids);
    const delivery = String(body.delivery ?? "copy_only").trim().toLowerCase();
    const wantEmail = delivery === "send_email";

    const internalNote = typeof body.internal_note === "string" ? body.internal_note.trim() : "";
    let expires_at: string | undefined;
    if ("expires_at" in body && body.expires_at !== null && body.expires_at !== undefined) {
        const raw = body.expires_at;
        if (typeof raw === "string" && raw.trim()) {
            const t = Date.parse(raw);
            if (Number.isNaN(t)) return NextResponse.json({ error: "expires_at invalid" }, { status: 400 });
            expires_at = new Date(t).toISOString();
        }
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", opportunityId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const accessDim = scopeDimensionsFromAccess(access);
    if (!(await assertExistingOpportunityMutableInAdminScope(supabase, ctx.orgId, accessDim, opportunityId))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: oppRow } = await supabase
        .from("opportunities")
        .select("name, customer_id, primary_person_id")
        .eq("id", opportunityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    const oppName = typeof (oppRow as { name?: string } | null)?.name === "string" ? String((oppRow as { name: string }).name).trim() : "";

    const targets: (string | null)[] = memberIds.length > 0 ? [...memberIds] : [null];

    const embedBase = deriveEmbedBaseUrl(request);
    const created: {
        public_link_id: string;
        embed_url: string | null;
        customer_member_id: string | null;
        enrollee_label: string | null;
    }[] = [];

    let effectiveRecipient: string | null = null;

    for (const mid of targets) {
        const resolved = await resolveOpportunityEnrollmentSelection(supabase, ctx.orgId, opportunityId, {
            customer_member_id: mid ?? undefined,
            recipient_person_id: recipient_person_id ?? undefined,
            delivery_intent: "copy_link",
        });
        if (!resolved.ok) {
            return NextResponse.json({ error: resolved.message, created_links_partial: created }, { status: 400 });
        }
        effectiveRecipient = resolved.value.recipient_person_id;

        let enrolleeLabel: string | null = null;
        if (mid) {
            const { data: mem } = await supabase
                .from("customer_members")
                .select("first_name, last_name, display_name")
                .eq("org_id", ctx.orgId)
                .eq("id", mid)
                .maybeSingle();
            const m = mem as { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null;
            if (m) {
                const dn = typeof m.display_name === "string" ? m.display_name.trim() : "";
                const fn = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
                enrolleeLabel = dn || fn || null;
            }
        } else {
            enrolleeLabel = "Household";
        }

        const labelBase = oppName || "Opportunity";
        const label = mid ? `${labelBase} · ${enrolleeLabel ?? "Enrollee"}` : `${labelBase} · Household`;

        const meta: Record<string, unknown> = {};
        if (internalNote) meta.internal_operator_note = internalNote;
        if (wantEmail) meta.enrollment_email_requested = true;

        const mintBody: Record<string, unknown> = {
            packet_definition_id: packetDefinitionId,
            label,
            launch_from_entity: { entity_type: "opportunity", entity_id: opportunityId },
            enrollment_selection: {
                customer_member_id: mid,
                recipient_person_id: resolved.value.recipient_person_id,
                delivery_intent: "copy_link",
            },
            ...(Object.keys(meta).length ? { metadata: meta } : {}),
            ...(expires_at ? { expires_at } : {}),
        };

        const minted = await mintPacketPublicLinkForAdmin({
            supabase,
            orgId: ctx.orgId,
            embedBaseUrl: embedBase,
            body: mintBody,
        });
        if (!minted.ok) {
            return NextResponse.json(
                { error: minted.message, created_links_partial: created },
                { status: minted.status >= 400 && minted.status < 600 ? minted.status : 400 }
            );
        }

        const row = minted.data as { id?: string; embed_url?: string | null; embed_path?: string };
        const linkId = typeof row.id === "string" ? row.id : "";
        if (!linkId) {
            return NextResponse.json({ error: "Mint returned no link id", created_links_partial: created }, { status: 500 });
        }
        let url: string | null = typeof row.embed_url === "string" && row.embed_url.startsWith("http") ? row.embed_url : null;
        if (!url && typeof row.embed_path === "string" && embedBase) {
            url = `${embedBase}${row.embed_path}`;
        }
        created.push({
            public_link_id: linkId,
            embed_url: url,
            customer_member_id: mid,
            enrollee_label: enrolleeLabel,
        });
    }

    const linkIds = created.map((c) => c.public_link_id);
    if (!effectiveRecipient && oppRow && typeof (oppRow as { primary_person_id?: string }).primary_person_id === "string") {
        const pp = (oppRow as { primary_person_id: string }).primary_person_id.trim();
        if (UUID_RE.test(pp)) effectiveRecipient = pp;
    }

    let emailResult: {
        ok: boolean;
        skipped_reason?: string;
        communication_message_id?: string | null;
    } = { ok: false, skipped_reason: wantEmail ? undefined : "copy_only" };

    if (wantEmail && created.length > 0) {
        const sendAuth = await assertCommunicationsSendAllowed({
            orgId: ctx.orgId,
            actor: ctx.userId ? { userId: ctx.userId } : null,
        });
        if (!sendAuth.ok) {
            emailResult = { ok: false, skipped_reason: sendAuth.message };
        } else {
            const { data: bindRows, error: bindErr } = await supabase
                .from("communication_provider_bindings")
                .select("id, channel, scope, location_id, display_label, provider, status, is_primary, secret_ref, inbound_to_e164, config")
                .eq("org_id", ctx.orgId)
                .order("updated_at", { ascending: false });
            if (bindErr) {
                emailResult = { ok: false, skipped_reason: bindErr.message };
            } else {
                const bindList = (bindRows ?? []) as BindingSummary[];
                const allowed = availableComposerChannels(bindList);
                if (!allowed.includes("email")) {
                    emailResult = { ok: false, skipped_reason: "email channel not configured for outbound" };
                } else {
                    const pool = activeOutboundBindings(bindList, "email");
                    const resolvedBindingId = pool[0]?.id ?? null;
                    const toPerson = effectiveRecipient;
                    if (!toPerson) {
                        emailResult = { ok: false, skipped_reason: "no recipient person resolved for email" };
                    } else if (!(await assertRecipientPersonEligibleForDrawerEmail(supabase, ctx.orgId, "opportunities", opportunityId, toPerson))) {
                        emailResult = { ok: false, skipped_reason: "recipient_person_id is not eligible for this opportunity" };
                    } else {
                        const em = await getPersonEmailOrNull(supabase, ctx.orgId, toPerson);
                        if (!em) {
                            emailResult = { ok: false, skipped_reason: "recipient has no usable email" };
                        } else {
                            const lines = created.map((c, i) => `${i + 1}. ${c.enrollee_label ?? "Link"}: ${c.embed_url ?? "(URL unavailable)"}`);
                            const bodyText = [`Enrollment packet link(s) for ${oppName || "your opportunity"}:`, "", ...lines, "", "Thank you."].join("\n");
                            const { data: pktName } = await supabase
                                .from("form_packet_definitions")
                                .select("name")
                                .eq("id", packetDefinitionId)
                                .eq("org_id", ctx.orgId)
                                .maybeSingle();
                            const pn = (pktName as { name?: string } | null)?.name;
                            const subject = typeof pn === "string" && pn.trim() ? `Enrollment: ${pn.trim()}` : "Enrollment forms";

                            const metaOut: Record<string, unknown> = {
                                source: "enrollment_packet_modal",
                                delivery_surface: "enrollment_packet",
                                form_public_link_ids: linkIds,
                                packet_definition_id: packetDefinitionId,
                                opportunity_id: opportunityId,
                                recipient_person_id: toPerson,
                                selected_customer_member_ids: memberIds,
                            };

                            const res = await enqueueCanonicalOutboundMessage({
                                supabase,
                                orgId: ctx.orgId,
                                primaryEntityType: "opportunities",
                                primaryEntityId: opportunityId,
                                channelRaw: "email",
                                toRaw: em,
                                bodyRaw: bodyText,
                                emailSubjectRaw: subject,
                                workflowRunId: null,
                                metadata: metaOut,
                                contextLocationId: null,
                                communicationProviderBindingId: resolvedBindingId,
                            });

                            if (res.skippedReason === "insert_failed" || !res.communicationMessageId) {
                                emailResult = { ok: false, skipped_reason: `enqueue failed (${res.skippedReason ?? "unknown"})` };
                            } else {
                                emailResult = {
                                    ok: true,
                                    communication_message_id: res.communicationMessageId,
                                };
                                void triggerBackendMessagesQueue({ workflow_run_id: null, limit: 25 }).catch(() => {});
                                const se = await emitOpportunityEnrollmentPacketSentSafe({
                                    orgId: ctx.orgId,
                                    opportunityId,
                                    packetDefinitionId,
                                    formPublicLinkIds: linkIds,
                                    recipientPersonId: toPerson,
                                    selectedCustomerMemberIds: memberIds,
                                    communicationMessageId: res.communicationMessageId,
                                });
                                if (se.error) {
                                    console.error("[enrollment-packet-launch] sent projection failed:", se.error.message);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return NextResponse.json({
        created_links: created,
        email: emailResult,
        permission_note: COMMUNICATIONS_SEND_PERMISSION_KEY,
    });
}
