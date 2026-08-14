import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createTourBooking } from "@/lib/tours/bookings/tourBookingService";
import type { CreateTourBookingInput } from "@/lib/tours/bookings/types";
import { parseTourManualLocalDateTime } from "@/lib/tours/bookings/parseTourManualLocalDateTime";
import { resolveTourLocationSlotDurationMinutes } from "@/lib/tours/availability/resolveTourLocationSlotDurationMinutes";
import { resolveTourLocationTimezone } from "@/lib/tours/availability/resolveTourLocationTimezone";
import { assertBookingLocationMatchesOpportunity, fetchOpportunityForTourAdmin } from "@/lib/tours/admin/opportunityTourContext";

type Body = {
    opportunity_id?: string;
    location_id?: string;
    start_at?: string;
    end_at?: string;
    timezone?: string;
    tour_date?: string;
    tour_time?: string;
    duration_minutes?: number;
    approval_required?: boolean;
    initial_status?: "requested" | "pending_approval" | "confirmed";
};

/**
 * POST /api/admin/tours/bookings — staff-created booking.
 * Org scope comes from admin session; opportunity/location are validated via DB reads (`fetchOpportunityForTourAdmin`), not queue payloads.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const opportunityId = String(body.opportunity_id ?? "").trim();
    const locationId = String(body.location_id ?? "").trim();
    const tourDate = body.tour_date != null ? String(body.tour_date).trim() : "";
    const tourTime = body.tour_time != null ? String(body.tour_time).trim() : "";
    const manualWall = Boolean(tourDate && tourTime);

    let startAt = body.start_at != null ? new Date(String(body.start_at)) : null;
    let endAt = body.end_at != null ? new Date(String(body.end_at)) : null;
    let timezone = String(body.timezone ?? "").trim();

    if (!opportunityId || !locationId) {
        return NextResponse.json({ error: "opportunity_id and location_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const oppRes = await fetchOpportunityForTourAdmin(supabase, ctx.orgId, opportunityId);
    if (!oppRes.ok) return NextResponse.json({ error: oppRes.message }, { status: oppRes.status });

    const locCheck = assertBookingLocationMatchesOpportunity(oppRes.row, locationId);
    if (!locCheck.ok) return NextResponse.json({ error: locCheck.message }, { status: 400 });

    const { data: locRow, error: lErr } = await supabase
        .from("locations")
        .select("id")
        .eq("id", locationId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (lErr || !locRow) return NextResponse.json({ error: "Location not found for org" }, { status: 400 });

    if (manualWall) {
        try {
            const resolvedTz = timezone || (await resolveTourLocationTimezone(supabase, ctx.orgId, locationId));
            const durationMinutes =
                Number.isFinite(Number(body.duration_minutes)) && Number(body.duration_minutes) > 0
                    ? Number(body.duration_minutes)
                    : await resolveTourLocationSlotDurationMinutes(supabase, ctx.orgId, locationId);
            const parsed = parseTourManualLocalDateTime({
                tourDate,
                tourTime,
                timezoneIana: resolvedTz,
                durationMinutes,
            });
            startAt = parsed.startAt;
            endAt = parsed.endAt;
            timezone = parsed.timezone;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return NextResponse.json({ error: msg || "Invalid manual tour date/time" }, { status: 400 });
        }
    }

    if (!startAt || !endAt || !timezone || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return NextResponse.json(
            { error: "start_at, end_at, timezone required (or tour_date + tour_time for manual entry)" },
            { status: 400 }
        );
    }

    const approvalRequired = Boolean(body.approval_required);

    const input: CreateTourBookingInput = {
        orgId: ctx.orgId,
        opportunityId,
        locationId,
        startAt,
        endAt,
        timezone,
        source: "admin",
        requestedByUserId: ctx.userId,
        primaryPersonId: oppRes.row.primary_person_id,
        primaryContactId: oppRes.row.primary_contact_id,
        approvalRequired,
        initialStatus: body.initial_status,
    };

    try {
        const row = await createTourBooking(supabase, input);
        return NextResponse.json({ booking: row }, { status: 201 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
