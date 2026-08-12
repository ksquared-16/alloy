import { NextRequest, NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { FREE_TEXT_RECIPIENT_MIGRATION_MESSAGE } from "@/lib/communications/recipients/typedRecipient";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    assertCommunicationsSendAllowed,
    assertCommunicationsSendAllowedForThread,
} from "@/lib/communications/communicationPermissions";
import { canonicalSend } from "@/lib/communications/send/canonicalSend";
import { resolveSendRecipientMode } from "@/lib/communications/send/resolveSendRecipientMode";
import { associateOutboundCommunicationToContactAttempt } from "@/lib/lifecycle/associateOutboundCommunicationToContactAttempt";


const CATEGORIES = ["transactional", "operational", "marketing", "emergency"] as const;
type SendCategory = (typeof CATEGORIES)[number];

/** Explicit only — never inferred, never defaulted to transactional. */
function normalizeCategory(raw: unknown): SendCategory | null {
    const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    return (CATEGORIES as readonly string[]).includes(v) ? (v as SendCategory) : null;
}

/** Stable short token over authored content, for idempotency identity. */
function contentToken(body: string, subject: string | null): string {
    const s = `${(subject ?? "").trim()}\u0000${body.trim()}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Match threads route normalization. */
function normalizeEntityTypeParam(raw: string): string | null {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s === "opportunity") return "opportunities";
    if (s === "customer") return "customers";
    if (s === "job") return "jobs";
    if (s === "schedule") return "schedules";
    if (s === "contact") return "contacts";
    return s;
}

function normalizeChannel(raw: string): "sms" | "email" | "in_app" | null {
    const x = raw.trim().toLowerCase();
    if (x === "sms") return "sms";
    if (x === "email") return "email";
    if (x === "in_app" || x === "in-app") return "in_app";
    return null;
}

/**
 * POST /api/admin/communications/send — guarded composer enqueue (canonical path + message_queued).
 * requireAdminOrOps + {@link COMMUNICATIONS_SEND_PERMISSION_KEY} via role_permission_grants (admin/ops bypass;
 * legacy alias ops.messaging.write). Denied requests return 403 before enqueue.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

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
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const quickMessage = body.quick_message === true;
    let entityType = normalizeEntityTypeParam(String(body.entity_type ?? ""));
    let entityId = String(body.entity_id ?? "").trim();
    const channel = normalizeChannel(String(body.channel ?? ""));
    const textRaw = String(body.body ?? "").trim();

    // ---- Phase 1 Slice 1: typed recipient is the only recipient authority ----
    //
    // This route previously accepted a free-text `to` / `to_address` with no
    // person reference. That is precisely why the Phase 0 eligibility gate was
    // inert here: with no resolvable person there is no consent to evaluate.
    //
    // Free-text is now refused outright. There is deliberately NO fallback —
    // a downgrade path would recreate the defect Phase 0 closed. Both existing
    // UI callers (QuickMessageModal, ComposerV2) already send
    // recipient_person_id, so nothing legitimate is broken by this.
    const freeTextTo = String(body.to ?? body.to_address ?? "").trim();
    if (freeTextTo) {
        return NextResponse.json(
            { error: FREE_TEXT_RECIPIENT_MIGRATION_MESSAGE, code: "free_text_recipient_unsupported" },
            { status: 400 }
        );
    }
    const subjectRawEmail =
        channel === "email" && typeof body.subject === "string" ? body.subject : undefined;
    const bindingIdOpt = typeof body.binding_id === "string" ? body.binding_id.trim() : "";
    const recipientPersonIdRaw = typeof body.recipient_person_id === "string" ? body.recipient_person_id.trim() : "";
    // Reply into an existing conversation whose sender is not a known Person.
    // Carries a thread id only — the destination is derived server-side.
    const replyThreadIdRaw = typeof body.thread_id === "string" ? body.thread_id.trim() : "";

    if (!channel) return NextResponse.json({ error: "channel must be sms, email, or in_app" }, { status: 400 });
    if (!textRaw) return NextResponse.json({ error: "body is required" }, { status: 400 });
    if (channel === "in_app" && quickMessage) {
        return NextResponse.json({ error: "quick_message supports email and sms only" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // LOCATION half of send authorization. `assertCommunicationsSendAllowed`
    // above answered "may this user send at all"; this answers "may they send in
    // THIS conversation" — so a Riverside-only operator cannot answer a Lakeside
    // family even though they hold `communications.send`.
    //
    // Only for replies into an existing conversation, which is where a location
    // exists to enforce. A brand-new send has no conversation yet, and its
    // recipient authorization is covered by the checks that follow.
    if (replyThreadIdRaw) {
        const scopeAuth = await assertCommunicationsSendAllowedForThread({
            supabase,
            orgId: ctx.orgId,
            threadId: replyThreadIdRaw,
        });
        if (!scopeAuth.ok) {
            return NextResponse.json(
                { error: scopeAuth.message, code: "communications_send_forbidden" },
                { status: 403 }
            );
        }
    }

    // Recipient-mode contract lives in one pure function so it is testable
    // directly and cannot drift between callers.
    const recipientMode = resolveSendRecipientMode(body as Record<string, unknown>);
    if (recipientMode.mode === "invalid" && recipientMode.code === "ambiguous_recipient_mode") {
        return NextResponse.json({ error: recipientMode.error, code: recipientMode.code }, { status: 400 });
    }

    // Thread-bound reply into an existing conversation.
    //
    // Placed BEFORE the person-oriented entity validation on purpose: an
    // unidentified conversation anchors to `communications_unknown`, which that
    // validation rejects — so running it first would refuse precisely the replies
    // this mode exists to enable. The anchor comes from the thread, never the
    // client, so the reply cannot be redirected into a different conversation.
    if (replyThreadIdRaw) {
        if (recipientMode.mode === "invalid") {
            return NextResponse.json({ error: recipientMode.error, code: recipientMode.code }, { status: 400 });
        }
        const replyCategory = normalizeCategory(body.category);
        if (!replyCategory) {
            return NextResponse.json(
                { error: "category is required (transactional, operational, marketing, or emergency).", code: "missing_category" },
                { status: 400 }
            );
        }

        // Org-scoped load. A foreign-org or nonexistent thread simply is not found,
        // so isolation comes from the query rather than from a separate check.
        const { data: threadRow, error: threadErr } = await supabase
            .from("communication_threads")
            .select("id, primary_entity_type, primary_entity_id, channel")
            .eq("id", replyThreadIdRaw)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (threadErr) {
            return NextResponse.json({ error: "Could not load the conversation.", code: "thread_lookup_failed" }, { status: 500 });
        }
        if (!threadRow) {
            return NextResponse.json(
                { error: "That conversation was not found in this organization.", code: "thread_not_accessible" },
                { status: 404 }
            );
        }

        const anchor = threadRow as Record<string, unknown>;
        const replySend = await canonicalSend({
            supabase,
            orgId: ctx.orgId,
            authorizingUserId: ctx.userId ?? null,
            sourceCapability: "communications.send",
            recipient: { kind: "canonical_thread", threadId: replyThreadIdRaw },
            audience: "external",
            category: replyCategory,
            purpose: "operator_direct_message",
            channel,
            // The conversation's own anchor, so the outbound reply rejoins the
            // thread the operator was reading instead of deriving a new one.
            primaryEntityType: String(anchor.primary_entity_type ?? ""),
            primaryEntityId: String(anchor.primary_entity_id ?? ""),
            bodyRaw: textRaw,
            subjectRaw: subjectRawEmail ?? null,
            userAuthored: true,
            communicationProviderBindingId: bindingIdOpt || null,
            idempotencyKey: `comms_reply:${replyThreadIdRaw}:${contentToken(textRaw, subjectRawEmail ?? null)}`,
            metadata: { source: "communications_thread_reply" },
        });
        return NextResponse.json(
            {
                ok: replySend.outcome === "sent_to_queue" || replySend.outcome === "duplicate",
                outcome: replySend.outcome,
                reason: replySend.reason,
                message: replySend.message,
                message_id: replySend.messageId ?? null,
                thread_id: replySend.threadId ?? replyThreadIdRaw,
            },
            { status: replySend.outcome === "invalid" ? 400 : 200 }
        );
    }

    if (quickMessage) {
        if (!recipientPersonIdRaw || !UUID_RE.test(recipientPersonIdRaw)) {
            return NextResponse.json({ error: "quick_message requires recipient_person_id (UUID)" }, { status: 400 });
        }
        if (channel !== "email" && channel !== "sms") {
            return NextResponse.json({ error: "quick_message channel must be email or sms" }, { status: 400 });
        }
        /** Person-anchored threads; client entity_type/entity_id are ignored for quick send. */
        entityType = "persons";
        entityId = recipientPersonIdRaw;
    } else {
        if (
            !entityType ||
            (entityType !== "opportunities" && entityType !== "jobs" && entityType !== "persons")
        ) {
            return NextResponse.json(
                { error: "entity_type must be opportunities, jobs, or persons" },
                { status: 400 }
            );
        }
        if (!entityId || !UUID_RE.test(entityId)) return NextResponse.json({ error: "Valid entity_id required" }, { status: 400 });
    }

    if (entityType === "persons") {
        if (!(await assertRowOrg(supabase, "persons", entityId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Person not found" }, { status: 404 });
        }
    } else if (entityType === "opportunities" || entityType === "jobs") {
        const table = entityType === "jobs" ? "jobs" : "opportunities";
        if (!(await assertRowOrg(supabase, table, entityId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Entity not found" }, { status: 404 });
        }
    } else {
        return NextResponse.json({ error: "Invalid entity_type" }, { status: 500 });
    }

    const primaryEntityType = entityType;

    // Phase 1 Slice 1: the canonical send command owns resolution, classification,
    // rendering, eligibility, snapshots and enqueue. This route no longer
    // delegates to the legacy adapter and owns none of that policy itself.
    //
    // A person recipient is required. Free-text was refused earlier; there is no
    // external-operational fallback, because a downgrade from "unresolvable
    // person" would recreate the defect Phase 0 closed.
    if (!recipientPersonIdRaw || !UUID_RE.test(recipientPersonIdRaw)) {
        return NextResponse.json(
            { error: FREE_TEXT_RECIPIENT_MIGRATION_MESSAGE, code: "typed_recipient_required" },
            { status: 400 }
        );
    }

    // Classification is explicit. `purpose` is server-owned: a client value is
    // never read, so a caller cannot widen what this capability may emit.
    const category = normalizeCategory(body.category);
    if (!category) {
        return NextResponse.json(
            { error: "category is required (transactional, operational, marketing, or emergency).", code: "missing_category" },
            { status: 400 }
        );
    }

    const send = await canonicalSend({
        supabase,
        orgId: ctx.orgId,
        authorizingUserId: ctx.userId ?? null,
        sourceCapability: "communications.send",
        recipient: { kind: "person", personId: recipientPersonIdRaw },
        audience: "external",
        category,
        purpose: "operator_direct_message",
        channel,
        primaryEntityType,
        primaryEntityId: entityId,
        bodyRaw: textRaw,
        subjectRaw: subjectRawEmail ?? null,
        userAuthored: true,
        communicationProviderBindingId: bindingIdOpt || null,
        // Stable per (recipient, content). A double-click or retry returns the
        // existing message rather than sending twice.
        idempotencyKey: `comms_send:${recipientPersonIdRaw}:${contentToken(textRaw, subjectRawEmail ?? null)}`,
        metadata: { source: "communications_send", author_user_id: ctx.userId ?? null },
    });

    if (send.outcome !== "sent_to_queue" && send.outcome !== "duplicate") {
        return NextResponse.json(
            {
                error: send.message,
                code: send.reason,
                outcome: send.outcome,
                available_channels: send.availableChannels ?? null,
                thread_id: send.threadId ?? null,
            },
            {
                status:
                    send.outcome === "blocked" ? 409
                    : send.outcome === "failed" ? 500
                    : send.outcome === "needs_selection" ? 409
                    : 400,
            }
        );
    }

    const exec = {
        communication_message_id: send.messageId ?? null,
        thread_id: send.threadId ?? null,
        channel,
    };

    let contact_attempt_association:
        | {
              associated: boolean;
              task_id?: string;
              outcome_key?: string;
              /** Why nothing advanced (e.g. `no_configured_sufficiency`) — surfaced to the operator. */
              reason?: string;
              error?: string;
          }
        | undefined;
    if (
        primaryEntityType === "opportunities" &&
        (channel === "email" || channel === "sms") &&
        ctx.userId
    ) {
        // TRANSACTION BOUNDARY: the message row is COMMITTED and the delivery queue already triggered
        // above. Contact-attempt association is DOWNSTREAM bookkeeping — it must never convert a
        // delivered message into a failed response (the operator would re-send and double-message the
        // family). Failures are reported honestly on the payload, never thrown and never swallowed.
        try {
            const assoc = await associateOutboundCommunicationToContactAttempt({
                supabase,
                orgId: ctx.orgId,
                userId: ctx.userId,
                opportunityId: entityId,
                channel,
                communicationMessageId: exec.communication_message_id,
            });
            contact_attempt_association =
                assoc.associated ?
                    { associated: true, task_id: assoc.task_id, outcome_key: assoc.outcome_key }
                :   { associated: false, reason: assoc.reason, error: assoc.error };
        } catch (e) {
            contact_attempt_association = {
                associated: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    return NextResponse.json({
        ok: true,
        communication_message_id: exec.communication_message_id,
        thread_id: exec.thread_id,
        channel: exec.channel,
        permission_note: sendAuth.ok ? COMMUNICATIONS_SEND_PERMISSION_KEY : undefined,
        outcome: send.outcome,
        contact_attempt_association,
    });
}
