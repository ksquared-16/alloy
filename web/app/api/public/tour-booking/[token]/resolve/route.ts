import { NextRequest } from "next/server";
import { loadTourPublicResolveLabels } from "@/lib/tours/public/loadTourPublicResolveLabels";
import { tourPublicErr, tourPublicJson } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { buildTourParentView } from "@/lib/tours/public/tourParentView";
import { listActiveTourInvitationActionKinds } from "@/lib/tours/public/authorizeTourAction";
import { readAttendanceConfirmation } from "@/lib/tours/bookings/tourBookingAttendance";

/**
 * GET /api/public/tour-booking/[token]/resolve
 *
 * "What am I looking at?" for whichever credential the parent actually holds.
 * Read-only: it never consumes an action and never mutates.
 *
 * WIDENED (Parent Action Completion). Slice C accepted viewing credentials only,
 * so a selection-only token could not enumerate context. That narrowing broke the
 * delivered product: the invitation email's per-option links ARE `select_tour_slot`
 * tokens, so opening the primary call-to-action 404'd here before the parent saw
 * anything.
 *
 * Widening discloses nothing new. Every kind below is bound to the SAME invitation
 * and the SAME recipient, who was already sent the child's name and the center in
 * the invitation itself. The authorizer still proves recipient binding, expiry and
 * revocation; this route only decides which credentials may ask what they are for.
 *
 * Still discloses labels and state only — never a person, opportunity, process,
 * household or invitation identifier.
 *
 * `allowConsumedReplay`: after Confirm Tour, the select credential is spent and
 * bound to a booking. Re-resolve must show the confirmation state, not 409.
 */
const REQUIRED_ACTIONS = [
    "view_tour_slots",
    "view_tour_details",
    "select_tour_slot",
    "decline_tour",
    "confirm_tour",
    "reschedule_tour",
    "cancel_tour",
    "confirm_attendance",
] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request,
        rawToken: raw ?? "",
        routeName: "resolve",
        requiredActions: REQUIRED_ACTIONS,
        allowConsumedReplay: true,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const labels = await loadTourPublicResolveLabels(supabase, auth.link);
    if ("error" in labels) return tourPublicErr(labels.error, labels.status);

    // Prefer this credential's booking binding. When the parent opened a view link
    // and booked via the sibling select, load the invitation's active booking so
    // confirmation still renders.
    let bookingStatusKey: string | null = null;
    let bookingStartAt: string | null = null;
    let bookingTimezone: string | null = null;
    let bookingMetadata: unknown = null;
    let bookingId = auth.link.booking_id;

    if (!bookingId && auth.invitation.status === "booked") {
        const { data: boundRows } = await supabase
            .from("tour_public_booking_links")
            .select("booking_id")
            .eq("invitation_id", auth.invitation.id)
            .eq("org_id", auth.link.org_id)
            .eq("action_kind", "select_tour_slot")
            .not("booking_id", "is", null)
            .limit(1);
        const bound = Array.isArray(boundRows) ? boundRows[0] : boundRows;
        bookingId = (bound as { booking_id?: string | null } | null)?.booking_id ?? null;
    }

    if (!bookingId && auth.invitation.status === "booked") {
        const { data: activeRows } = await supabase
            .from("tour_bookings")
            .select("id, status_key, start_at, timezone, metadata")
            .eq("org_id", auth.link.org_id)
            .eq("opportunity_id", auth.link.opportunity_id)
            .in("status_key", ["pending_approval", "confirmed", "rescheduled"])
            .order("start_at", { ascending: false })
            .limit(1);
        const active = Array.isArray(activeRows) ? activeRows[0] : activeRows;
        if (active) {
            const row = active as {
                id?: string;
                status_key?: string | null;
                start_at?: string | null;
                timezone?: string | null;
                metadata?: unknown;
            };
            bookingId = row.id ?? null;
            bookingStatusKey = row.status_key ?? null;
            bookingStartAt = row.start_at ?? null;
            bookingTimezone = row.timezone ?? null;
            bookingMetadata = row.metadata ?? null;
        }
    }

    if (bookingId && bookingStatusKey == null) {
        const { data } = await supabase
            .from("tour_bookings")
            .select("status_key, start_at, timezone, metadata")
            .eq("org_id", auth.link.org_id)
            .eq("id", bookingId)
            .maybeSingle();
        if (data) {
            const row = data as {
                status_key?: string | null;
                start_at?: string | null;
                timezone?: string | null;
                metadata?: unknown;
            };
            bookingStatusKey = row.status_key ?? null;
            bookingStartAt = row.start_at ?? null;
            bookingTimezone = row.timezone ?? null;
            bookingMetadata = row.metadata ?? null;
        }
    }

    const expiresAt = auth.invitation.expires_at;
    const expired = expiresAt != null ? Date.parse(expiresAt) <= Date.now() : false;

    const siblingActions = auth.invitation.id
        ? await listActiveTourInvitationActionKinds({
              supabase,
              invitationId: auth.invitation.id,
              orgId: auth.link.org_id,
          })
        : [];
    const availableActions = Array.from(new Set([auth.actionKind, ...siblingActions]));

    // Spent + bound to a booking is confirmation, not "already replied".
    const consumed = auth.link.consumed_at != null && !bookingId;

    const attendance = readAttendanceConfirmation(bookingMetadata);
    const attendanceAlreadyConfirmed = attendance?.status === "confirmed_by_parent";

    const view = buildTourParentView({
        opportunityLabel: labels.opportunity_label,
        locationLabel: labels.location_label,
        locationAddress: labels.location_address ?? null,
        invitationStatus: auth.invitation.status,
        bookingStatusKey,
        bookingStartAt,
        bookingTimezone,
        expired,
        availableActions,
        consumed,
        attendanceAlreadyConfirmed,
    });

    // `view` is the whole contract for the page. No internal status, id or action
    // key crosses this boundary — which is why the page has nothing to leak.
    return tourPublicJson({ ok: true, view });
}
