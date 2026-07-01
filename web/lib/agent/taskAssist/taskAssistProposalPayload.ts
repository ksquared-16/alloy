import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import {
    isTaskAssistV1Uuid,
    validateTaskAssistSuggestionV1ForPropose,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";

/** Keys allowed on persisted `payload` JSON (TaskAssistSuggestionV1 surface). */
export const TASK_ASSIST_PROPOSAL_PAYLOAD_KEYS = new Set([
    "version",
    "agent_key",
    "suggestion_id",
    "generated_at_iso",
    "org_id",
    "actor_user_id",
    "source_surface",
    "task_type",
    "entity_type",
    "entity_id",
    "context_summary",
    "recipient_candidates",
    "selected_recipient",
    "channel",
    "draft_subject",
    "draft_body",
    "scheduled_for_iso",
    "reminder_due_at_iso",
    "assumptions",
    "missing_inputs",
    "warnings",
    "validation_errors",
    "confidence",
    "approval_required",
    "apply_intent",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function isTaskAssistProposalShell(v: unknown): v is TaskAssistSuggestionV1 {
    if (!isRecord(v)) return false;
    if (v.version !== 1) return false;
    if (v.agent_key !== TASK_ASSIST_AGENT_KEY) return false;
    if (v.entity_type !== "opportunities") return false;
    if (typeof v.entity_id !== "string" || !isTaskAssistV1Uuid(v.entity_id.trim())) return false;
    if (!Array.isArray(v.recipient_candidates)) return false;
    return true;
}

/**
 * Parse and validate a client `payload` for `task_assist_proposals.payload`.
 * Enforces unknown-key rejection, workflow-key rejection, and propose-time Task Assist V1 rules.
 */
export function parseTaskAssistProposalPayloadForPersistence(
    raw: unknown
): { ok: true; suggestion: TaskAssistSuggestionV1 } | { ok: false; error: string; message: string; validation_errors?: string[] } {
    if (!isRecord(raw)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "payload must be a JSON object." };
    }

    const workflowErrs = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(raw);
    if (workflowErrs.length) {
        return { ok: false, error: "WORKFLOW_KEYS_FORBIDDEN", message: workflowErrs[0] ?? "Forbidden workflow key on payload." };
    }

    for (const k of Object.keys(raw)) {
        if (!TASK_ASSIST_PROPOSAL_PAYLOAD_KEYS.has(k)) {
            return { ok: false, error: "UNKNOWN_PAYLOAD_KEYS", message: `Unexpected payload key: ${k}` };
        }
    }

    if (!isTaskAssistProposalShell(raw)) {
        return {
            ok: false,
            error: "PAYLOAD_INVALID",
            message: "payload must be a TaskAssistSuggestionV1-shaped object (version 1, task_assist, opportunities).",
        };
    }

    const suggestion = raw as TaskAssistSuggestionV1;
    const validation_errors = validateTaskAssistSuggestionV1ForPropose(suggestion);
    if (validation_errors.length > 0) {
        return {
            ok: false,
            error: "PAYLOAD_VALIDATION_FAILED",
            message: "Proposal payload failed Task Assist V1 validation.",
            validation_errors,
        };
    }

    return { ok: true, suggestion };
}

export function proposalTypeFromTaskType(taskType: TaskAssistSuggestionV1["task_type"]): "draft_sms" | "draft_email" | null {
    if (taskType === "draft_sms") return "draft_sms";
    if (taskType === "draft_email") return "draft_email";
    return null;
}

export function parseOptionalExpiresAtIso(raw: unknown): { ok: true; expiresAt: string | null } | { ok: false; message: string } {
    if (raw == null || raw === "") return { ok: true, expiresAt: null };
    if (typeof raw !== "string") return { ok: false, message: "expires_at must be a string ISO timestamp or null." };
    const t = raw.trim();
    if (!t) return { ok: true, expiresAt: null };
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) return { ok: false, message: "expires_at must be a parseable ISO-8601 timestamp." };
    return { ok: true, expiresAt: new Date(ms).toISOString() };
}
