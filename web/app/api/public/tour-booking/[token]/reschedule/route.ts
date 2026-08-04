import { NextRequest } from "next/server";
import { rescheduleTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { tourPublicErr, tourPublicJson, publicTourBookingView } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { consumeTourAction, invalidateIncompatibleTourActions } from "@/lib/tours/public/authorizeTourAction";
import { mintActionsFor, POST_BOOKING_ACTION_KINDS } from "@/lib/tours/invitation/mintTourInvitation";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";
import { loadBoundBooking } from "@/lib/tours/public/loadBoundBooking";

/**
 * POST /api/public/tour-booking/[token]/reschedule
 *
 * Replacement execution. Availability VIEWING for a reschedule credential is
 * served by the existing `slots` route; this is the mutating half.
 *
 * The original booking is preserved until the replacement succeeds — the
 * canonical rescheduleTourBooking owns the transition, so a failure here leaves
 * the family still holding their original tour.
 */
const REQUIRED_ACTIONS = ["reschedule_tour"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request, rawToken: raw ?? "", routeName: "reschedule", requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const bound = await loadBoundBooking(supabase, auth);
    if (!bound.ok) return bound.response;
    const booking = bound.booking;

    if (auth.link.consumed_at) {
        return tourPublicJson({ ok: true, booking: publicTourBookingView(booking), idempotent_replay: true });
    }

    let body: { start_at?: string; end_at?: string; timezone?: string };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return tourPublicErr("Invalid JSON", 400);
    }
    const startAt = body.start_at ? new Date(body.start_at) : null;
    const endAt = body.end_at ? new Date(body.end_at) : null;
    if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return tourPublicErr("start_at and end_at required", 400);
    }

    await recordTourEvent(supabase, {
        event: "tour_reschedule_started",
        orgId: auth.link.org_id,
        invitationId: auth.invitation.id,
        recipientPersonId: auth.invitation.recipient_person_id,
        opportunityId: auth.invitation.opportunity_id,
        threadId: auth.invitation.conversation_thread_id,
        bookingId: booking.id,
    });

    // Live revalidation — the replacement must be available NOW.
    const live = await computeAvailableTourSlots(supabase, {
        orgId: auth.link.org_id,
        locationId: auth.link.location_id,
        userId: null,
        from: new Date(startAt.getTime() - 60_000),
        to: new Date(endAt.getTime() + 60_000),
    });
    // Inferred against the real `AvailableTourSlot` (camelCase `startAt`), not a
    // hand-written shape — see the same note in the `book` route.
    const available = live.some((s) => new Date(s.startAt).getTime() === startAt.getTime());
    if (!available) {
        // Action NOT consumed: the family may pick another time.
        return tourPublicErr("That time is no longer available. Please choose another.", 409, { code: "SLOT_UNAVAILABLE" });
    }

    try {
        const replacement = await rescheduleTourBooking(supabase, auth.link.org_id, booking.id, {
            startAt, endAt, timezone: body.timezone ?? booking.timezone, locationId: auth.link.location_id,
        });

        await consumeTourAction({ supabase, linkId: auth.link.id, bookingId: replacement.id });
        await invalidateIncompatibleTourActions({
            supabase, invitationId: auth.invitation.id, keepLinkId: auth.link.id, reason: "booked",
        });

        // The replacement booking needs its own scoped action set; actions bound
        // to the superseded booking are now stale.
        await mintActionsFor({
            supabase,
            orgId: auth.link.org_id,
            invitationId: auth.invitation.id,
            recipientPersonId: auth.invitation.recipient_person_id,
            opportunityId: auth.invitation.opportunity_id,
            locationId: auth.link.location_id,
            expiresAt: auth.link.expires_at,
            kinds: POST_BOOKING_ACTION_KINDS,
            bookingId: replacement.id,
        });

        await recordTourEvent(supabase, {
            event: "tour_rescheduled",
            orgId: auth.link.org_id,
            invitationId: auth.invitation.id,
            recipientPersonId: auth.invitation.recipient_person_id,
            opportunityId: auth.invitation.opportunity_id,
            threadId: auth.invitation.conversation_thread_id,
            bookingId: replacement.id,
            detail: { previous_booking_id: booking.id, start_at: replacement.start_at, status_key: replacement.status_key },
        });

        return tourPublicJson({
            ok: true,
            booking: { id: replacement.id, status_key: replacement.status_key, start_at: replacement.start_at, end_at: replacement.end_at, timezone: replacement.timezone },
            previous_booking_id: booking.id,
        });
    } catch {
        return tourPublicErr("We could not move your tour. Your original time is unchanged.", 400, { code: "RESCHEDULE_FAILED" });
    }
}
