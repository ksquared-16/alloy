/**
 * Communication objectives — internal operator guidance maps to customer-facing draft intent.
 * Recommendation copy must NOT become outbound message body.
 */

import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { OperationalRecommendationHandoffCopy } from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import { suggestionActionForReasonCode } from "@/lib/agent/needsAttentionSuggestion/suggestionActionMap";

export const OPERATIONAL_COMMUNICATION_OBJECTIVES = [
    "initial_outreach",
    "follow_up",
    "schedule_tour",
    "reengagement",
    "missing_information",
    "payment_followup",
    "enrollment_next_steps",
] as const;

export type OperationalCommunicationObjective = (typeof OPERATIONAL_COMMUNICATION_OBJECTIVES)[number];

const OBJECTIVE_BY_ATTENTION_REASON: Partial<Record<string, OperationalCommunicationObjective>> = {
    stale_new_inquiry: "initial_outreach",
    follow_up_date_passed: "follow_up",
    tour_date_passed: "schedule_tour",
    stale_quote_followup: "follow_up",
    waiting_on_family: "follow_up",
    waiting_on_documents: "missing_information",
    waiting_on_payment: "payment_followup",
    high_value_stale: "reengagement",
    mid_funnel_stale: "reengagement",
    stale_qualified: "enrollment_next_steps",
};

const OBJECTIVE_BY_ACTION_KEY: Partial<Record<string, OperationalCommunicationObjective>> = {
    send_first_response: "initial_outreach",
    complete_follow_up: "follow_up",
    complete_scheduled_event_follow_up: "schedule_tour",
    request_documents: "missing_information",
    confirm_payment_status: "payment_followup",
    reengage_priority_record: "reengagement",
};

function catalogAttentionKeyFromRecommendation(rec: OperationalRecommendationV1): string | null {
    const fromFingerprint = rec.stale_state_check?.fingerprint_inputs?.primary_reason_code?.trim();
    if (fromFingerprint) return fromFingerprint;
    const primarySignal = rec.grounding_signals.find((s) => s.code === "primary_attention_reason");
    return primarySignal?.reason_code?.trim() || null;
}

function objectiveFromRecommendation(rec: OperationalRecommendationV1 | null): OperationalCommunicationObjective | null {
    if (!rec) return null;
    const actionKey = rec.recommended_action?.key?.trim();
    if (actionKey && OBJECTIVE_BY_ACTION_KEY[actionKey]) {
        return OBJECTIVE_BY_ACTION_KEY[actionKey]!;
    }
    const reason = catalogAttentionKeyFromRecommendation(rec);
    if (reason && OBJECTIVE_BY_ATTENTION_REASON[reason]) {
        return OBJECTIVE_BY_ATTENTION_REASON[reason]!;
    }
    if (rec.recommendation_type === "communication") return "initial_outreach";
    if (rec.recommendation_type === "conversion") return "enrollment_next_steps";
    return null;
}

/**
 * Resolve communication objective from recommendation / attention context.
 */
export function resolveCommunicationObjective(args: {
    overviewData: Record<string, unknown> | null | undefined;
    copy?: OperationalRecommendationHandoffCopy | null;
}): OperationalCommunicationObjective {
    const raw = args.overviewData?._operational_recommendation;
    if (raw && typeof raw === "object" && (raw as OperationalRecommendationV1).version === 1) {
        const fromRec = objectiveFromRecommendation(raw as OperationalRecommendationV1);
        if (fromRec) return fromRec;
    }

    const attention = args.overviewData?._operational_attention;
    if (attention && typeof attention === "object") {
        const code = (attention as { primary_reason?: { code?: string } }).primary_reason?.code?.trim();
        if (code && OBJECTIVE_BY_ATTENTION_REASON[code]) {
            return OBJECTIVE_BY_ATTENTION_REASON[code]!;
        }
        if (code) {
            const mapped = suggestionActionForReasonCode(code);
            if (mapped.key === "send_first_response") return "initial_outreach";
            if (mapped.key === "complete_scheduled_event_follow_up") return "schedule_tour";
            if (mapped.action_family === "send_message") return "follow_up";
        }
    }

    const doNext = args.copy?.doNext?.toLowerCase() ?? "";
    if (/first response|new inquiry|warm.*response/.test(doNext)) return "initial_outreach";
    if (/tour|schedule/.test(doNext)) return "schedule_tour";
    if (/payment|invoice/.test(doNext)) return "payment_followup";
    if (/document|paperwork|form/.test(doNext)) return "missing_information";
    if (/re-engage|reengage|stale/.test(doNext)) return "reengagement";
    if (/enrollment|application|next step/.test(doNext)) return "enrollment_next_steps";

    return "follow_up";
}

export function communicationObjectiveLabel(objective: OperationalCommunicationObjective): string {
    switch (objective) {
        case "initial_outreach":
            return "Initial outreach";
        case "follow_up":
            return "Follow-up";
        case "schedule_tour":
            return "Tour scheduling";
        case "reengagement":
            return "Re-engagement";
        case "missing_information":
            return "Missing information";
        case "payment_followup":
            return "Payment follow-up";
        case "enrollment_next_steps":
            return "Enrollment next steps";
        default:
            return "Message draft";
    }
}
