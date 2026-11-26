import { NextRequest } from "next/server";
import { confirmTourAttendance } from "@/lib/tours/bookings/confirmTourAttendance";
import { tourPublicErr, tourPublicJson, publicTourBookingView } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { consumeTourAction } from "@/lib/tours/public/authorizeTourAction";
import { loadBoundBooking } from "@/lib/tours/public/loadBoundBooking";

/**
 * POST /api/public/tour-booking/[token]/confirm
 *
 * A LEGACY credential. `confirm_tour` links are no longer minted; this route exists so the
 * ones already sitting in inboxes resolve safely.
 *
 * It used to call `confirmTourBooking` with no actor — so a family could approve its own
 * approval-required booking, which is exactly the decision approval exists to reserve for
 * staff. It now records what the family actually said ("I'll be there") as an attendance
 * acknowledgement through `confirmTourAttendance`, which never changes `status_key`. The
 * booking stays `pending_approval` until staff confirm it through the canonical
 * `confirmTourBooking` path (`tours.book`).
 *
 * The booking id comes from the credential, never from the caller.
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

    if (booking.status_key === "confirmed" || booking.status_key === "rescheduled") {
        return tourPublicJson({ ok: true, booking: publicTourBookingView(booking), idempotent_replay: true });
    }
    if (["canceled", "completed", "no_show"].includes(booking.status_key)) {
        return tourPublicErr("This tour can no longer be confirmed.", 409, { code: "NOT_CONFIRMABLE" });
    }

    try {
        const acknowledged = await confirmTourAttendance(supabase, {
            orgId: auth.link.org_id,
            bookingId: booking.id,
            confirmedByPersonId: auth.invitation.recipient_person_id,
            source: "email_action",
            actionLinkId: auth.link.id,
        });
        await consumeTourAction({ supabase, linkId: auth.link.id, bookingId: booking.id });
        return tourPublicJson({
            ok: true,
            // Acknowledged, NOT approved: the parent view keeps saying "not confirmed yet".
            attendance_confirmed: true,
            awaiting_approval: true,
            booking: publicTourBookingView(acknowledged.booking),
        });
    } catch {
        // The action is NOT consumed, so a transient failure stays retryable.
        return tourPublicErr("We could not record your reply. Please try again.", 400, { code: "CONFIRM_FAILED" });
    }
}
