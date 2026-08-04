import { NextRequest } from "next/server";
import { cancelTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { tourPublicErr, tourPublicJson, publicTourBookingView } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { consumeTourAction, invalidateIncompatibleTourActions } from "@/lib/tours/public/authorizeTourAction";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";
import { loadBoundBooking } from "@/lib/tours/public/loadBoundBooking";

/**
 * POST /api/public/tour-booking/[token]/cancel
 *
 * The FINAL cancellation execution seam — not a first reply. A cancel_tour
 * credential is minted only after the bounded confirmation step, so reaching
 * this route already means the recipient confirmed their intent.
 */
const REQUIRED_ACTIONS = ["cancel_tour"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request, rawToken: raw ?? "", routeName: "cancel", requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const bound = await loadBoundBooking(supabase, auth);
    if (!bound.ok) return bound.response;
    const booking = bound.booking;

    if (booking.status_key === "canceled") {
        return tourPublicJson({ ok: true, booking: publicTourBookingView(booking), idempotent_replay: true });
    }
    if (["completed", "no_show"].includes(booking.status_key)) {
        return tourPublicErr("This tour can no longer be cancelled.", 409, { code: "NOT_CANCELLABLE" });
    }

    try {
        const cancelled = await cancelTourBooking(supabase, auth.link.org_id, booking.id, {
            canceledBy: "public_link",
            cancelReason: "Cancelled by the family from a tour link.",
        });
        await consumeTourAction({ supabase, linkId: auth.link.id, bookingId: booking.id });
        await invalidateIncompatibleTourActions({
            supabase, invitationId: auth.invitation.id, keepLinkId: auth.link.id, reason: "booked",
        });
        await recordTourEvent(supabase, {
            event: "tour_cancelled",
            orgId: auth.link.org_id,
            invitationId: auth.invitation.id,
            recipientPersonId: auth.invitation.recipient_person_id,
            opportunityId: auth.invitation.opportunity_id,
            threadId: auth.invitation.conversation_thread_id,
            bookingId: booking.id,
            detail: { status_key: cancelled.status_key },
        });
        return tourPublicJson({ ok: true, booking: { id: cancelled.id, status_key: cancelled.status_key } });
    } catch {
        return tourPublicErr("We could not cancel your tour. Please contact the site.", 400, { code: "CANCEL_FAILED" });
    }
}
