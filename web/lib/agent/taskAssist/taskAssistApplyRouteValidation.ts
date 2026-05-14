import type { TaskAssistApplyIntentV1, TaskAssistSelectedRecipientV1, TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import { mergeTaskAssistProposalForSendApply } from "@/lib/agent/taskAssist/taskAssistApplyMerge";
import { validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { validateTaskAssistSuggestionV1ForSendApply } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";

const APPLY_BODY_KEYS = new Set([
    "proposal",
    "apply_intent",
    "selected_recipient",
    "final_subject",
    "final_body",
    "channel",
    "binding_id",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function isSendNowIntent(v: unknown): v is { kind: "send_communication_now" } {
    return isRecord(v) && v.kind === "send_communication_now";
}

function isSelectedRecipient(v: unknown): v is TaskAssistSelectedRecipientV1 {
    if (!isRecord(v)) return false;
    const pid = typeof v.person_id === "string" ? v.person_id.trim() : "";
    return isTaskAssistV1Uuid(pid);
}

/** Minimal structural check before spread-merge; full contract enforced by {@link validateTaskAssistSuggestionV1ForSendApply}. */
function isTaskAssistProposalShell(v: unknown): v is TaskAssistSuggestionV1 {
    if (!isRecord(v)) return false;
    if (v.version !== 1) return false;
    if (v.agent_key !== TASK_ASSIST_AGENT_KEY) return false;
    if (v.entity_type !== "opportunities") return false;
    if (typeof v.entity_id !== "string" || !isTaskAssistV1Uuid(v.entity_id.trim())) return false;
    if (!Array.isArray(v.recipient_candidates)) return false;
    return true;
}

export type ParsedTaskAssistApplyOk = {
    merged: TaskAssistSuggestionV1;
    binding_id: string;
};

export function parseAndValidateTaskAssistApplyRequest(
    body: unknown,
    ctx: { orgId: string; actorUserId: string }
): { ok: true; value: ParsedTaskAssistApplyOk } | { ok: false; error: string; status: number; message?: string; validation_errors?: string[] } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", status: 400, message: "Body must be a JSON object." };
    }

    const workflowErrs = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(body);
    if (workflowErrs.length) {
        return {
            ok: false,
            error: "WORKFLOW_KEYS_FORBIDDEN",
            status: 400,
            message: workflowErrs[0],
        };
    }

    for (const k of Object.keys(body)) {
        if (!APPLY_BODY_KEYS.has(k)) {
            return {
                ok: false,
                error: "UNKNOWN_BODY_KEYS",
                status: 400,
                message: `Unexpected key: ${k}`,
            };
        }
    }

    const proposalRaw = body.proposal;
    if (!isTaskAssistProposalShell(proposalRaw)) {
        return {
            ok: false,
            error: "PROPOSAL_INVALID",
            status: 400,
            message: "proposal must be a TaskAssistSuggestionV1-shaped object (version 1, task_assist, opportunities).",
        };
    }

    if (String(proposalRaw.org_id ?? "").trim() !== ctx.orgId) {
        return { ok: false, error: "ORG_MISMATCH", status: 403, message: "proposal.org_id must match the current org." };
    }
    if (String(proposalRaw.actor_user_id ?? "").trim() !== ctx.actorUserId) {
        return { ok: false, error: "ACTOR_MISMATCH", status: 403, message: "proposal.actor_user_id must match the current user." };
    }

    if (proposalRaw.approval_required !== true) {
        return { ok: false, error: "APPROVAL_REQUIRED", status: 400, message: "approval_required must be true on the proposal." };
    }

    if (proposalRaw.scheduled_for_iso != null && String(proposalRaw.scheduled_for_iso).trim() !== "") {
        return {
            ok: false,
            error: "PROPOSAL_SCHEDULED_FORBIDDEN",
            status: 400,
            message: "proposal.scheduled_for_iso must be null or empty for V1 apply.",
        };
    }
    if (proposalRaw.reminder_due_at_iso != null && String(proposalRaw.reminder_due_at_iso).trim() !== "") {
        return {
            ok: false,
            error: "PROPOSAL_REMINDER_FORBIDDEN",
            status: 400,
            message: "proposal.reminder_due_at_iso must be null or empty for V1 apply.",
        };
    }

    const applyIntent = body.apply_intent as TaskAssistApplyIntentV1 | undefined;
    if (!isSendNowIntent(applyIntent)) {
        return { ok: false, error: "APPLY_INTENT_INVALID", status: 400, message: "apply_intent.kind must be send_communication_now." };
    }

    const selected = body.selected_recipient;
    if (!isSelectedRecipient(selected)) {
        return { ok: false, error: "SELECTED_RECIPIENT_INVALID", status: 400, message: "selected_recipient.person_id must be a UUID." };
    }

    const channelRaw = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "";
    if (channelRaw !== "sms" && channelRaw !== "email") {
        return { ok: false, error: "CHANNEL_UNSUPPORTED", status: 400, message: "channel must be sms or email." };
    }
    const channel = channelRaw as "sms" | "email";

    const proposalChannel = String(proposalRaw.channel ?? "").trim().toLowerCase();
    if (proposalChannel !== channel) {
        return {
            ok: false,
            error: "CHANNEL_MISMATCH",
            status: 400,
            message: "channel must match proposal.channel.",
        };
    }

    const final_body = typeof body.final_body === "string" ? body.final_body.trim() : "";
    if (!final_body) {
        return { ok: false, error: "FINAL_BODY_REQUIRED", status: 400, message: "final_body is required and must be non-empty." };
    }

    let final_subject: string | null = null;
    if (channel === "email") {
        const sub = typeof body.final_subject === "string" ? body.final_subject.trim() : "";
        if (!sub) {
            return {
                ok: false,
                error: "FINAL_SUBJECT_REQUIRED",
                status: 400,
                message: "final_subject is required for email.",
            };
        }
        final_subject = sub;
    } else if (body.final_subject != null && String(body.final_subject).trim() !== "") {
        return { ok: false, error: "FINAL_SUBJECT_UNEXPECTED", status: 400, message: "final_subject must be omitted for sms." };
    }

    const binding_id = typeof body.binding_id === "string" ? body.binding_id.trim() : "";

    const merged = mergeTaskAssistProposalForSendApply({
        proposal: proposalRaw,
        selectedRecipient: { person_id: selected.person_id.trim() },
        channel,
        finalBody: final_body,
        finalSubject: channel === "email" ? final_subject : null,
        applyIntent,
    });

    const validation_errors = validateTaskAssistSuggestionV1ForSendApply(merged);
    if (validation_errors.length) {
        return {
            ok: false,
            error: "PROPOSAL_VALIDATION_FAILED",
            status: 400,
            validation_errors,
            message: "Merged proposal failed send validation.",
        };
    }

    return { ok: true, value: { merged, binding_id } };
}
