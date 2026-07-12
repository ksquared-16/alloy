/**
 * Timeline card evidence (Timeline archetype).
 *
 * Operational question: "What has recently happened on this record?"
 *
 * Pure derivation over the Operational Context — never fabricates events. Sources
 * activity from `resolveLeadActivityPreview` (notes, communication, tasks, activity
 * signals, created/updated metadata). Max 5 events, newest-first heuristic.
 *
 * @see docs/platform/operator/universal-universal-card-archetypes.md (Timeline)
 */

import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type TimelineEvent = {
    /** Human-readable: "Today", "Yesterday", "Jun 18", or "" when unknown. */
    when: string;
    /** What happened: "Note", "Communication", "Status", "Created", etc. */
    label: string;
    detail: string | null;
};

export type TimelineCardEvidence = {
    /** Max 5 most recent events. */
    events: TimelineEvent[];
    hasEvents: boolean;
    /** "3 recent events" | "No recent activity" */
    answerLine: string;
    supportingLine: string | null;
    statusChip: string | null;
    statusTone: "neutral";
    isEmpty: boolean;
};

/** Build timeline evidence from the Operational Context (pure derivation, no fetch). */
export function buildTimelineCardEvidence(context: OperationalContext): TimelineCardEvidence {
    const preview = resolveLeadActivityPreview(context.truth as ProofRuntimeRecord);

    const events: TimelineEvent[] = preview.slice(0, 5).map((entry) => ({
        when: entry.at ?? "",
        label: entry.label,
        detail: entry.detail,
    }));

    const hasEvents = events.length > 0;

    let answerLine: string;
    if (!hasEvents) {
        answerLine = "No recent activity";
    } else if (events.length === 1) {
        answerLine = "1 recent event";
    } else {
        answerLine = `${events.length} recent events`;
    }

    const firstWhen = hasEvents && events[0] ? events[0].when : null;
    const supportingLine = firstWhen ? `Last: ${firstWhen}` : null;

    return {
        events,
        hasEvents,
        answerLine,
        supportingLine,
        statusChip: null,
        statusTone: "neutral",
        isEmpty: !hasEvents,
    };
}
