/**
 * A REQUESTED TOUR on a Processing intake case (S7).
 *
 * A family that picks a time on a school's public calendar and submits the lead form has
 * made a REQUEST, not a booking. Before administrator acceptance there is no Opportunity
 * (`tour_bookings.opportunity_id` is NOT NULL, and Processing Approve is the only thing
 * that creates one), so the request lives where the rest of the unaccepted intake lives:
 * on the Processing case, as `processing_cases.metadata.requested_tour`.
 *
 * It is pending intent. It holds no seat, confirms nothing and sends nothing. Approval
 * resolves it (see `materializeRequestedTour.ts`) against the CURRENT calendar.
 *
 * Lifecycle (`state`):
 *   pending_acceptance  — submitted; awaiting the Processing decision
 *   booked              — Approve created the booking (`booking_id`); the booking is the truth
 *   needs_rescheduling  — Approve accepted the lead but the time could not be booked
 *                         (`reason`); the original time is retained for audit
 *   failed              — an unexpected error; re-running Approve retries (idempotent)
 *
 * A rejected case keeps `pending_acceptance` with the case's own rejection as the outcome;
 * readers derive "not accepted" from the case, never from a second flag.
 */

export const REQUESTED_TOUR_METADATA_KEY = "requested_tour" as const;
export const REQUESTED_TOUR_SCHEMA = "processing.requested_tour.v1" as const;

export const REQUESTED_TOUR_STATES = ["pending_acceptance", "booked", "needs_rescheduling", "failed"] as const;
export type RequestedTourState = (typeof REQUESTED_TOUR_STATES)[number];

/** Why an accepted request did not become a booking. Each is shown to the operator verbatim-mapped. */
export const REQUESTED_TOUR_RESCHEDULE_REASONS = [
    "slot_unavailable",
    "calendar_closed",
    "too_soon",
    "existing_active_tour",
    "location_mismatch",
] as const;
export type RequestedTourRescheduleReason = (typeof REQUESTED_TOUR_RESCHEDULE_REASONS)[number];

export type RequestedTourCommsOutcome = {
    /** What the tour policy + canonical enqueue did with the confirmation. */
    status: "sent" | "suppressed" | "not_applicable" | "failed";
    detail: string | null;
};

export type RequestedTourRecord = {
    schema: typeof REQUESTED_TOUR_SCHEMA;
    state: RequestedTourState;
    location_id: string;
    start_at: string;
    end_at: string;
    timezone: string;
    /** The availability rule the slot came from at submission — evidence, never authority. */
    rule_id: string | null;
    requested_at: string;
    /** One request per submission: the form submission IS the request's identity. */
    submission_key: string;
    provenance: {
        source: "public_tour_calendar";
        form_public_link_id: string;
        form_submission_id: string;
    };
    /** Set once approval resolves the request. */
    opportunity_id?: string | null;
    booking_id?: string | null;
    booking_status?: string | null;
    reason?: RequestedTourRescheduleReason | null;
    error?: string | null;
    resolved_at?: string | null;
    attempts?: number;
    comms?: RequestedTourCommsOutcome | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The selection a public client may send: two instants. Nothing else is accepted from it. */
export type PublicTourSelection = { startAt: Date; endAt: Date };

export function parsePublicTourSelection(raw: unknown): { ok: true; value: PublicTourSelection } | { ok: false; message: string } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "requested_tour must be an object" };
    const r = raw as Record<string, unknown>;
    const s = typeof r.start_at === "string" ? Date.parse(r.start_at) : NaN;
    const e = typeof r.end_at === "string" ? Date.parse(r.end_at) : NaN;
    if (Number.isNaN(s) || Number.isNaN(e)) return { ok: false, message: "requested_tour.start_at and end_at must be ISO datetimes" };
    if (e <= s) return { ok: false, message: "requested_tour.end_at must be after start_at" };
    // A tour is minutes to hours, never days — refuse absurd intervals before any database read.
    if (e - s > 8 * 60 * 60 * 1000) return { ok: false, message: "requested_tour interval is too long" };
    return { ok: true, value: { startAt: new Date(s), endAt: new Date(e) } };
}

export function buildRequestedTourRecord(input: {
    locationId: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    ruleId: string | null;
    formPublicLinkId: string;
    formSubmissionId: string;
    now?: Date;
}): RequestedTourRecord {
    return {
        schema: REQUESTED_TOUR_SCHEMA,
        state: "pending_acceptance",
        location_id: input.locationId,
        start_at: input.startAt.toISOString(),
        end_at: input.endAt.toISOString(),
        timezone: input.timezone,
        rule_id: input.ruleId,
        requested_at: (input.now ?? new Date()).toISOString(),
        submission_key: `form_submission:${input.formSubmissionId}`,
        provenance: {
            source: "public_tour_calendar",
            form_public_link_id: input.formPublicLinkId,
            form_submission_id: input.formSubmissionId,
        },
    };
}

/** Read the record from case metadata. Anything malformed reads as absent — never as a booking. */
export function readRequestedTour(caseMetadata: unknown): RequestedTourRecord | null {
    if (!caseMetadata || typeof caseMetadata !== "object" || Array.isArray(caseMetadata)) return null;
    const raw = (caseMetadata as Record<string, unknown>)[REQUESTED_TOUR_METADATA_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (r.schema !== REQUESTED_TOUR_SCHEMA) return null;
    if (!REQUESTED_TOUR_STATES.includes(r.state as RequestedTourState)) return null;
    if (typeof r.location_id !== "string" || !UUID_RE.test(r.location_id)) return null;
    if (typeof r.start_at !== "string" || Number.isNaN(Date.parse(r.start_at))) return null;
    if (typeof r.end_at !== "string" || Number.isNaN(Date.parse(r.end_at))) return null;
    if (typeof r.timezone !== "string" || !r.timezone.trim()) return null;
    return raw as RequestedTourRecord;
}
