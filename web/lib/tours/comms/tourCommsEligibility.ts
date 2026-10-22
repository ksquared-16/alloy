/**
 * THE tour communications eligibility policy.
 *
 * One answer to "may this booking produce this kind of outbound message right now?",
 * decided from AUTHORITATIVE booking state — never from the event that triggered the
 * send and never from a row the caller happened to be holding. Every tour outbound
 * path asks this: immediate lifecycle sends, reminder scheduling, reminder DISPATCH,
 * the internal calendar invite, and the org-workflow gate for tour lifecycle events.
 *
 * The rule it exists to enforce: an unapproved booking — or a tour requested by a lead
 * still awaiting Processing approval — never sends a tour confirmation, calendar
 * invitation or reminder.
 *
 * WHAT THIS IS NOT. It does not decide whether a RECIPIENT may be contacted (opt-out,
 * suppression, channel usability, consent). That stays with canonical Communications
 * eligibility at enqueue, which runs after this and is never bypassed by it. A message
 * must pass both: this policy says the booking has something true to say; the
 * Communications layer says this person may hear it on this channel.
 *
 * Message class: every intent below is TRANSACTIONAL — a service message about an
 * appointment the family made. None of them is marketing. See `TOUR_COMMS_MESSAGE_CLASS`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TourBookingRow, TourBookingStatusKey } from "@/lib/tours/bookings/types";

/** What an outbound tour message is FOR. One per distinct authority question. */
export type TourCommsIntent =
    /** "Your tour is confirmed", confirmation SMS, staff calendar REQUEST. */
    | "booking_confirmation"
    /** "Your tour has been moved", staff calendar UPDATE, the replacement reminder generation. */
    | "reschedule_notice"
    /** Scheduling a reminder AND dispatching a due one. */
    | "reminder"
    /** "Your tour was canceled", staff calendar CANCEL. */
    | "cancellation_notice"
    /** "We missed you" after a recorded no-show. */
    | "no_show_followup"
    /** "Thanks for visiting" after a completed tour (org workflows only today). */
    | "post_visit_followup";

/** Recipient-preference class each intent belongs to. None is marketing. */
export const TOUR_COMMS_MESSAGE_CLASS: Record<TourCommsIntent, "transactional"> = {
    booking_confirmation: "transactional",
    reschedule_notice: "transactional",
    reminder: "transactional",
    cancellation_notice: "transactional",
    no_show_followup: "transactional",
    post_visit_followup: "transactional",
};

export type TourCommsDenialReason =
    | "booking_not_found"
    /** The booking's opportunity is missing — the lead was never accepted into this org. */
    | "lead_not_accepted"
    /** `pending_approval` / `requested`: nobody with authority has approved this visit. */
    | "awaiting_approval"
    | "booking_canceled"
    | "booking_closed"
    /** A cancellation notice for a booking the family was never told was confirmed. */
    | "never_confirmed"
    | "not_no_show"
    | "not_completed"
    | "tour_started";

export type TourCommsEligibility = { allowed: true } | { allowed: false; reason: TourCommsDenialReason };

/**
 * Facts read from the database at decision time. `null` booking means the read found
 * nothing for this org — which denies everything.
 */
export type TourCommsAuthoritativeState = {
    booking: { status_key: string; start_at: string } | null;
    /**
     * The lead approval boundary. A tour booking hangs off an opportunity, and a public
     * lead has no opportunity until an administrator approves its Processing case
     * (`commitApprovedLeadForCase`). An opportunity that does not exist in the booking's
     * org is therefore an unaccepted lead, whatever the booking row says.
     */
    opportunityAccepted: boolean;
};

/** Booking statuses that mean an authorised person approved this visit. */
const APPROVED_STATUS_KEYS: ReadonlySet<string> = new Set<TourBookingStatusKey>(["confirmed", "rescheduled"]);
const AWAITING_APPROVAL_STATUS_KEYS: ReadonlySet<string> = new Set<TourBookingStatusKey>([
    "pending_approval",
    "requested",
]);

function statusDenial(statusKey: string): TourCommsDenialReason {
    if (AWAITING_APPROVAL_STATUS_KEYS.has(statusKey)) return "awaiting_approval";
    if (statusKey === "canceled") return "booking_canceled";
    return "booking_closed";
}

export function isTourBookingApprovedForComms(statusKey: string | null | undefined): boolean {
    return APPROVED_STATUS_KEYS.has(String(statusKey ?? "").trim());
}

export function mayCommunicateForTour(
    intent: TourCommsIntent,
    state: TourCommsAuthoritativeState,
    opts?: {
        now?: Date;
        /**
         * Status the booking held immediately BEFORE the transition that triggered this
         * send. Only a cancellation needs it: the family is told a tour is canceled only
         * if they were ever told it was confirmed.
         */
        previousStatusKey?: string | null;
    }
): TourCommsEligibility {
    const booking = state.booking;
    if (!booking) return { allowed: false, reason: "booking_not_found" };
    if (!state.opportunityAccepted) return { allowed: false, reason: "lead_not_accepted" };

    const status = String(booking.status_key ?? "").trim();

    switch (intent) {
        case "booking_confirmation":
        case "reschedule_notice":
            return isTourBookingApprovedForComms(status) ? { allowed: true } : { allowed: false, reason: statusDenial(status) };
        case "reminder": {
            if (!isTourBookingApprovedForComms(status)) return { allowed: false, reason: statusDenial(status) };
            const start = Date.parse(booking.start_at);
            const now = (opts?.now ?? new Date()).getTime();
            if (!Number.isNaN(start) && start <= now) return { allowed: false, reason: "tour_started" };
            return { allowed: true };
        }
        case "cancellation_notice":
            if (status !== "canceled") return { allowed: false, reason: "booking_closed" };
            return isTourBookingApprovedForComms(opts?.previousStatusKey)
                ? { allowed: true }
                : { allowed: false, reason: "never_confirmed" };
        case "no_show_followup":
            return status === "no_show" ? { allowed: true } : { allowed: false, reason: "not_no_show" };
        case "post_visit_followup":
            return status === "completed" ? { allowed: true } : { allowed: false, reason: "not_completed" };
    }
}

/** Database read behind the policy. Org-scoped: a booking id from another org is "not found". */
export async function loadTourCommsAuthoritativeState(
    supabase: SupabaseClient,
    params: { orgId: string; bookingId: string }
): Promise<TourCommsAuthoritativeState & { row: TourBookingRow | null }> {
    const { data: bookingRaw, error: bookingErr } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("id", params.bookingId)
        .maybeSingle();
    if (bookingErr) throw new Error(`tour comms eligibility: booking read ${bookingErr.message}`);
    if (!bookingRaw) return { booking: null, opportunityAccepted: false, row: null };

    const b = bookingRaw as TourBookingRow;
    const opportunityId = String(b.opportunity_id ?? "").trim();
    let opportunityAccepted = false;
    if (opportunityId) {
        const { data: opp, error: oppErr } = await supabase
            .from("opportunities")
            .select("id")
            .eq("org_id", params.orgId)
            .eq("id", opportunityId)
            .maybeSingle();
        if (oppErr) throw new Error(`tour comms eligibility: opportunity read ${oppErr.message}`);
        opportunityAccepted = Boolean(opp);
    }
    return {
        booking: { status_key: String(b.status_key), start_at: String(b.start_at) },
        opportunityAccepted,
        row: b,
    };
}
