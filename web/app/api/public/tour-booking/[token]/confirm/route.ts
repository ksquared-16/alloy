import { NextRequest } from "next/server";
import { confirmTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { tourPublicErr, tourPublicJson, publicTourBookingView } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { consumeTourAction } from "@/lib/tours/public/authorizeTourAction";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";
import { loadBoundBooking } from "@/lib/tours/public/loadBoundBooking";

/**
 * POST /api/public/tour-booking/[token]/confirm
 *
 * Confirms the booking the ACTION is bound to. The booking id comes from the
 * credential, never from the caller — a client-supplied id would let one
 * recipient confirm another family's tour.
 *
 * Creates no booking, and does not patch status directly: confirmTourBooking
 * already owns that lifecycle.
 */
const REQUIRED_ACTIONS = ["confirm_tour"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request, rawToken: raw ?? "", routeName: "confirm", requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const bound = await loadBoundBooking(supabase, auth);
    if (!bound.ok) return bound.response;
    const booking = bound.booking;

    if (booking.status_key === "confirmed") {
        return tourPublicJson({ ok: true, booking: publicTourBookingView(booking), idempotent_replay: true });
    }
    if (["canceled", "completed", "no_show"].includes(booking.status_key)) {
        return tourPublicErr("This tour can no longer be confirmed.", 409, { code: "NOT_CONFIRMABLE" });
    }

    try {
        const confirmed = await confirmTourBooking(supabase, auth.link.org_id, booking.id, { actorUserId: null });
        await consumeTourAction({ supabase, linkId: auth.link.id, bookingId: booking.id });
        await recordTourEvent(supabase, {
            event: "tour_confirmed",
            orgId: auth.link.org_id,
            invitationId: auth.invitation.id,
            recipientPersonId: auth.invitation.recipient_person_id,
            opportunityId: auth.invitation.opportunity_id,
            threadId: auth.invitation.conversation_thread_id,
            bookingId: booking.id,
            detail: { status_key: confirmed.status_key },
        });
        return tourPublicJson({
            ok: true,
            booking: { id: confirmed.id, status_key: confirmed.status_key, start_at: confirmed.start_at, end_at: confirmed.end_at, timezone: confirmed.timezone },
        });
    } catch {
        // The action is NOT consumed, so a transient failure stays retryable.
        return tourPublicErr("We could not confirm your tour. Please try again.", 400, { code: "CONFIRM_FAILED" });
    }
}
