import type { TaskAssistApplyIntentV1, TaskAssistSelectedRecipientV1, TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";

/**
 * Merge operator-approved fields into a proposal for send validation / apply payload.
 * Mirrors server-side merge in {@link parseAndValidateTaskAssistApplyRequest}.
 */
export function mergeTaskAssistProposalForSendApply(params: {
    proposal: TaskAssistSuggestionV1;
    selectedRecipient: TaskAssistSelectedRecipientV1;
    channel: "sms" | "email";
    finalBody: string;
    finalSubject: string | null;
    applyIntent: Extract<TaskAssistApplyIntentV1, { kind: "send_communication_now" }>;
}): TaskAssistSuggestionV1 {
    const { proposal, selectedRecipient, channel, finalBody, finalSubject, applyIntent } = params;
    return {
        ...proposal,
        channel,
        task_type: channel === "sms" ? "draft_sms" : "draft_email",
        selected_recipient: selectedRecipient,
        draft_body: finalBody,
        draft_subject: channel === "email" ? finalSubject : null,
        apply_intent: applyIntent,
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        approval_required: true,
        assumptions: Array.isArray(proposal.assumptions) ? proposal.assumptions : [],
        missing_inputs: Array.isArray(proposal.missing_inputs) ? proposal.missing_inputs : [],
        warnings: Array.isArray(proposal.warnings) ? proposal.warnings : [],
        validation_errors: [],
        confidence: proposal.confidence ?? { mode: "deterministic" },
    };
}
