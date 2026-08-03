import { NextRequest } from "next/server";
import { loadTourPublicResolveLabels } from "@/lib/tours/public/loadTourPublicResolveLabels";
import { tourPublicErr, tourPublicJson } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { buildTourParentView } from "@/lib/tours/public/tourParentView";

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
 */
const REQUIRED_ACTIONS = [
    "view_tour_slots",
    "view_tour_details",
    "select_tour_slot",
    "decline_tour",
    "confirm_tour",
    "reschedule_tour",
    "cancel_tour",
] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request,
        rawToken: raw ?? "",
        routeName: "resolve",
        requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const labels = await loadTourPublicResolveLabels(supabase, auth.link);
    if ("error" in labels) return tourPublicErr(labels.error, labels.status);

    // A booking is shown only when THIS credential is already bound to one. The id
    // comes from the link, never from the request.
    let bookingStatusKey: string | null = null;
    let bookingStartAt: string | null = null;
    let bookingTimezone: string | null = null;
    if (auth.link.booking_id) {
        const { data } = await supabase
            .from("tour_bookings")
            .select("status_key, start_at, timezone")
            .eq("org_id", auth.link.org_id)
            .eq("id", auth.link.booking_id)
            .maybeSingle();
        if (data) {
            const row = data as { status_key?: string | null; start_at?: string | null; timezone?: string | null };
            bookingStatusKey = row.status_key ?? null;
            bookingStartAt = row.start_at ?? null;
            bookingTimezone = row.timezone ?? null;
        }
    }

    const expiresAt = auth.invitation.expires_at;
    const expired = expiresAt != null ? Date.parse(expiresAt) <= Date.now() : false;

    const view = buildTourParentView({
        opportunityLabel: labels.opportunity_label,
        locationLabel: labels.location_label,
        invitationStatus: auth.invitation.status,
        bookingStatusKey,
        bookingStartAt,
        bookingTimezone,
        expired,
        availableActions: [auth.actionKind],
        consumed: auth.link.consumed_at != null,
    });

    // `view` is the whole contract for the page. No internal status, id or action
    // key crosses this boundary — which is why the page has nothing to leak.
    return tourPublicJson({ ok: true, view });
}
