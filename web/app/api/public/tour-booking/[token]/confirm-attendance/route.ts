import { NextRequest } from "next/server";
import { confirmTourAttendance } from "@/lib/tours/bookings/confirmTourAttendance";
import { tourPublicErr, tourPublicJson, publicTourBookingView } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { loadBoundBooking } from "@/lib/tours/public/loadBoundBooking";

/**
 * POST /api/public/tour-booking/[token]/confirm-attendance
 *
 * Parent attendance affirmation ("Confirm I'm coming"). Does NOT change booking
 * status_key — a Tour remains scheduled whether or not the parent responds.
 * Idempotent: a second click returns success with the same confirmed state.
 */
const REQUIRED_ACTIONS = ["confirm_attendance"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request,
        rawToken: raw ?? "",
        routeName: "confirm-attendance",
        requiredActions: REQUIRED_ACTIONS,
        allowConsumedReplay: true,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const bound = await loadBoundBooking(supabase, auth);
    if (!bound.ok) return bound.response;
    const booking = bound.booking;

    if (["canceled", "completed", "no_show"].includes(booking.status_key)) {
        return tourPublicErr("This tour can no longer be confirmed.", 409, { code: "NOT_CONFIRMABLE" });
    }

    try {
        const result = await confirmTourAttendance(supabase, {
            orgId: auth.link.org_id,
            bookingId: booking.id,
            confirmedByPersonId: auth.invitation.recipient_person_id,
            source: "email_action",
            actionLinkId: auth.link.id,
        });
        return tourPublicJson({
            ok: true,
            attendance_confirmed: true,
            already_confirmed: result.alreadyConfirmed,
            booking: publicTourBookingView(result.booking),
        });
    } catch {
        return tourPublicErr("We could not confirm your attendance. Please try again.", 400, {
            code: "ATTENDANCE_CONFIRM_FAILED",
        });
    }
}
