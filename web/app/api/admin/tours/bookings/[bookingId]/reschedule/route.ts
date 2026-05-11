import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { rescheduleTourBooking } from "@/lib/tours/bookings/tourBookingService";

type Body = { start_at?: string; end_at?: string; timezone?: string | null; location_id?: string | null };

/** POST /api/admin/tours/bookings/[bookingId]/reschedule */
export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { bookingId } = await params;
    const id = String(bookingId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const startAt = body.start_at != null ? new Date(String(body.start_at)) : null;
    const endAt = body.end_at != null ? new Date(String(body.end_at)) : null;
    if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return NextResponse.json({ error: "start_at and end_at required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fe } = await supabase
        .from("tour_bookings")
        .select("opportunity_id")
        .eq("org_id", ctx.orgId)
        .eq("id", id)
        .maybeSingle();
    if (fe || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextLoc = body.location_id != null && String(body.location_id).trim() !== "" ? String(body.location_id).trim() : undefined;
    if (nextLoc) {
        const oid = String((existing as { opportunity_id: string }).opportunity_id ?? "").trim();
        const { data: opp } = await supabase
            .from("opportunities")
            .select("location_id")
            .eq("id", oid)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const pinned = (opp as { location_id?: string | null } | null)?.location_id;
        if (pinned && String(pinned).trim() && String(pinned).trim() !== nextLoc) {
            return NextResponse.json({ error: "location_id must match the opportunity's location" }, { status: 400 });
        }
        const { data: locRow } = await supabase.from("locations").select("id").eq("id", nextLoc).eq("org_id", ctx.orgId).maybeSingle();
        if (!locRow) return NextResponse.json({ error: "Location not found for org" }, { status: 400 });
    }

    try {
        const row = await rescheduleTourBooking(supabase, ctx.orgId, id, {
            startAt,
            endAt,
            timezone: body.timezone ?? null,
            locationId: body.location_id ?? null,
        });
        return NextResponse.json({ booking: row });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
