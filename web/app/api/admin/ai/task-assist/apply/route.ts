import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateTaskAssistApplyRequest } from "@/lib/agent/taskAssist/taskAssistApplyRouteValidation";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    assertCommunicationsSendAllowed,
} from "@/lib/communications/communicationPermissions";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";
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
    const exec = await executeCommunicationsSend({
        supabase,
        orgId: ctx.orgId,
        quickMessage: false,
        primaryEntityType: merged.entity_type,
        primaryEntityId: merged.entity_id,
        channel: merged.channel,
        textRaw: merged.draft_body.trim(),
        subjectRawEmail: merged.channel === "email" ? merged.draft_subject ?? "" : undefined,
        bindingIdOpt: binding_id,
        recipientPersonIdRaw: sel.person_id.trim(),
        toRawInput: "",
        sendMetadataAugment: {
            source: "task_assist_apply_v1",
            task_assist_suggestion_id: merged.suggestion_id,
            task_assist_agent_key: TASK_ASSIST_AGENT_KEY,
        },
    });

    if (!exec.ok) {
        return NextResponse.json(
            {
                ok: false,
                error: exec.error,
                code: exec.code ?? null,
                thread_id: exec.thread_id ?? null,
            },
            { status: exec.status }
        );
    }

    return NextResponse.json({
        ok: true,
        send: {
            communication_message_id: exec.communication_message_id,
            thread_id: exec.thread_id,
            channel: exec.channel,
            process_trigger_attempted_note: exec.process_trigger_attempted_note,
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
