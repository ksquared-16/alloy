import { NextRequest } from "next/server";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { loadBoundBooking } from "@/lib/tours/public/loadBoundBooking";
import { tourPublicErr, tourPublicJson } from "@/lib/tours/public/tourPublicHttp";
import { mintActionsFor } from "@/lib/tours/invitation/mintTourInvitation";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";
import { resolvePublicBaseUrl } from "@/lib/tours/public/resolvePublicBaseUrl";

/**
 * POST /api/public/tour-booking/[token]/cancel-intent
 *
 * THE ONLY place a `cancel_tour` credential is ever minted.
 *
 * Cancellation is deliberately a bounded flow rather than a one-tap link in a
 * message: a mis-tap in an inbox must never release a family's appointment. The
 * parent reaches here only from the secure Manage surface, after choosing to
 * cancel and reading what it means. This route mints a single-use credential
 * scoped to exactly this booking and returns it ONCE, to that page — it is never
 * placed in an email or SMS.
 *
 * This route does NOT cancel. It authorises the parent's next, explicit step.
 *
 * The Manage credential (`view_tour_details`) is read-only by construction, so
 * holding it can never mutate anything; it can only ask for this authorisation.
 */
const REQUIRED_ACTIONS = ["view_tour_details"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request,
        rawToken: raw ?? "",
        routeName: "cancel_intent",
        requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;

    // The booking comes from the CREDENTIAL, never the request body.
    const bound = await loadBoundBooking(supabase, auth);
    if (!bound.ok) return bound.response;
    const booking = bound.booking;

    // Current-state aware: there is nothing to authorise on a tour that is already
    // over or called off, and offering one would be a dead end.
    if (["cancelled", "canceled", "completed", "no_show"].includes(booking.status_key)) {
        return tourPublicErr("This tour can no longer be cancelled.", 409, { code: "NOT_CANCELLABLE" });
    }

    // Reuse before minting. A parent who opens the consequence twice must not end up
    // with two live cancel credentials for one booking — "only one current valid
    // cancel credential" is a property of the lifecycle, not of a single request.
    // The raw token is never stored, so an existing unconsumed credential cannot be
    // re-served; it is revoked and replaced, keeping exactly one live at a time.
    await supabase
        .from("tour_public_booking_links")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("org_id", auth.link.org_id)
        .eq("invitation_id", auth.invitation.id)
        .eq("action_kind", "cancel_tour")
        .is("consumed_at", null);

    const minted = await mintActionsFor({
        supabase,
        orgId: auth.link.org_id,
        invitationId: auth.invitation.id,
        recipientPersonId: auth.invitation.recipient_person_id,
        opportunityId: auth.invitation.opportunity_id,
        locationId: auth.link.location_id,
        expiresAt: auth.link.expires_at,
        kinds: ["cancel_tour"],
        bookingId: booking.id,
    });
    if (!minted.ok) {
        return tourPublicErr("We could not prepare that just now. Please try again.", 400, { code: "INTENT_FAILED" });
    }

    const token = minted.actions.find((a) => a.actionKind === "cancel_tour")?.rawToken ?? "";
    if (!token) {
        return tourPublicErr("We could not prepare that just now. Please try again.", 400, { code: "INTENT_FAILED" });
    }

    // Recorded WITHOUT the credential — `recordTourEvent` refuses credential-shaped
    // detail keys outright, and the raw token must never reach an event payload.
    await recordTourEvent(supabase, {
        event: "tour_action_opened",
        orgId: auth.link.org_id,
        invitationId: auth.invitation.id,
        recipientPersonId: auth.invitation.recipient_person_id,
        opportunityId: auth.invitation.opportunity_id,
        bookingId: booking.id,
        detail: { action_kind: "cancel_tour", reason: "parent_opened_cancellation" },
    });

    // Returned once, to the page the parent is already looking at.
    return tourPublicJson({
        ok: true,
        cancel_url: `${resolvePublicBaseUrl().replace(/\/+$/, "")}/tour-booking/${encodeURIComponent(token)}`,
    });
}
