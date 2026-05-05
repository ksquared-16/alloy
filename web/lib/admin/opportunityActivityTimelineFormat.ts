/**
 * Opportunity Activity Log / queue chrome — thin config on generic activity formatters.
 */

import {
    type ActivityQueueNotesPreviewParts,
    type ActivityTimelineEventInput,
    type ActivityTimelineFormatOptions,
    formatActivityQueueNotesBlobPreview,
    formatActivityQueueNotesBlobPreviewParts,
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

function stripLeadingNoteTimestampLike(raw: string): string {
    let s = raw.trim();
    if (!s) return s;
    // Normalize common double-time artifacts before stripping.
    s = s.replace(
        /^(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+(?:AM|PM))\s+·\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+—\s+/i,
        "$1 — "
    );
    // Remove "h:mm AM/PM — " prefix.
    s = s.replace(/^\d{1,2}:\d{2}\s*(?:AM|PM)\s+—\s+/i, "");
    // Remove "MM/DD/YYYY h:mm AM/PM — " prefix.
    s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+—\s+/i, "");
    // Remove "MM/DD/YYYY — " prefix.
    s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s+—\s+/i, "");
    return s.trim();
}

/** Opportunity CRM queue: composed from generic note blob formatter */
/** Queue row: date/time before note body for triage scan. */
export function formatOpportunityQueueNotesPreview(
    raw: string | null | undefined,
    displayTimeZone?: string
): string | null {
    const parts = formatOpportunityQueueNotesPreviewParts(raw, displayTimeZone);
    if (!parts) return null;
    const ts = parts.timestamp?.trim() || null;
    const body = parts.body.trim();
    if (!ts && !body) return null;
    if (!ts) return body || null;
    if (!body) return ts;
    return `${ts} — ${body}`;
}

/** Same selection as `formatOpportunityQueueNotesPreview`, split for timestamp vs body typography. */
export function formatOpportunityQueueNotesPreviewParts(
    raw: string | null | undefined,
    displayTimeZone?: string
): ActivityQueueNotesPreviewParts | null {
    const blob = (raw ?? "").trim();
    if (!blob) return null;

    /**
     * Queue enrichment may already emit the final "MM/DD/YYYY h:mm AM/PM — Note" line (e.g. from `metadata.notes_at`).
     * If we re-parse that via the generic dated-line parser we can lose time-of-day (US date parse assumes midnight)
     * and end up with duplicate timestamps.
     */
    const alreadyFormatted = blob.match(
        /^(\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+(?:AM|PM))\s+—\s+([\s\S]+)$/
    );
    if (alreadyFormatted) {
        const ts = alreadyFormatted[1]!.replace(",", "").replace(/\s+/g, " ").trim();
        const body = stripLeadingNoteTimestampLike(alreadyFormatted[2]!.trim().replace(/\s+/g, " "));
        return { timestamp: ts || null, body };
    }

    const parts = formatActivityQueueNotesBlobPreviewParts(blob, { displayTimeZone });
    if (!parts) return null;
    return { ...parts, body: stripLeadingNoteTimestampLike(parts.body) };
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
export type { ActivityQueueNotesPreviewParts } from "@/lib/admin/activityTimelineFormat";
