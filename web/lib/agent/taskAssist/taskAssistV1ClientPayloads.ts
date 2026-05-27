import { mergeTaskAssistProposalForSendApply } from "@/lib/agent/taskAssist/taskAssistApplyMerge";
import type { TaskAssistRecipientCandidateV1, TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";

export type TaskAssistProposeRequestBodyV1 = {
    entity_type: "opportunities";
    entity_id: string;
    channel: "sms" | "email";
    instruction: string;
    communication_objective?: string | null;
    synthesized_draft?: {
        subject?: string | null;
        body: string;
        sms_body?: string | null;
    } | null;
};

export function buildTaskAssistProposeRequestBody(params: {
    entityId: string;
    channel: "sms" | "email";
    instruction: string;
    communicationObjective?: string | null;
    synthesizedDraft?: TaskAssistProposeRequestBodyV1["synthesized_draft"];
}): TaskAssistProposeRequestBodyV1 {
    const body: TaskAssistProposeRequestBodyV1 = {
        entity_type: "opportunities",
        entity_id: params.entityId.trim(),
        channel: params.channel,
        instruction: params.instruction.trim(),
    };
    const objective = params.communicationObjective?.trim();
    if (objective) body.communication_objective = objective;
    const emailBody = params.synthesizedDraft?.body?.trim() ?? "";
    const smsBody = params.synthesizedDraft?.sms_body?.trim() ?? "";
    if (emailBody || smsBody) {
        body.synthesized_draft = {
            subject: params.synthesizedDraft?.subject ?? null,
            body: emailBody || smsBody,
            sms_body: smsBody || null,
        };
    }
    return body;
}

export type TaskAssistApplyRequestBodyV1 = {
    proposal: TaskAssistSuggestionV1;
    apply_intent: { kind: "send_communication_now" };
    selected_recipient: { person_id: string };
    final_body: string;
    final_subject?: string;
    channel: "sms" | "email";
    binding_id?: string;
};

/**
 * Build the apply JSON body. **`final_body`** is the operator-edited text (not `proposal.draft_body`).
 */
export function buildTaskAssistApplyRequestBody(params: {
    proposal: TaskAssistSuggestionV1;
    selectedPersonId: string;
    finalBody: string;
    finalSubject: string;
    channel: "sms" | "email";
    bindingId?: string;
}): TaskAssistApplyRequestBodyV1 {
    const binding_id = params.bindingId?.trim() || undefined;
    const out: TaskAssistApplyRequestBodyV1 = {
        proposal: params.proposal,
        apply_intent: { kind: "send_communication_now" },
        selected_recipient: { person_id: params.selectedPersonId.trim() },
        final_body: params.finalBody.trim(),
        channel: params.channel,
    };
    if (params.channel === "email") {
        out.final_subject = params.finalSubject.trim();
    }
    if (binding_id) out.binding_id = binding_id;
    return out;
}

/** For client-side send button gating — same merge shape as the apply route. */
export function mergeForSendApplyPreview(
    proposal: TaskAssistSuggestionV1,
    selectedPersonId: string,
    finalBody: string,
    finalSubject: string,
    channel: "sms" | "email"
): TaskAssistSuggestionV1 {
    return mergeTaskAssistProposalForSendApply({
        proposal,
        selectedRecipient: { person_id: selectedPersonId.trim() },
        channel,
        finalBody: finalBody.trim(),
        finalSubject: channel === "email" ? finalSubject.trim() : null,
        applyIntent: { kind: "send_communication_now" },
    });
}

export function recipientHasChannelHint(
    candidates: TaskAssistRecipientCandidateV1[],
    personId: string,
    channel: "sms" | "email"
): boolean {
    const pid = personId.trim();
    const row = candidates.find((c) => String(c.person_id ?? "").trim() === pid);
    if (!row) return false;
    return channel === "sms" ? row.has_sms === true : row.has_email === true;
}
