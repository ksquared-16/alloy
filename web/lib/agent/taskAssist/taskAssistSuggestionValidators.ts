import type {
    TaskAssistApplyIntentV1,
    TaskAssistRecipientCandidateV1,
    TaskAssistSuggestionV1,
    TaskAssistTaskTypeV1,
    TaskAssistV1EntityType,
    TaskAssistV1SendChannel,
} from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY, TASK_ASSIST_V1_ENTITY_TYPES, TASK_ASSIST_V1_SEND_CHANNELS } from "@/lib/agent/taskAssist/types";

/** Match `POST /api/admin/communications/send` entity UUID checks. */
export const TASK_ASSIST_V1_UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Keys that must not appear on parsed proposal JSON merged from clients (workflow / automation graph).
 * Narrow set to avoid false positives on unrelated domain objects.
 */
export const TASK_ASSIST_V1_FORBIDDEN_WORKFLOW_KEYS = [
    "workflow_id",
    "workflow_ids",
    "workflows",
    "workflow_actions",
    "workflow_definition",
    "proposed_workflow",
    "workflow_conditions",
    "workflow_triggers",
    "automation_workflow",
    "automation_workflows",
] as const;

export function isTaskAssistV1Uuid(value: string): boolean {
    return TASK_ASSIST_V1_UUID_RE.test(String(value ?? "").trim());
}

export function validateTaskAssistV1EntityType(entityType: string): string[] {
    const e: string[] = [];
    const t = String(entityType ?? "").trim() as TaskAssistV1EntityType | string;
    if (!TASK_ASSIST_V1_ENTITY_TYPES.includes(t as TaskAssistV1EntityType)) {
        e.push("task_assist_v1:entity_type_unsupported");
    }
    return e;
}

export function validateTaskAssistV1SendChannel(channel: string): string[] {
    const e: string[] = [];
    const c = String(channel ?? "").trim() as TaskAssistV1SendChannel | string;
    if (!TASK_ASSIST_V1_SEND_CHANNELS.includes(c as TaskAssistV1SendChannel)) {
        e.push("task_assist_v1:channel_unsupported");
    }
    return e;
}

export function validateTaskAssistV1ScheduledSendDisallowed(scheduledForIso: string | null): string[] {
    const e: string[] = [];
    if (scheduledForIso != null && String(scheduledForIso).trim() !== "") {
        e.push("task_assist_v1:scheduled_send_disallowed");
    }
    return e;
}

export function validateTaskAssistV1ApprovalRequired(approvalRequired: boolean): string[] {
    const e: string[] = [];
    if (approvalRequired !== true) {
        e.push("task_assist_v1:approval_required_must_be_true");
    }
    return e;
}

export function validateTaskAssistV1DraftBodyRequired(draftBody: string): string[] {
    const e: string[] = [];
    if (String(draftBody ?? "").trim() === "") {
        e.push("task_assist_v1:draft_body_required");
    }
    return e;
}

export function validateTaskAssistV1SingleSelectedRecipient(selected: TaskAssistSuggestionV1["selected_recipient"]): string[] {
    const e: string[] = [];
    if (selected == null) {
        e.push("task_assist_v1:selected_recipient_required");
        return e;
    }
    const pid = String(selected.person_id ?? "").trim();
    if (!isTaskAssistV1Uuid(pid)) {
        e.push("task_assist_v1:selected_recipient_person_id_invalid");
    }
    return e;
}

/**
 * Reject duplicate person_ids in `recipient_candidates` (bulk / ambiguous targeting).
 */
export function validateTaskAssistV1RecipientCandidatesNoDuplicatePersonIds(
    candidates: TaskAssistRecipientCandidateV1[]
): string[] {
    const e: string[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
        const pid = String(c.person_id ?? "").trim();
        if (seen.has(pid)) {
            e.push("task_assist_v1:duplicate_recipient_person_id");
            return e;
        }
        seen.add(pid);
    }
    return e;
}

export function validateTaskAssistV1RecipientChannelAddress(
    channel: TaskAssistV1SendChannel,
    selectedPersonId: string,
    candidates: TaskAssistRecipientCandidateV1[]
): string[] {
    const e: string[] = [];
    const want = String(selectedPersonId ?? "").trim();
    const row = candidates.find((c) => String(c.person_id ?? "").trim() === want);
    if (!row) {
        e.push("task_assist_v1:selected_recipient_not_in_candidates");
        return e;
    }
    if (channel === "sms" && row.has_sms !== true) {
        e.push("task_assist_v1:recipient_missing_sms_address");
    }
    if (channel === "email" && row.has_email !== true) {
        e.push("task_assist_v1:recipient_missing_email_address");
    }
    return e;
}

export function validateTaskAssistV1FollowUpDeferred(
    taskType: TaskAssistTaskTypeV1,
    applyIntent: TaskAssistApplyIntentV1
): string[] {
    const e: string[] = [];
    if (taskType === "set_opportunity_follow_up") {
        e.push("task_assist_v1:follow_up_task_type_deferred");
    }
    if (applyIntent.kind === "set_opportunity_follow_up") {
        e.push("task_assist_v1:follow_up_apply_intent_deferred");
    }
    return e;
}

export function validateTaskAssistV1InAppDeferred(taskType: TaskAssistTaskTypeV1, channel: TaskAssistSuggestionV1["channel"]): string[] {
    const e: string[] = [];
    if (taskType === "draft_in_app") {
        e.push("task_assist_v1:draft_in_app_deferred");
    }
    if (channel === "in_app") {
        e.push("task_assist_v1:in_app_channel_deferred");
    }
    return e;
}

export function validateTaskAssistV1ReminderFieldDeferred(reminderDueAtIso: string | null): string[] {
    const e: string[] = [];
    if (reminderDueAtIso != null && String(reminderDueAtIso).trim() !== "") {
        e.push("task_assist_v1:reminder_due_at_deferred");
    }
    return e;
}

export function validateTaskAssistV1TaskTypeChannelAlignment(taskType: TaskAssistTaskTypeV1, channel: TaskAssistSuggestionV1["channel"]): string[] {
    const e: string[] = [];
    if (taskType === "draft_sms" && channel !== "sms") {
        e.push("task_assist_v1:task_type_channel_mismatch");
    }
    if (taskType === "draft_email" && channel !== "email") {
        e.push("task_assist_v1:task_type_channel_mismatch");
    }
    return e;
}

export function validateTaskAssistV1VersionAndAgent(suggestion: Pick<TaskAssistSuggestionV1, "version" | "agent_key">): string[] {
    const e: string[] = [];
    if (suggestion.version !== 1) {
        e.push("task_assist_v1:version_must_be_1");
    }
    if (suggestion.agent_key !== TASK_ASSIST_AGENT_KEY) {
        e.push("task_assist_v1:agent_key_invalid");
    }
    return e;
}

/**
 * For future routes that accept `Record<string, unknown>` before narrowing to {@link TaskAssistSuggestionV1}.
 */
export function validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(record: Record<string, unknown>): string[] {
    const e: string[] = [];
    for (const k of TASK_ASSIST_V1_FORBIDDEN_WORKFLOW_KEYS) {
        if (Object.prototype.hasOwnProperty.call(record, k)) {
            e.push(`task_assist_v1:workflow_key_forbidden:${k}`);
        }
    }
    return e;
}

export function validateTaskAssistV1HasAtLeastOneRecipientCandidate(candidates: TaskAssistRecipientCandidateV1[]): string[] {
    const e: string[] = [];
    if (!candidates.length) {
        e.push("task_assist_v1:no_recipient_candidates");
    }
    return e;
}

/** At least one candidate must be reachable on the requested channel (hints only until send route resolves). */
export function validateTaskAssistV1EligibleRecipientForChannel(
    channel: TaskAssistV1SendChannel,
    candidates: TaskAssistRecipientCandidateV1[]
): string[] {
    const e: string[] = [];
    const ok = candidates.some((c) => (channel === "sms" ? c.has_sms === true : c.has_email === true));
    if (!ok) {
        e.push("task_assist_v1:no_eligible_recipient_for_channel");
    }
    return e;
}

export function validateTaskAssistV1ProposeApplyIntentNone(applyIntent: TaskAssistApplyIntentV1): string[] {
    const e: string[] = [];
    if (applyIntent.kind !== "none") {
        e.push("task_assist_v1:propose_requires_apply_intent_none");
    }
    return e;
}

export function validateTaskAssistV1ProposeSelectedRecipientNull(selected: TaskAssistSuggestionV1["selected_recipient"]): string[] {
    const e: string[] = [];
    if (selected != null) {
        e.push("task_assist_v1:propose_requires_selected_recipient_null");
    }
    return e;
}

/**
 * Validation for **proposal generation** responses (`apply_intent: none`, no selected recipient yet).
 * @see validateTaskAssistSuggestionV1ForSendApply — use that on apply after the operator picks a recipient.
 */
export function validateTaskAssistSuggestionV1ForPropose(suggestion: TaskAssistSuggestionV1): string[] {
    const e: string[] = [];
    e.push(...validateTaskAssistV1VersionAndAgent(suggestion));
    e.push(...validateTaskAssistV1EntityType(suggestion.entity_type));
    e.push(...validateTaskAssistV1ScheduledSendDisallowed(suggestion.scheduled_for_iso));
    e.push(...validateTaskAssistV1ApprovalRequired(suggestion.approval_required));
    e.push(...validateTaskAssistV1FollowUpDeferred(suggestion.task_type, suggestion.apply_intent));
    e.push(...validateTaskAssistV1InAppDeferred(suggestion.task_type, suggestion.channel));
    e.push(...validateTaskAssistV1ReminderFieldDeferred(suggestion.reminder_due_at_iso));
    e.push(...validateTaskAssistV1ProposeApplyIntentNone(suggestion.apply_intent));
    e.push(...validateTaskAssistV1ProposeSelectedRecipientNull(suggestion.selected_recipient));

    if (suggestion.task_type !== "draft_sms" && suggestion.task_type !== "draft_email") {
        e.push("task_assist_v1:task_type_must_be_draft_sms_or_draft_email_for_propose");
    }

    e.push(...validateTaskAssistV1SendChannel(suggestion.channel));
    e.push(...validateTaskAssistV1TaskTypeChannelAlignment(suggestion.task_type, suggestion.channel));
    e.push(...validateTaskAssistV1DraftBodyRequired(suggestion.draft_body));
    e.push(...validateTaskAssistV1RecipientCandidatesNoDuplicatePersonIds(suggestion.recipient_candidates));
    e.push(...validateTaskAssistV1HasAtLeastOneRecipientCandidate(suggestion.recipient_candidates));

    const ch = String(suggestion.channel).trim() as TaskAssistV1SendChannel | string;
    if (TASK_ASSIST_V1_SEND_CHANNELS.includes(ch as TaskAssistV1SendChannel)) {
        e.push(
            ...validateTaskAssistV1EligibleRecipientForChannel(ch as TaskAssistV1SendChannel, suggestion.recipient_candidates)
        );
    }

    if (!isTaskAssistV1Uuid(String(suggestion.entity_id ?? "").trim())) {
        e.push("task_assist_v1:entity_id_invalid");
    }

    return dedupeErrors(e);
}

/**
 * Full deterministic validation for **send-now** apply (`apply_intent.kind === "send_communication_now"`).
 * Does not perform DB or permission checks — those belong on the apply route.
 */
export function validateTaskAssistSuggestionV1ForSendApply(suggestion: TaskAssistSuggestionV1): string[] {
    const e: string[] = [];
    e.push(...validateTaskAssistV1VersionAndAgent(suggestion));
    e.push(...validateTaskAssistV1EntityType(suggestion.entity_type));
    e.push(...validateTaskAssistV1ScheduledSendDisallowed(suggestion.scheduled_for_iso));
    e.push(...validateTaskAssistV1ApprovalRequired(suggestion.approval_required));
    e.push(...validateTaskAssistV1FollowUpDeferred(suggestion.task_type, suggestion.apply_intent));
    e.push(...validateTaskAssistV1InAppDeferred(suggestion.task_type, suggestion.channel));
    e.push(...validateTaskAssistV1ReminderFieldDeferred(suggestion.reminder_due_at_iso));

    if (suggestion.apply_intent.kind !== "send_communication_now") {
        e.push("task_assist_v1:apply_intent_must_be_send_communication_now");
        return e;
    }

    if (suggestion.task_type !== "draft_sms" && suggestion.task_type !== "draft_email") {
        e.push("task_assist_v1:task_type_must_be_draft_sms_or_draft_email_for_send");
    }

    e.push(...validateTaskAssistV1SendChannel(suggestion.channel));
    e.push(...validateTaskAssistV1TaskTypeChannelAlignment(suggestion.task_type, suggestion.channel));
    e.push(...validateTaskAssistV1DraftBodyRequired(suggestion.draft_body));
    e.push(...validateTaskAssistV1SingleSelectedRecipient(suggestion.selected_recipient));
    e.push(...validateTaskAssistV1RecipientCandidatesNoDuplicatePersonIds(suggestion.recipient_candidates));

    const sel = suggestion.selected_recipient;
    if (sel && isTaskAssistV1Uuid(String(sel.person_id ?? "").trim())) {
        const ch = String(suggestion.channel).trim() as TaskAssistV1SendChannel | string;
        if (TASK_ASSIST_V1_SEND_CHANNELS.includes(ch as TaskAssistV1SendChannel)) {
            e.push(
                ...validateTaskAssistV1RecipientChannelAddress(ch as TaskAssistV1SendChannel, sel.person_id, suggestion.recipient_candidates)
            );
        }
    }

    if (!isTaskAssistV1Uuid(String(suggestion.entity_id ?? "").trim())) {
        e.push("task_assist_v1:entity_id_invalid");
    }

    return dedupeErrors(e);
}

function dedupeErrors(errors: string[]): string[] {
    return [...new Set(errors)];
}
