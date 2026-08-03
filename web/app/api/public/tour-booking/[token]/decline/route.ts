import { NextRequest } from "next/server";
import { tourPublicJson } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { consumeTourAction, invalidateIncompatibleTourActions } from "@/lib/tours/public/authorizeTourAction";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";

/**
 * POST /api/public/tour-booking/[token]/decline
 *
 * Records that the family does not want a tour from this invitation. It creates
 * and cancels NOTHING — declining an offer is not cancelling a booking — and it
 * moves no Business Process stage; that stays with configured operator work.
 */
const REQUIRED_ACTIONS = ["decline_tour"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request, rawToken: raw ?? "", routeName: "decline", requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const { invitation, link } = auth;

    // Idempotent replay: a second click returns the decline they already made.
    if (invitation.status === "declined") {
        return tourPublicJson({ ok: true, status: "declined", idempotent_replay: true });
    }
    // A booked invitation cannot be declined — the tour already exists.
    if (invitation.status !== "active") {
        return tourPublicJson({ ok: false, status: invitation.status }, { status: 409 });
    }

    // Conditional update IS the concurrency control: only one racer transitions.
    const { data: moved } = await supabase
        .from("tour_invitations")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();

    if (!moved) {
        return tourPublicJson({ ok: true, status: "declined", idempotent_replay: true });
    }

    await consumeTourAction({ supabase, linkId: link.id });
    await invalidateIncompatibleTourActions({
        supabase, invitationId: invitation.id, keepLinkId: link.id, reason: "declined",
    });

    await recordTourEvent(supabase, {
        event: "tour_invitation_declined",
        orgId: link.org_id,
        invitationId: invitation.id,
        recipientPersonId: invitation.recipient_person_id,
        opportunityId: invitation.opportunity_id,
        threadId: invitation.conversation_thread_id,
    });

    return tourPublicJson({ ok: true, status: "declined" });
}
