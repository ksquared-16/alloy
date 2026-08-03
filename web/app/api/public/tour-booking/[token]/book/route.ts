import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { createTourBooking } from "@/lib/tours/bookings/tourBookingService";
import type { CreateTourBookingInput } from "@/lib/tours/bookings/types";
import { tourPublicErr, tourPublicJson } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";
import { consumeTourAction, invalidateIncompatibleTourActions } from "@/lib/tours/public/authorizeTourAction";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";
import { assertBookingLocationMatchesOpportunity, fetchOpportunityForTourAdmin } from "@/lib/tours/admin/opportunityTourContext";

type Body = {
    rule_id?: string;
    start_at?: string;
    end_at?: string;
    timezone?: string;
};

/** POST /api/public/tour-booking/[token]/book */
const REQUIRED_ACTIONS = ["select_tour_slot"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request,
        rawToken: raw ?? "",
        routeName: "book",
        requiredActions: REQUIRED_ACTIONS,
        // A spent credential must reach the replay branch below rather than being
        // refused. Without this the parent who double-submits gets an error next to
        // a booking that actually succeeded.
        allowConsumedReplay: true,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const link = auth.link;
    const invitation = auth.invitation;

    // IDEMPOTENT REPLAY. A parent who double-clicks, or retries after a dropped
    // connection, gets the booking they already have — not a second one, and
    // not an error implying they did something wrong.
    if (auth.replay || (link.consumed_at && link.booking_id)) {
        const { data: prior } = await supabase
            .from("tour_bookings")
            .select("id, status_key, start_at, end_at, timezone")
            .eq("id", link.booking_id)
            .maybeSingle();
        if (prior) return tourPublicJson({ ok: true, booking: prior, idempotent_replay: true });
        // Spent, but nothing to replay. Refuse rather than fall through and book
        // twice off one credential.
        if (auth.replay) return tourPublicErr("This link has already been used.", 409, { code: "consumed" });
    }

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return tourPublicErr("Invalid JSON", 400);
    }
    const ruleId = String(body.rule_id ?? "").trim();
    const startAt = body.start_at != null ? new Date(String(body.start_at)) : null;
    const endAt = body.end_at != null ? new Date(String(body.end_at)) : null;
    const timezone = String(body.timezone ?? "").trim();
    if (!ruleId || !startAt || !endAt || !timezone || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return tourPublicErr("rule_id, start_at, end_at, timezone required", 400);
    }

    const oppRes = await fetchOpportunityForTourAdmin(supabase, link.org_id, link.opportunity_id);
    if (!oppRes.ok) {
        return tourPublicErr("Invalid or unknown link", oppRes.status === 404 ? 404 : 400);
    }

    const locCheck = assertBookingLocationMatchesOpportunity(oppRes.row, link.location_id);
    if (!locCheck.ok) {
        return tourPublicErr("Invalid or unknown link", 400);
    }

    const { data: rule, error: rErr } = await supabase
        .from("tour_availability_rules")
        .select("id, org_id, location_id, approval_required, is_active")
        .eq("id", ruleId)
        .eq("org_id", link.org_id)
        .maybeSingle();
    if (rErr || !rule) return tourPublicErr("Rule not found", 400);
    const ru = rule as { location_id?: string | null; approval_required?: boolean; is_active?: boolean };
    if (ru.is_active === false) return tourPublicErr("Rule inactive", 400);
    if (ru.location_id != null && String(ru.location_id).trim() !== "" && String(ru.location_id).trim() !== link.location_id) {
        return tourPublicErr("Slot rule does not match link location", 400);
    }

    // LIVE REVALIDATION. The option snapshot in the sent message records what
    // was OFFERED; it is evidence, never authority. A slot is bookable only if
    // it is still in the current availability set — which is what makes a stale
    // email click safe, and what stops an arbitrary submitted slot from booking.
    const live = await computeAvailableTourSlots(supabase, {
        orgId: link.org_id,
        locationId: link.location_id,
        userId: null,
        from: new Date(startAt.getTime() - 60_000),
        to: new Date(endAt.getTime() + 60_000),
    });
    // `AvailableTourSlot` is camelCase (`startAt`, `ruleId`). An earlier
    // structural annotation here read snake_case, which yields NaN and silently
    // rejects EVERY booking — so this stays inferred against the real slot type
    // rather than a hand-written guess at its shape.
    const stillAvailable = live.some(
        (s) => new Date(s.startAt).getTime() === startAt.getTime() && (!s.ruleId || s.ruleId === ruleId)
    );
    if (!stillAvailable) {
        // Not a dead end: the surface sends the parent back to current options.
        return tourPublicErr("That time is no longer available. Please choose another.", 409, {
            code: "SLOT_UNAVAILABLE",
        });
    }

    const input: CreateTourBookingInput = {
        orgId: link.org_id,
        opportunityId: link.opportunity_id,
        locationId: link.location_id,
        startAt,
        endAt,
        timezone,
        source: "public_link",
        requestedByUserId: null,
        primaryPersonId: oppRes.row.primary_person_id,
        primaryContactId: oppRes.row.primary_contact_id,
        approvalRequired: Boolean(ru.approval_required),
        metadata: { tour_public_booking_link_id: link.id, rule_id: ruleId },
    };

    try {
        const booking = await createTourBooking(supabase, input);

        // Atomic claim. Two concurrent requests race here and exactly one wins,
        // so at most one selection is ever recorded against this action.
        await consumeTourAction({ supabase, linkId: link.id, bookingId: booking.id });

        await supabase
            .from("tour_invitations")
            .update({ status: "booked", updated_at: new Date().toISOString() })
            .eq("id", invitation.id)
            .eq("status", "active");

        // A booked invitation makes outstanding select/decline actions meaningless.
        await invalidateIncompatibleTourActions({
            supabase,
            invitationId: invitation.id,
            keepLinkId: link.id,
            reason: "booked",
        });

        for (const event of ["tour_slot_selected", "tour_booked"] as const) {
            await recordTourEvent(supabase, {
                event,
                orgId: link.org_id,
                invitationId: invitation.id,
                recipientPersonId: invitation.recipient_person_id,
                opportunityId: invitation.opportunity_id,
                threadId: invitation.conversation_thread_id,
                bookingId: booking.id,
                detail: { start_at: booking.start_at, timezone: booking.timezone, status_key: booking.status_key },
            });
        }

        return tourPublicJson(
            {
                ok: true,
                booking: {
                    id: booking.id,
                    status_key: booking.status_key,
                    start_at: booking.start_at,
                    end_at: booking.end_at,
                    timezone: booking.timezone,
                },
            },
            { status: 201 }
        );
    } catch (e) {
        console.warn("[public tour-booking] createTourBooking failed", e instanceof Error ? e.message : e);
        return tourPublicErr("Booking could not be completed. Please try again or contact the site.", 400, { code: "BOOKING_FAILED" });
    }
}
