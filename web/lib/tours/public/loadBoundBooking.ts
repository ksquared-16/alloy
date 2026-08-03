/**
 * Load the booking an action is BOUND to — Slice C.
 *
 * The booking id comes from the credential (`link.booking_id`), never from the
 * request. That is the whole point: a caller-supplied booking id would let a
 * holder of one family's token confirm, reschedule or cancel another family's
 * tour.
 *
 * Also re-checks org and recipient against the booking row, so a link whose
 * booking was somehow re-pointed cannot act on it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { tourPublicErr } from "@/lib/tours/public/tourPublicHttp";
import type { TourActionAuthorization } from "@/lib/tours/public/authorizeTourAction";

export type BoundBooking = {
    id: string;
    org_id: string;
    status_key: string;
    start_at: string;
    end_at: string;
    timezone: string;
    primary_person_id: string | null;
    opportunity_id: string | null;
};

export type LoadBoundBookingResult =
    | { ok: true; booking: BoundBooking }
    | { ok: false; response: Response };

export async function loadBoundBooking(
    supabase: SupabaseClient,
    auth: Extract<TourActionAuthorization, { ok: true }>
): Promise<LoadBoundBookingResult> {
    const bookingId = auth.link.booking_id;
    if (!bookingId) {
        // This action kind requires a booking and none is bound — the credential
        // was minted wrong, or is being used out of lifecycle.
        return { ok: false, response: tourPublicErr("This link is no longer valid.", 404, { code: "no_bound_booking" }) };
    }

    const { data, error } = await supabase
        .from("tour_bookings")
        .select("id, org_id, status_key, start_at, end_at, timezone, primary_person_id, opportunity_id")
        .eq("id", bookingId)
        .eq("org_id", auth.link.org_id)
        .maybeSingle();

    if (error || !data) {
        return { ok: false, response: tourPublicErr("This link is no longer valid.", 404, { code: "booking_not_found" }) };
    }

    const booking = data as BoundBooking;

    // The booking must belong to the same person the invitation names. Uniform
    // failure language: a mismatch here is forgery-shaped.
    if (booking.primary_person_id && booking.primary_person_id !== auth.invitation.recipient_person_id) {
        return { ok: false, response: tourPublicErr("This link is no longer valid.", 404, { code: "booking_recipient_mismatch" }) };
    }
    if (booking.opportunity_id && booking.opportunity_id !== auth.invitation.opportunity_id) {
        return { ok: false, response: tourPublicErr("This link is no longer valid.", 404, { code: "booking_context_mismatch" }) };
    }

    return { ok: true, booking };
}
