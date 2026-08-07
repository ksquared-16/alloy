import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { assertCommunicationsSendAllowed } from "@/lib/communications/communicationPermissions";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { canonicalSend } from "@/lib/communications/send/canonicalSend";
import { enforceConsentForSend } from "@/lib/communications/v2/consentEnforcement";
import { resolveFamilyCommunicationWorkspace } from "@/lib/communications/v2/familyWorkspace";
import { orchestrateFamilySend, type FamilySendChannel, type RecipientVM } from "@/lib/communications/v2/familyWorkspace";
import { associateOutboundCommunicationToContactAttempt } from "@/lib/lifecycle/associateOutboundCommunicationToContactAttempt";
import {
    composerMarkupToEmailHtml,
    composerMarkupToPlainText,
} from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";

/**
 * POST /api/admin/communications/family-send — UI-5G.
 * Review-first family send: confirm!==true => preflight (no sends); confirm===true => fan out one
 * send per recipient, reusing executeCommunicationsSend (no new transport). Consent enforced per
 * recipient/channel/category via enforceConsentForSend when comms_v2_compliance is on.
 * DARK behind comms_v2_command_center.
 */

/** Stable short token over the authored content, for per-recipient idempotency. */
function contentToken(body: string, subject: string | null): string {
    const s = `${(subject ?? "").trim()}\u0000${body.trim()}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const sendAuth = await assertCommunicationsSendAllowed({
        orgId: ctx.orgId,
        actor: ctx.userId ? { userId: ctx.userId } : null,
    });
    if (!sendAuth.ok) {
        return NextResponse.json(
            { error: sendAuth.message, code: "communications_send_forbidden" },
            { status: 403 }
        );
    }

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const customerId = String(body.customer_id ?? "").trim();
    if (!UUID_RE.test(customerId)) return NextResponse.json({ error: "customer_id must be a UUID" }, { status: 400 });

    const rawIds = Array.isArray(body.recipient_person_ids) ? (body.recipient_person_ids as unknown[]) : [];
    const recipientPersonIds = rawIds.map((x) => String(x).trim()).filter((x) => UUID_RE.test(x));
    if (recipientPersonIds.length === 0) return NextResponse.json({ error: "recipient_person_ids must be a non-empty list of UUIDs" }, { status: 400 });

    const channelRaw = String(body.channel ?? "").toLowerCase();
    if (channelRaw !== "email" && channelRaw !== "sms") {
        return NextResponse.json({ error: "channel must be email or sms (note send is not supported by family-send in 5G)" }, { status: 400 });
    }
    const channel = channelRaw as FamilySendChannel;
    const subject = typeof body.subject === "string" ? body.subject : null;
    const messageRaw = String(body.body ?? "").trim();
    if (!messageRaw) return NextResponse.json({ error: "body is required" }, { status: 400 });
    if (channel === "email" && !(subject && subject.trim())) return NextResponse.json({ error: "subject is required for email" }, { status: 400 });
    const confirm = body.confirm === true;
    const clientToken = typeof body.client_token === "string" ? body.client_token : null;
    const replyToThreadId = typeof body.reply_to_thread_id === "string" ? body.reply_to_thread_id : null;
    const opportunityIdRaw = typeof body.opportunity_id === "string" ? body.opportunity_id.trim() : "";
    const opportunityId = UUID_RE.test(opportunityIdRaw) ? opportunityIdRaw : null;

    let message = messageRaw;
    let bodyIsHtml = false;
    if (channel === "email") {
        const converted = composerMarkupToEmailHtml(messageRaw);
        if (!converted.ok) {
            return NextResponse.json({ error: "Message body contains markup that is not allowed" }, { status: 400 });
        }
        message = converted.html;
        bodyIsHtml = true;
    } else {
        message = composerMarkupToPlainText(messageRaw);
        if (!message.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgCheck = await assertRowOrg(supabase, "customers", customerId, ctx.orgId);
    if (!orgCheck.ok) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const enforceConsent = isCommsV2FlagEnabled("comms_v2_compliance");

    try {
        const vm = await resolveFamilyCommunicationWorkspace(supabase, ctx.orgId, { customerId, composerChannel: channel });
        const recipientById = new Map<string, RecipientVM>();
        for (const g of vm.recipientGroups) for (const r of g.recipients) recipientById.set(r.id, r);

        const result = await orchestrateFamilySend(
            {
                getRecipient: (id) => recipientById.get(id),
                checkConsent: async (personId) => {
                    if (!enforceConsent) return null;
                    const decision = await enforceConsentForSend({ supabase, orgId: ctx.orgId, personId, channel, lifecycleStage: vm.family.lifecycleStage });
                    return { allowed: decision.allowed, reason: decision.reason ?? null };
                },
                runSend: async ({ personId, channel: ch, subject: subj, body: text }) => {
                    // Phase 1 Slice 1: every recipient goes through the canonical
                    // send command INDEPENDENTLY — its own resolution, purpose
                    // check, render, eligibility evaluation, idempotency and
                    // enqueue. One recipient's block cannot suppress another,
                    // and one recipient's success authorizes nobody else.
                    //
                    // The household is context (it scopes which people the
                    // operator may pick); the recipient is always an explicit
                    // canonical Person. This route already required a non-empty
                    // recipient_person_ids list, so no household auto-send path
                    // existed to remove.
                    const send = await canonicalSend({
                        supabase,
                        orgId: ctx.orgId,
                        authorizingUserId: ctx.userId ?? null,
                        sourceCapability: "communications.family_send",
                        recipient: { kind: "person", personId },
                        audience: "external",
                        category: "operational",
                        purpose: "family_communication",
                        channel: ch,
                        primaryEntityType: "persons",
                        primaryEntityId: personId,
                        bodyRaw: text,
                        bodyIsHtml: ch === "email" && bodyIsHtml,
                        subjectRaw: ch === "email" ? (subj ?? null) : null,
                        userAuthored: true,
                        // Per-recipient identity: a three-recipient bulk request
                        // yields three independently protected operations. The
                        // content hash keeps a later, genuinely different message
                        // from colliding with an earlier one when the client
                        // supplies no token.
                        idempotencyKey: `family_send:${clientToken || contentToken(text, subj)}:${personId}`,
                        metadata: {
                            source: "family_send",
                            customer_id: customerId,
                            author_user_id: ctx.userId ?? null,
                            ...(opportunityId ? { opportunity_id: opportunityId } : {}),
                        },
                    });
                    return send.outcome === "sent_to_queue" || send.outcome === "duplicate"
                        ? { ok: true, thread_id: send.threadId ?? null, communication_message_id: send.messageId ?? null }
                        : { ok: false, error: send.message, code: send.reason, thread_id: send.threadId ?? null };
                },
            },
            { recipientPersonIds, channel, subject, body: message, confirm }
        );

        let contact_attempt_association:
            | {
                  associated: boolean;
                  task_id?: string;
                  outcome_key?: string;
                  reason?: string;
                  error?: string;
              }
            | undefined;

        // After a confirmed send with at least one accepted recipient, satisfy open Contact Family
        // work on the opportunity via the existing communications→work seam (no new framework).
        if (
            confirm &&
            opportunityId &&
            ctx.userId &&
            result.mode === "sent" &&
            result.summary.sent > 0
        ) {
            const firstMessageId =
                result.results.find((r) => r.status === "sent" && r.communication_message_id)?.communication_message_id
                ?? null;
            try {
                const assoc = await associateOutboundCommunicationToContactAttempt({
                    supabase,
                    orgId: ctx.orgId,
                    userId: ctx.userId,
                    opportunityId,
                    channel,
                    communicationMessageId: firstMessageId,
                });
                contact_attempt_association =
                    assoc.associated
                        ? { associated: true, task_id: assoc.task_id, outcome_key: assoc.outcome_key }
                        : { associated: false, reason: assoc.reason, error: assoc.error };
            } catch (e) {
                contact_attempt_association = {
                    associated: false,
                    error: e instanceof Error ? e.message : String(e),
                };
            }
        }

        return NextResponse.json({
            ...result,
            contact_attempt_association,
            meta: {
                customer_id: customerId,
                channel,
                confirm,
                consent_enforced: enforceConsent,
                opportunity_id: opportunityId,
                reply_to_thread_id: replyToThreadId,
            },
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Family send failed" }, { status: 500 });
    }
}
