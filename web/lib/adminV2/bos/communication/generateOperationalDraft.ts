/**
 * Operational communication draft provider — deterministic-first with optional AI hook (future).
 */

import {
    resolveCommunicationObjective,
    type OperationalCommunicationObjective,
} from "@/lib/adminV2/bos/communication/communicationObjectives";
import {
    synthesizeOperationalCommunicationDraft,
    type CommunicationDraftSynthesisInput,
    type SynthesizedOperationalCommunicationDraft,
} from "@/lib/adminV2/bos/communication/communicationDraftSynthesis";
import { resolveRecipientGreetingFromOverview } from "@/lib/adminV2/bos/communication/resolveRecipientGreeting";
import type { OperationalRecommendationHandoffCopy } from "@/lib/adminV2/bos/operationalRecommendationHandoff";

export type GenerateOperationalDraftInput = {
    overviewData: Record<string, unknown> | null | undefined;
    copy: OperationalRecommendationHandoffCopy;
    channel?: "sms" | "email";
    recipientFirstName?: string | null;
    recipientHouseholdGreeting?: string | null;
    siteOrOrgName?: string | null;
    operatorDisplayName?: string | null;
};

export type GeneratedOperationalDraft = SynthesizedOperationalCommunicationDraft & {
    objective: OperationalCommunicationObjective;
    operatorGuidance: string;
};

function extractSiteOrOrgName(overviewData: Record<string, unknown> | null | undefined): string | null {
    const identity = overviewData?._identity as Record<string, unknown> | null | undefined;
    const site =
        typeof identity?.site_name === "string"
            ? identity.site_name.trim()
            : typeof overviewData?._site_name === "string"
              ? overviewData._site_name.trim()
              : null;
    return site || null;
}

/**
 * Generate operator-ready communication draft from operational context.
 * Currently deterministic-only; AI-assisted mode reserved for future provider wiring.
 */
export function generateOperationalDraft(input: GenerateOperationalDraftInput): GeneratedOperationalDraft {
    const objective = resolveCommunicationObjective({
        overviewData: input.overviewData,
        copy: input.copy,
    });
    const greeting = resolveRecipientGreetingFromOverview(input.overviewData);
    const synthesisInput: CommunicationDraftSynthesisInput = {
        objective,
        channel: input.channel ?? "email",
        recipientFirstName: input.recipientFirstName ?? greeting.firstName,
        recipientHouseholdGreeting: input.recipientHouseholdGreeting ?? greeting.householdGreeting,
        siteOrOrgName: input.siteOrOrgName ?? extractSiteOrOrgName(input.overviewData),
        operatorDisplayName: input.operatorDisplayName ?? null,
        operationalReason: input.copy.whyNow?.trim() || null,
        internalGuidance: input.copy.doNext?.trim() || null,
    };
    const draft = synthesizeOperationalCommunicationDraft(synthesisInput);
    return {
        ...draft,
        objective,
        operatorGuidance: input.copy.doNext.trim() || input.copy.operationalRead.trim(),
    };
}
