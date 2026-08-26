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
import { mapToDeliveryState, type CommunicationMessage } from "@/lib/communications/deliveryStateAdapter";
import { emitOpportunityEnrollmentPacketSentSafe } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";
import {
    DEFAULT_ENROLLMENT_EMAIL_BODY_TEMPLATE,
    DEFAULT_ENROLLMENT_EMAIL_SUBJECT_TEMPLATE,
    finalizeEnrollmentOutboundEmail,
    parseEnrollmentEmailTemplatesFromPacketMetadata,
    type EnrollmentPacketLinkRow,
} from "@/lib/forms/packets/enrollmentPacketEmailTemplate";
import { resolvePublicAppOrigin } from "@/lib/publicAppUrl";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The origin these public/embed links are built on.
 *
 * It is read from the ONE canonical public-origin authority and NOT from the request.
 * These links are copied into emails, texts and third-party pages, so their origin has to
 * be a property of the environment rather than of whichever host the operator's browser
 * happened to reach — and a `Host` / `X-Forwarded-Host` header is caller-supplied, so
 * deriving from it let a spoofed header choose where a recipient's link points.
 */
function deriveEmbedBaseUrl(): string | null {
    const decision = resolvePublicAppOrigin();
    return decision.ok ? decision.origin : null;
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

    const embedBase = deriveEmbedBaseUrl();
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
            enrolleeLabel = "Family";
        }

        const labelBase = oppName || "Opportunity";
        const label = mid ? `${labelBase} · ${enrolleeLabel ?? "Enrollee"}` : `${labelBase} · Family`;

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

    type EmailLaunchResult = {
        ok: boolean;
        skipped_reason?: string;
        communication_message_id?: string | null;
        message_status?: string | null;
        provider_message_id?: string | null;
        message_error?: string | null;
        delivery_state?: ReturnType<typeof mapToDeliveryState>;
        queue_wake?: { attempted: boolean; status?: number; error?: string };
    };

    let emailResult: EmailLaunchResult = { ok: false, skipped_reason: wantEmail ? undefined : "copy_only" };

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
                            const { data: pktRow } = await supabase
                                .from("form_packet_definitions")
                                .select("name, metadata")
                                .eq("id", packetDefinitionId)
                                .eq("org_id", ctx.orgId)
                                .maybeSingle();
                            const pkt = pktRow as { name?: string | null; metadata?: unknown } | null;
                            const packetName =
                                typeof pkt?.name === "string" && pkt.name.trim() ? pkt.name.trim() : "Enrollment packet";

                            const metaTemplates = parseEnrollmentEmailTemplatesFromPacketMetadata(pkt?.metadata ?? null);
                            const rawEmailSubject = typeof body.email_subject === "string" ? body.email_subject.trim() : "";
                            const rawEmailBody = typeof body.email_body === "string" ? body.email_body.trim() : "";
                            const operatorSubject =
                                rawEmailSubject || metaTemplates?.subject || DEFAULT_ENROLLMENT_EMAIL_SUBJECT_TEMPLATE;
                            const operatorBody = rawEmailBody || metaTemplates?.body || DEFAULT_ENROLLMENT_EMAIL_BODY_TEMPLATE;

                            let householdDisplay = oppName || "your family";
                            const custId =
                                oppRow && typeof (oppRow as { customer_id?: string | null }).customer_id === "string"
                                    ? (oppRow as { customer_id: string }).customer_id.trim()
                                    : "";
                            if (custId) {
                                const { data: cust } = await supabase
                                    .from("customers")
                                    .select("name")
                                    .eq("org_id", ctx.orgId)
                                    .eq("id", custId)
                                    .maybeSingle();
                                const cn = (cust as { name?: string | null } | null)?.name;
                                if (typeof cn === "string" && cn.trim()) householdDisplay = cn.trim();
                            }

                            const { data: personRow } = await supabase
                                .from("persons")
                                .select("first_name, last_name")
                                .eq("org_id", ctx.orgId)
                                .eq("id", toPerson)
                                .maybeSingle();
                            const pr = personRow as { first_name?: string | null; last_name?: string | null } | null;
                            const recipientName =
                                [pr?.first_name, pr?.last_name]
                                    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                                    .join(" ")
                                    .trim() || "there";

                            const { data: orgRow } = await supabase
                                .from("organizations")
                                .select("name")
                                .eq("id", ctx.orgId)
                                .maybeSingle();
                            const organizationName =
                                typeof (orgRow as { name?: string | null } | null)?.name === "string"
                                    ? String((orgRow as { name: string }).name).trim()
                                    : "";

                            const linkRows: EnrollmentPacketLinkRow[] = created.map((c) => ({
                                embed_url: c.embed_url,
                                enrollee_label: c.enrollee_label,
                            }));

                            const finalized = finalizeEnrollmentOutboundEmail({
                                operatorSubject,
                                operatorBody,
                                rows: linkRows,
                                householdName: householdDisplay,
                                recipientName,
                                packetName,
                                organizationName,
                            });

                            if (!finalized.ok) {
                                emailResult = { ok: false, skipped_reason: finalized.error };
                            } else {
                                const metaOut: Record<string, unknown> = {
                                    source: "enrollment_packet_modal",
                                    delivery_surface: "enrollment_packet",
                                    form_public_link_ids: linkIds,
                                    packet_definition_id: packetDefinitionId,
                                    opportunity_id: opportunityId,
                                    recipient_person_id: toPerson,
                                    selected_customer_member_ids: memberIds,
                                    enrollment_packet_email_operator_subject: operatorSubject,
                                    enrollment_packet_email_operator_body: operatorBody,
                                    enrollment_packet_email_sent_subject: finalized.subject,
                                    enrollment_packet_email_sent_body: finalized.body,
                                };

                                const res = await enqueueCanonicalOutboundMessage({
                                    supabase,
                                    orgId: ctx.orgId,
                                    primaryEntityType: "opportunities",
                                    primaryEntityId: opportunityId,
                                    channelRaw: "email",
                                    toRaw: em,
                                    bodyRaw: finalized.body,
                                    emailSubjectRaw: finalized.subject,
                                    workflowRunId: null,
                                    metadata: metaOut,
                                    contextLocationId: null,
                                    communicationProviderBindingId: resolvedBindingId,
                                });

                                if (res.skippedReason === "insert_failed" || !res.communicationMessageId) {
                                    emailResult = { ok: false, skipped_reason: `enqueue failed (${res.skippedReason ?? "unknown"})` };
                                } else {
                                    const queueWake = await triggerBackendMessagesQueue({ workflow_run_id: null, limit: 25 });
                                    const { data: msgAfter } = await supabase
                                        .from("communication_messages")
                                        .select("status, provider_message_id, error, direction, channel, metadata, delivered_at")
                                        .eq("id", res.communicationMessageId)
                                        .maybeSingle();
                                    const row = msgAfter as {
                                        status?: string | null;
                                        provider_message_id?: string | null;
                                        error?: string | null;
                                        direction?: string | null;
                                        channel?: string | null;
                                        metadata?: Record<string, unknown> | null;
                                        delivered_at?: string | null;
                                    } | null;
                                    const asMsg: CommunicationMessage = {
                                        direction: row?.direction ?? "outbound",
                                        channel: row?.channel ?? "email",
                                        status: row?.status ?? null,
                                        provider_message_id: row?.provider_message_id ?? null,
                                        metadata: row?.metadata ?? null,
                                        delivered_at: row?.delivered_at ?? null,
                                    };
                                    const delivery_state = mapToDeliveryState(asMsg);
                                    emailResult = {
                                        ok: true,
                                        communication_message_id: res.communicationMessageId,
                                        message_status: row?.status ?? null,
                                        provider_message_id: row?.provider_message_id ?? null,
                                        message_error: typeof row?.error === "string" && row.error.trim() ? row.error.trim() : null,
                                        delivery_state,
                                        queue_wake: queueWake,
                                    };
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
    }

    return NextResponse.json({
        created_links: created,
        email: emailResult,
        permission_note: COMMUNICATIONS_SEND_PERMISSION_KEY,
    });
}
