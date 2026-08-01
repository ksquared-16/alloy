import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateTaskAssistApplyRequest } from "@/lib/agent/taskAssist/taskAssistApplyRouteValidation";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    assertCommunicationsSendAllowed,
} from "@/lib/communications/communicationPermissions";
import { canonicalSend } from "@/lib/communications/send/canonicalSend";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST `/api/admin/ai/task-assist/apply` — operator-approved send for Task Assist V1 (Card 4).
 *
 * Validates merged proposal with {@link validateTaskAssistSuggestionV1ForSendApply}, then enqueues via
 * {@link executeCommunicationsSend} (same path as `POST /api/admin/communications/send`).
 *
 * **Body:** `{ proposal, apply_intent, selected_recipient, final_body, channel, final_subject? (email), binding_id? }`
 *
 * **Does not** insert `communication_messages` directly; **does not** use legacy `messages` / `messages_outbox`.
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
            { ok: false, error: sendAuth.message, code: "communications_send_forbidden" },
            { status: 403 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = parseAndValidateTaskAssistApplyRequest(body, { orgId: ctx.orgId, actorUserId: ctx.userId });
    if (!parsed.ok) {
        return NextResponse.json(
            {
                ok: false,
                error: parsed.error,
                message: parsed.message ?? null,
                validation_errors: parsed.validation_errors ?? null,
            },
            { status: parsed.status }
        );
    }

    const { merged, binding_id } = parsed.value;
    const sel = merged.selected_recipient;
    if (!sel) {
        return NextResponse.json({ ok: false, error: "INTERNAL", message: "Missing selected recipient after validation." }, { status: 500 });
    }

    const supabase = createAdminClient();

    // Phase 1 Slice 1: the canonical send command owns recipient resolution,
    // classification, rendering, eligibility and enqueue.
    //
    // THE BOS BOUNDARY, preserved: the assistant PROPOSES; the operator
    // confirms (validated upstream by parseTaskAssistApply); the SERVER
    // re-resolves. `sel.person_id` is a proposal, not authority — the resolver
    // verifies the person exists in this org and owns a usable identity. An
    // AI-supplied raw address cannot enter here at all: the typed recipient has
    // no field for one.
    const send = await canonicalSend({
        supabase,
        orgId: ctx.orgId,
        authorizingUserId: ctx.userId ?? null,
        sourceCapability: "ai.task_assist",
        recipient: { kind: "person", personId: sel.person_id.trim() },
        audience: "external",
        category: "operational",
        purpose: "assisted_operator_message",
        channel: merged.channel === "email" ? "email" : "sms",
        primaryEntityType: merged.entity_type,
        primaryEntityId: merged.entity_id,
        bodyRaw: merged.draft_body.trim(),
        subjectRaw: merged.channel === "email" ? (merged.draft_subject ?? "") : null,
        userAuthored: true,
        communicationProviderBindingId: binding_id || null,
        // Stable per suggestion+recipient: an operator double-click, or a retry
        // after a network blip, must not send twice.
        idempotencyKey: `task_assist:${merged.suggestion_id}:${sel.person_id.trim()}`,
        metadata: {
            source: "task_assist_apply_v1",
            assist_proposal_id: merged.suggestion_id,
            author_user_id: ctx.userId ?? null,
        },
    });

    if (send.outcome !== "sent_to_queue" && send.outcome !== "duplicate") {
        return NextResponse.json(
            {
                ok: false,
                error: send.message,
                code: send.reason,
                outcome: send.outcome,
                available_channels: send.availableChannels ?? null,
                thread_id: send.threadId ?? null,
            },
            { status: send.outcome === "blocked" ? 409 : send.outcome === "failed" ? 500 : 400 }
        );
    }
    const exec = {
        ok: true as const,
        communication_message_id: send.messageId ?? null,
        thread_id: send.threadId ?? null,
        channel: merged.channel,
    };

    return NextResponse.json({
        ok: true,
        send: {
            communication_message_id: exec.communication_message_id,
            thread_id: exec.thread_id,
            channel: exec.channel,
            // `duplicate` is reported as success: the message IS queued, it was
            // simply not queued a second time.
            outcome: send.outcome,
            permission_note: COMMUNICATIONS_SEND_PERMISSION_KEY,
        },
        task_assist: {
            suggestion_id: merged.suggestion_id,
            entity_type: merged.entity_type,
            entity_id: merged.entity_id,
            channel: merged.channel,
            recipient_person_id: sel.person_id.trim(),
        },
    });
}
