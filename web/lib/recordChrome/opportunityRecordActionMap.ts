/**
 * Maps `record_actions.event_key` for entity_type=opportunity → PATCH /api/admin/opportunities/[id] body.
 * Keeps execution aligned with admin mutation + assertAllowedStatusKey + emitStatusChangedEvent.
 */

export type OpportunityActionPatchBody = {
    status_key?: string | null;
    lost_reason?: string | null;
    /** Terminal detail persisted alongside a `closed` case status (S4 collapse). */
    close_reason_key?: string | null;
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
            // Post-collapse (S4), the case container is simply `open`; qualification is
            // lead work, not a distinct case status.
            return { status_key: "open" };
        case "start_quote":
            // No meaningful case-status change post-collapse — keep the case `open`.
            return { status_key: "open" };
        case "mark_won":
            // Enrollment success is CHILD-grain (mark_enrolled on the child track), not the
            // case container. A successful case stays `open`; there is no "won" case status.
            return { status_key: "open" };
        case "mark_lost":
            return { status_key: "closed", close_reason_key: "lost" };
        default:
            return null;
    }
}
