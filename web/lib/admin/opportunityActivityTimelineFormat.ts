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
import { resolveCommunicationMessageEventTitle } from "@/lib/admin/activityMessageEventLabels";

/** Status-key display labels used for enrollment / growth CRM (payload.summary, transitions). */
export const OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS: Record<string, string> = {
    // Product language is Lead, not Inquiry — the legacy `new_inquiry` key displays as "New Lead".
    new_inquiry: "New Lead",
    contact_attempted: "Contact Attempted",
    tour_scheduled: "Tour Scheduled",
    lead: "Lead",
    waitlist: "Waitlist",
    waitlisted: "Waitlist",
    on_waitlist: "Waitlist",
    tour: "Tour",
    assignment: "Assignment",
    enrolled: "Enrolled",
};

const OPPORTUNITY_EVENT_TYPE_LABELS: Record<string, string> = {
    form_submitted: "Enrollment form submitted",
    form_signed: "Form signed",
    form_document_generated: "Form document generated",
    intake_case_created: "Intake case opened",
    intake_case_operationalized: "Lead ready in pipeline",
    intake_case_review_required: "Intake review required",
    intake_case_linked: "Intake linked to family",
    opportunity_status_changed: "Moved",
    entity_status_changed: "Moved",
    child_lifecycle_status_changed: "Moved",
    message_received: "Message received",
    message_sent: "Message sent",
    message_delivered: "Message delivered",
    message_failed: "Message failed",
    note_added: "Note added",
    action_executed: "Action completed",
    stage_work_outcome_recorded: "Work outcome recorded",
    opportunity_enrollment_packet_created: "Enrollment packet created",
    opportunity_enrollment_packet_opened: "Enrollment packet opened",
    opportunity_enrollment_packet_step_completed: "Enrollment packet step completed",
    opportunity_enrollment_packet_completed: "Enrollment packet completed",
    opportunity_enrollment_packet_sent: "Enrollment packet sent",
    opportunity_enrollment_packet_submitted_for_review: "Packet submitted for review",
    opportunity_enrollment_packet_review_decision: "Packet review decision",
    opportunity_waitlist_manual_adjustment_created: "Waitlist position manually adjusted",
    opportunity_waitlist_manual_adjustment_updated: "Waitlist position manually adjusted",
    opportunity_waitlist_manual_adjustment_released: "Waitlist manual adjustment removed",
};

/** Default options for opportunity workflow_events and related UI. */
export const opportunityActivityTimelineOptions: ActivityTimelineFormatOptions = {
    eventTypeLabels: OPPORTUNITY_EVENT_TYPE_LABELS,
    statusKeyLabels: OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS,
    statusTransitionEventTypes: [
        "opportunity_status_changed",
        "entity_status_changed",
        "child_lifecycle_status_changed",
    ],
    actionEventTypes: ["action_executed"],
};

export function formatOpportunityActivityTimelineEvent(event: ActivityTimelineEventInput) {
    const payload =
        event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
            ? event.payload
            : {};
    const base = formatActivityTimelineEvent(event, opportunityActivityTimelineOptions);
    const intakeDetail = resolveFormIntakeActivityDetail(event.event_type, payload);
    const detail = intakeDetail ?? base.detail;
    const eventType = (event.event_type ?? "").trim().toLowerCase();
    // Stage/lifecycle movements: prefer the canonical transition as the primary label
    // ("Lead → Waitlist") so What's Next and Activity tab share one operator-facing string.
    if (
        (eventType === "opportunity_status_changed"
            || eventType === "entity_status_changed"
            || eventType === "child_lifecycle_status_changed")
        && detail
        && detail.includes("→")
    ) {
        return { ...base, title: detail, detail: null };
    }
    return { ...base, detail };
}

function resolveFormIntakeActivityDetail(
    eventType: string | null | undefined,
    payload: Record<string, unknown>
): string | null {
    const t = (eventType ?? "").trim().toLowerCase();
    if (!t) return null;

    if (t === "form_submitted") {
        return payload.intake_auto_operationalized === true
            ? "New lead created — ready in enrollment pipeline"
            : payload.intake_needs_review === true
              ? "Submission captured — review required before enrollment continues"
              : "Form submission captured";
    }
    if (t === "intake_case_operationalized") return "No manual review required — continue enrollment";
    if (t === "intake_case_review_required") {
        const reasons = payload.intake_review_reasons;
        if (Array.isArray(reasons) && reasons.length > 0) {
            return reasons.filter((r): r is string => typeof r === "string").join(" · ");
        }
        return "Review intake before enrollment workflows continue";
    }
    if (t === "intake_case_linked") return "Matched to existing family — no duplicate lead";
    if (t === "intake_case_created") return "Intake evidence saved from public form";
    return null;
}

export function getWorkflowActivityEventTitle(eventType: string | null, payload: Record<string, unknown> = {}): string {
    const channelTitle = resolveCommunicationMessageEventTitle(eventType, payload);
    if (channelTitle) return channelTitle;
    return formatActivityTimelineEvent(
        { event_type: eventType, payload },
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
