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
import {
    formatCommunicationActivityDetail,
    formatTourActivityDetail,
    OPPORTUNITY_TOUR_ACTIVITY_EVENT_LABELS,
} from "@/lib/admin/opportunityTourActivityEvents";

/** Status-key display labels used for enrollment / growth CRM (payload.summary, transitions). */
export const OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS: Record<string, string> = {
    // Product language is Lead, not Inquiry — the legacy `new_inquiry` key displays as "New Lead".
    new_inquiry: "New Lead",
    new: "New",
    contact_attempted: "Contact Attempted",
    tour_scheduled: "Tour Scheduled",
    lead: "Lead",
    waitlist: "Waitlist",
    waitlisted: "Waitlist",
    on_waitlist: "Waitlist",
    tour: "Tour",
    assignment: "Assignment",
    enrolled: "Enrolled",
    enrolling: "Enrolling",
    withdrawn: "Withdrawn",
    not_enrolling: "Not enrolling",
    closed: "Closed",
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
    ...OPPORTUNITY_TOUR_ACTIVITY_EVENT_LABELS,
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
    const tourDetail = resolveTourActivityDetail(event.event_type, payload);
    const eventType = (event.event_type ?? "").trim().toLowerCase();

    // Tour invitation: headline = what happened; detail = channel · recipient.
    if (eventType === "tour_invitation_activated") {
        return {
            ...base,
            title: "Tour invitation sent",
            detail: formatCommunicationActivityDetail(payload) ?? tourDetail ?? null,
        };
    }

    // Generic communication: keep channel-aware title (Message/Email/SMS sent).
    if (
        eventType === "message_sent"
        || eventType === "message_queued"
        || eventType === "message_delivered"
    ) {
        const channelTitle = resolveCommunicationMessageEventTitle(event.event_type, payload);
        return {
            ...base,
            title: channelTitle ?? base.title,
            detail: formatCommunicationActivityDetail(payload) ?? intakeDetail ?? null,
        };
    }

    // Work-template action_executed must never overshadow richer communication intent.
    if (eventType === "action_executed") {
        const action = firstNonEmptyString(payload.action_key, payload.actionKey)?.toLowerCase() ?? "";
        if (action === "send_tour_invitation") {
            return {
                ...base,
                title: "Tour invitation sent",
                detail: formatCommunicationActivityDetail(payload),
            };
        }
        if (action === "create_lead") {
            return { ...base, title: "Lead created", detail: "Enrollment" };
        }
        if (action === "contact_family" || action === "contact_family_work") {
            // Work context only — prefer Contact attempt wording over template name.
            return {
                ...base,
                title: "Contact attempt",
                detail: formatCommunicationActivityDetail(payload),
            };
        }
        // Prefer a meaningful summary as the headline when present; never humanize
        // action_key into the primary operator fact when a summary already answers "what happened".
        const summary = firstNonEmptyString(payload.summary);
        if (summary) {
            return { ...base, title: summary, detail: null };
        }
        return base;
    }

    // Contact-attempt / stage work outcome: headline = attempt fact; detail = outcome label.
    if (eventType === "stage_work_outcome_recorded") {
        const outcomeLabel = firstNonEmptyString(payload.outcome_label, payload.outcome_key);
        const isContactTrace = payload.communication_trace === true;
        if (isContactTrace || outcomeLabel) {
            return {
                ...base,
                title: isContactTrace ? "Contact attempt recorded" : "Outcome recorded",
                detail: outcomeLabel ? humanizeOpportunitySnakeCaseToken(outcomeLabel) : null,
            };
        }
    }

    // Child-grain stage moves must name the child — never imply the whole family moved.
    if (eventType === "child_lifecycle_status_changed") {
        const childTitle = formatChildLifecycleActivityTitle(payload, base.detail);
        if (childTitle) {
            return {
                ...base,
                title: childTitle,
                detail: "Process progression",
            };
        }
    }

    // Family/case stage moves: "Moved to Waitlist" / "Lead created" — not bare "New".
    if (eventType === "opportunity_status_changed" || eventType === "entity_status_changed") {
        const stageTitle = formatFamilyStageActivityTitle(payload);
        if (stageTitle) {
            return {
                ...base,
                title: stageTitle,
                detail: "Process progression",
            };
        }
        if (base.detail && base.detail.includes("→")) {
            return { ...base, title: base.detail, detail: "Process progression" };
        }
    }

    const detail = intakeDetail ?? tourDetail ?? base.detail;
    return { ...base, detail };
}

function isInitialLeadStageKey(key: string | null): boolean {
    if (!key) return false;
    const k = key.trim().toLowerCase();
    return k === "new_inquiry" || k === "lead" || k === "new";
}

function formatFamilyStageActivityTitle(payload: Record<string, unknown>): string | null {
    const previous = firstNonEmptyString(
        payload.old_status_key,
        payload.previous_status_key,
        payload.from_status_key,
    );
    const next = firstNonEmptyString(
        payload.new_status_key,
        payload.next_status_key,
        payload.to_status_key,
    );
    if (!next) return null;
    const nextLabel = humanizeOpportunitySnakeCaseToken(next);
    if (!previous && isInitialLeadStageKey(next)) return "Lead created";
    if (!previous) return `Moved to ${nextLabel}`;
    return `Moved to ${nextLabel}`;
}

function formatChildLifecycleActivityTitle(
    payload: Record<string, unknown>,
    transitionDetail: string | null,
): string | null {
    const childName = firstNonEmptyString(
        payload.child_display_name,
        payload.child_name,
        payload.subject_label,
        payload.subject_name,
        payload.child_label,
        payload.participant_label,
    );
    const previous = firstNonEmptyString(
        payload.previous_status_key,
        payload.old_status_key,
        payload.from_status_key,
    );
    const nextKey = firstNonEmptyString(
        payload.next_status_key,
        payload.new_status_key,
        payload.to_status_key,
    );
    const nextLabel = nextKey
        ? humanizeOpportunitySnakeCaseToken(nextKey)
        : transitionDetail?.includes("→")
          ? transitionDetail.split("→").pop()?.trim() || null
          : null;
    if (!nextLabel) {
        if (childName && transitionDetail?.includes("→")) return `${childName}: ${transitionDetail}`;
        if (transitionDetail?.includes("→")) return transitionDetail;
        return null;
    }
    if (!previous && isInitialLeadStageKey(nextKey) && childName) {
        return `${childName} — Lead created`;
    }
    if (!previous && isInitialLeadStageKey(nextKey)) return "Lead created";
    if (childName) return `${childName} moved to ${nextLabel}`;
    return `Moved to ${nextLabel}`;
}

function firstNonEmptyString(...vals: unknown[]): string | null {
    for (const v of vals) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s) return s;
    }
    return null;
}

function resolveTourActivityDetail(
    eventType: string | null | undefined,
    payload: Record<string, unknown>,
): string | null {
    const t = (eventType ?? "").trim().toLowerCase();
    if (!t.startsWith("tour_")) return null;
    if (t === "tour_invitation_activated") {
        return formatCommunicationActivityDetail(payload);
    }
    if (
        t === "tour_booked"
        || t === "tour_confirmed"
        || t === "tour_booking_pending"
        || t === "tour_rescheduled"
        || t === "tour_slot_selected"
    ) {
        return formatTourActivityDetail(payload);
    }
    return null;
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
