import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { fetchOpportunityForTourAdmin, assertBookingLocationMatchesOpportunity } from "@/lib/tours/admin/opportunityTourContext";

type RuleInsert = {
    location_id?: string | null;
    user_id?: string | null;
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    timezone?: string;
    slot_duration_minutes?: number;
    buffer_minutes?: number;
    max_bookings_per_slot?: number;
    approval_required?: boolean;
    is_active?: boolean;
    metadata?: Record<string, unknown>;
};

/** GET /api/admin/tours/availability-rules?location_id= */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const locationId = (searchParams.get("location_id") ?? "").trim();

    const supabase = createAdminClient();
    let q = supabase.from("tour_availability_rules").select("*").eq("org_id", ctx.orgId).order("created_at", { ascending: true });
    if (locationId) q = q.eq("location_id", locationId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rules: data ?? [] });
}

/** POST /api/admin/tours/availability-rules */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: RuleInsert;
    try {
        body = (await request.json()) as RuleInsert;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const day = Number(body.day_of_week);
    const start_time = String(body.start_time ?? "").trim();
    const end_time = String(body.end_time ?? "").trim();
    const timezone = String(body.timezone ?? "").trim();
    const slot_duration_minutes = Number(body.slot_duration_minutes);
    if (!Number.isFinite(day) || day < 0 || day > 6 || !start_time || !end_time || !timezone || !Number.isFinite(slot_duration_minutes)) {
        return NextResponse.json({ error: "day_of_week (0–6), start_time, end_time, timezone, slot_duration_minutes required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const location_id = body.location_id != null && String(body.location_id).trim() !== "" ? String(body.location_id).trim() : null;
    if (location_id) {
        const { data: loc } = await supabase.from("locations").select("id").eq("id", location_id).eq("org_id", ctx.orgId).maybeSingle();
        if (!loc) return NextResponse.json({ error: "location_id not found for org" }, { status: 400 });
    }

    const row = {
        org_id: ctx.orgId,
        location_id,
        user_id: body.user_id != null && String(body.user_id).trim() !== "" ? String(body.user_id).trim() : null,
        day_of_week: day,
        start_time,
        end_time,
        timezone,
        slot_duration_minutes,
        buffer_minutes: Number.isFinite(Number(body.buffer_minutes)) ? Number(body.buffer_minutes) : 0,
        max_bookings_per_slot: Number.isFinite(Number(body.max_bookings_per_slot)) ? Number(body.max_bookings_per_slot) : 1,
        approval_required: Boolean(body.approval_required),
        is_active: body.is_active !== false,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    };

    const { data, error } = await supabase.from("tour_availability_rules").insert(row).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rule: data }, { status: 201 });
}
