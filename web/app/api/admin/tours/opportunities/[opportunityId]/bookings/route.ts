import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import { describeTourAttention, judgeTourBookingsAgainstCalendar } from "@/lib/tours/calendar/tourCalendarAttention";
import {
    listRequestedTourAttentionForOpportunity,
    type RequestedTourAttention,
} from "@/lib/tours/publicCalendar/requestedTourOperatorView";

const ACTIVE = [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS];

/** GET /api/admin/tours/opportunities/[opportunityId]/bookings */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ opportunityId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { opportunityId } = await params;
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return NextResponse.json({ error: "Missing opportunityId" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: opp, error: oErr } = await supabase
        .from("opportunities")
        .select("id")
        .eq("id", oid)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: rows, error } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("opportunity_id", oid)
        .order("start_at", { ascending: false })
        .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const activeSet = new Set<string>(ACTIVE);
    const active = (rows ?? []).filter((r) => activeSet.has(String((r as { status_key?: string }).status_key ?? "")));

    // Active bookings the location's Operating Calendar now puts outside operating time. The
    // booking itself is unchanged; this only makes the disagreement visible to the operator.
    // An unreadable calendar must not hide the family's bookings: it is reported as
    // unknown (null), never as "nothing needs attention" ({}).
    let calendar_attention: Record<string, { reason: string; message: string; entry_names: string[] }> | null = null;
    try {
        const affected = await judgeTourBookingsAgainstCalendar(supabase, {
            orgId: ctx.orgId,
            bookings: active.filter((r) => Date.parse(String((r as { end_at?: string }).end_at)) > Date.now()) as never,
        });
        calendar_attention = Object.fromEntries(
            affected.map((b) => [b.bookingId, { reason: b.reason, message: describeTourAttention(b), entry_names: b.entryNames }]),
        );
    } catch (e) {
        console.error("[tour bookings] operating calendar attention unavailable", e);
    }
    // A public tour request accepted with this lead that could not be booked (S7): the original
    // time and why, so the operator schedules from current availability. Null = unknown, not none.
    let requested_tour_attention: RequestedTourAttention[] | null = null;
    try {
        requested_tour_attention = await listRequestedTourAttentionForOpportunity(supabase, {
            orgId: ctx.orgId,
            opportunityId: oid,
            hasActiveBooking: active.length > 0,
        });
    } catch (e) {
        console.error("[tour bookings] requested tour attention unavailable", e);
    }
    return NextResponse.json({ bookings: rows ?? [], active_bookings: active, calendar_attention, requested_tour_attention });
}
