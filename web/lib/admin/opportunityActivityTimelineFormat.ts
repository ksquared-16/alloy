/**
 * Opportunity Activity Log / queue chrome — thin config on generic activity formatters.
 */

import {
    type ActivityTimelineEventInput,
    type ActivityTimelineFormatOptions,
    formatActivityQueueNotesBlobPreview,
    formatActivityTimelineEvent,
    formatQueueNoteDateTime,
    getActivityTimelineActorLabel,
    humanizeSnakeCaseToken,
} from "@/lib/admin/activityTimelineFormat";

/** Status-key display labels used for enrollment / growth CRM (payload.summary, transitions). */
export const OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS: Record<string, string> = {
    new_inquiry: "New Inquiry",
    contact_attempted: "Contact Attempted",
    tour_scheduled: "Tour Scheduled",
};

const OPPORTUNITY_EVENT_TYPE_LABELS: Record<string, string> = {
    opportunity_status_changed: "Status changed",
    entity_status_changed: "Status changed",
    message_received: "SMS received",
    message_sent: "SMS sent",
    note_added: "Note added",
    action_executed: "Action completed",
};

/** Default options for opportunity workflow_events and related UI. */
export const opportunityActivityTimelineOptions: ActivityTimelineFormatOptions = {
    eventTypeLabels: OPPORTUNITY_EVENT_TYPE_LABELS,
    statusKeyLabels: OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS,
    statusTransitionEventTypes: ["opportunity_status_changed", "entity_status_changed"],
    actionEventTypes: ["action_executed"],
};

export function formatOpportunityActivityTimelineEvent(event: ActivityTimelineEventInput) {
    return formatActivityTimelineEvent(event, opportunityActivityTimelineOptions);
}

export function getWorkflowActivityEventTitle(eventType: string | null): string {
    return formatActivityTimelineEvent(
        { event_type: eventType, payload: {} },
        opportunityActivityTimelineOptions
    ).title;
}

export function getWorkflowActivityEventDetail(eventType: string | null, payload: Record<string, unknown>): string | null {
    return formatActivityTimelineEvent(
        { event_type: eventType, payload },
        opportunityActivityTimelineOptions
    ).detail;
}

export function getWorkflowActivityActorLabel(payload: Record<string, unknown>, eventType: string | null): string {
    return getActivityTimelineActorLabel(payload, eventType, opportunityActivityTimelineOptions);
}

/** Re-export for queue rows & tests */
export { formatQueueNoteDateTime } from "@/lib/admin/activityTimelineFormat";

/** Opportunity CRM queue: composed from generic note blob formatter */
/** Queue row: date/time before note body for triage scan. */
export function formatOpportunityQueueNotesPreview(
    raw: string | null | undefined,
    displayTimeZone?: string
): string | null {
    return formatActivityQueueNotesBlobPreview(raw, { dateFirst: true, displayTimeZone });
}

/** Humanize with enrollment status key map (for callers/tests) */
export function humanizeOpportunitySnakeCaseToken(raw: string): string {
    return humanizeSnakeCaseToken(raw, OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS);
}

export {
    formatActivitySummaryHumanizingKeys,
    formatActivityTimelineEvent,
    humanizeSnakeCaseToken,
} from "@/lib/admin/activityTimelineFormat";
