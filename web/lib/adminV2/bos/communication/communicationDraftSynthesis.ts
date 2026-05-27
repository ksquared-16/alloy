/**
 * Deterministic communication draft synthesis — operator-ready outbound copy from objectives.
 * Channel-specific composition lives in communicationDraftChannelCompose.
 */

import type { OperationalCommunicationObjective } from "@/lib/adminV2/bos/communication/communicationObjectives";
import {
    composeOperationalCommunicationByChannel,
    type ChannelComposeFacts,
} from "@/lib/adminV2/bos/communication/communicationDraftChannelCompose";

export type CommunicationDraftSynthesisMode = "deterministic" | "ai_assisted";

export type SynthesizedOperationalCommunicationDraft = {
    objective: OperationalCommunicationObjective;
    subject: string | null;
    body: string;
    sms_body: string;
    mode: CommunicationDraftSynthesisMode;
};

export type CommunicationDraftSynthesisInput = {
    objective: OperationalCommunicationObjective;
    channel: "sms" | "email";
    recipientFirstName?: string | null;
    recipientHouseholdGreeting?: string | null;
    siteOrOrgName?: string | null;
    operatorDisplayName?: string | null;
    operationalReason?: string | null;
    internalGuidance?: string | null;
};

function toComposeFacts(input: CommunicationDraftSynthesisInput): ChannelComposeFacts {
    return {
        recipientFirstName: input.recipientFirstName ?? null,
        recipientHouseholdGreeting: input.recipientHouseholdGreeting ?? null,
        siteOrOrgName: input.siteOrOrgName ?? null,
        operatorDisplayName: input.operatorDisplayName ?? null,
    };
}

/**
 * Pure deterministic synthesis — email and SMS bodies composed independently per objective.
 */
export function synthesizeOperationalCommunicationDraft(
    input: CommunicationDraftSynthesisInput
): SynthesizedOperationalCommunicationDraft {
    const composed = composeOperationalCommunicationByChannel(input.objective, toComposeFacts(input));
    return {
        objective: input.objective,
        subject: composed.subject,
        body: composed.emailBody,
        sms_body: composed.smsBody,
        mode: "deterministic",
    };
}

/** Pick channel-appropriate body from synthesized draft. */
export function synthesizedDraftBodyForChannel(
    draft: SynthesizedOperationalCommunicationDraft,
    channel: "sms" | "email"
): string {
    return channel === "sms" ? draft.sms_body : draft.body;
}
