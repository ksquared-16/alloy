import { NextRequest } from "next/server";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { assertTourPublicSlotsQueryWindow } from "@/lib/tours/public/tourPublicSlotsWindow";
import { tourPublicErr, tourPublicJson } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";

/**
 * GET /api/public/tour-booking/[token]/slots?from=&to=
 *
 * Live availability for the BOUND location. A viewing credential reads it, and
 * so does a reschedule credential — a parent choosing a replacement time needs
 * the same list. Both are viewing authority; neither can book here.
 *
 * The location and org come from the authorized link, never from the query, so
 * a caller cannot point this at another location or organization.
 *
 * Loading slots does NOT consume the action: viewing is reusable until expiry.
 */
const REQUIRED_ACTIONS = ["view_tour_slots", "reschedule_tour"] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request,
        rawToken: raw ?? "",
        routeName: "slots",
        requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    if (!auth.capability.readsAvailability) {
        return tourPublicErr("This link is no longer valid.", 404, { code: "wrong_action" });
    }

    const { searchParams } = new URL(request.url);
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    if (!fromRaw || !toRaw) return tourPublicErr("from and to ISO timestamps required", 400);

    const win = assertTourPublicSlotsQueryWindow(new Date(fromRaw), new Date(toRaw));
    if (!win.ok) return tourPublicErr(win.message, 400);

    const slots = await computeAvailableTourSlots(supabase, {
        orgId: auth.link.org_id,
        locationId: auth.link.location_id,
        userId: null,
        from: win.from,
        to: win.to,
    });

    await recordTourEvent(supabase, {
        event: "tour_slots_viewed",
        orgId: auth.link.org_id,
        invitationId: auth.invitation.id,
        recipientPersonId: auth.invitation.recipient_person_id,
        opportunityId: auth.invitation.opportunity_id,
        threadId: auth.invitation.conversation_thread_id,
        detail: { slot_count: slots.length, action_kind: auth.actionKind },
    });

    return tourPublicJson({ ok: true, slots });
}
