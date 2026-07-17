import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { buildTourAvailabilityRulePatch } from "@/lib/tours/admin/tourAvailabilityRuleMutation";

/** PATCH /api/admin/tours/availability-rules/[ruleId] */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { ruleId } = await params;
    const id = String(ruleId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patchResult = buildTourAvailabilityRulePatch(body);
    if (!patchResult.ok) return NextResponse.json({ error: patchResult.error }, { status: 400 });

    const supabase = createAdminClient();
    const { data: existing, error: e0 } = await supabase
        .from("tour_availability_rules")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("id", id)
        .maybeSingle();
    if (e0 || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (
        patchResult.patch.location_id !== undefined &&
        patchResult.patch.location_id != null &&
        patchResult.patch.location_id !== ""
    ) {
        const lid = patchResult.patch.location_id;
        const { data: loc } = await supabase.from("locations").select("id").eq("id", lid).eq("org_id", ctx.orgId).maybeSingle();
        if (!loc) return NextResponse.json({ error: "location_id not found for org" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("tour_availability_rules")
        .update(patchResult.patch)
        .eq("org_id", ctx.orgId)
        .eq("id", id)
        .select("*")
        .single();
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
