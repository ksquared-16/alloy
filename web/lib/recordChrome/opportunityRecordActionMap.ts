/**
 * Maps `record_actions.event_key` for entity_type=opportunity → PATCH /api/admin/opportunities/[id] body.
 * Keeps execution aligned with admin mutation + assertAllowedStatusKey + emitStatusChangedEvent.
 */

export type OpportunityActionPatchBody = {
    status_key?: string | null;
    lost_reason?: string | null;
};

/** Actions implemented in this slice — unknown keys are ignored at execution time. */
export const OPPORTUNITY_RECORD_ACTION_EVENT_KEYS = [
    "qualify_opportunity",
    "start_quote",
    "mark_won",
    "mark_lost",
] as const;

export type OpportunityRecordActionEventKey = (typeof OPPORTUNITY_RECORD_ACTION_EVENT_KEYS)[number];

export function mapOpportunityRecordActionToPatch(eventKey: string): OpportunityActionPatchBody | null {
    switch (eventKey) {
        case "qualify_opportunity":
            return { status_key: "qualified" };
        case "start_quote":
            return { status_key: "needs_a_quote" };
        case "mark_won":
            return { status_key: "won" };
        case "mark_lost":
            return { status_key: "lost", lost_reason: "Marked lost (workspace)" };
        default:
            return null;
    }
}
