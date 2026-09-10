/**
 * Communications card evidence (Summary archetype).
 *
 * Operational question: "What is the current outreach status for this family?"
 *
 * Pure derivation over `context.signals.communications` — never fabricates thread
 * counts, message bodies, or contact preferences. Sources: scheduled sends count
 * and next follow-up timestamp, both projected from `subjectVm.summaries.reminders`
 * by the Operational Context adapter.
 *
 * @see docs/platform/operator/universal-card-archetypes.md (Summary)
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type CommunicationsCardEvidence = {
    /** Number of outgoing messages scheduled for future delivery. */
    scheduledSendCount: number;
    /** ISO timestamp for next configured follow-up, null when none. */
    nextFollowUpAt: string | null;
    /** True when any scheduled send or follow-up is pending. */
    hasOutreach: boolean;
    /** Primary answer line: "2 scheduled sends" | "Follow-up due Jun 30" | "No recent outreach" */
    answerLine: string;
    supportingLine: string | null;
    statusChip: string | null;
    statusTone: "due" | "neutral";
    isEmpty: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Build communications evidence from the Operational Context (pure derivation, no fetch). */
export function buildCommunicationsCardEvidence(context: OperationalContext): CommunicationsCardEvidence {
    const comms = context.signals.communications;
    const { scheduledSendCount, nextFollowUpAt, hasOutreach } = comms;

    if (scheduledSendCount > 0) {
        return {
            scheduledSendCount,
            nextFollowUpAt,
            hasOutreach: true,
            answerLine: `${scheduledSendCount} scheduled send${scheduledSendCount === 1 ? "" : "s"}`,
            supportingLine: "Scheduled sends are pending delivery — open inbox to review or cancel.",
            statusChip: `${scheduledSendCount} scheduled`,
            statusTone: "due",
            isEmpty: false,
        };
    }

    if (nextFollowUpAt) {
        const when = trimOrNull(nextFollowUpAt)?.slice(0, 10) ?? nextFollowUpAt;
        return {
            scheduledSendCount: 0,
            nextFollowUpAt,
            hasOutreach: true,
            answerLine: `Follow-up due ${when}`,
            supportingLine: "Latest thread context available in inbox.",
            statusChip: "Follow-up due",
            statusTone: "due",
            isEmpty: false,
        };
    }

    return {
        scheduledSendCount: 0,
        nextFollowUpAt: null,
        hasOutreach: false,
        answerLine: "No recent outreach",
        supportingLine: "Message sending stays action-driven or inbox-driven.",
        statusChip: null,
        statusTone: "neutral",
        isEmpty: true,
    };
}
