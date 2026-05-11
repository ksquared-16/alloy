import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";

type RulePatch = Partial<{
    location_id: string | null;
    user_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
    metadata: Record<string, unknown>;
}>;

/** PATCH /api/admin/tours/availability-rules/[ruleId] */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { ruleId } = await params;
    const id = String(ruleId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });

    let body: RulePatch;
    try {
        body = (await request.json()) as RulePatch;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: e0 } = await supabase
        .from("tour_availability_rules")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("id", id)
        .maybeSingle();
    if (e0 || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.location_id !== undefined && body.location_id != null && String(body.location_id).trim() !== "") {
        const lid = String(body.location_id).trim();
        const { data: loc } = await supabase.from("locations").select("id").eq("id", lid).eq("org_id", ctx.orgId).maybeSingle();
        if (!loc) return NextResponse.json({ error: "location_id not found for org" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(body)) {
        const v = body[k as keyof RulePatch];
        if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const { data, error } = await supabase.from("tour_availability_rules").update(patch).eq("org_id", ctx.orgId).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rule: data });
}

/** DELETE /api/admin/tours/availability-rules/[ruleId] */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { ruleId } = await params;
    const id = String(ruleId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase.from("tour_availability_rules").delete().eq("org_id", ctx.orgId).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
}
