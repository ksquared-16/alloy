import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { evaluateDeletionEligibility } from "@/lib/admin/deletionEligibility";

/** DELETE: hard delete (admin only). Enforces lifecycle eligibility. */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const eligibility = await evaluateDeletionEligibility("pricing_dimension_values", id, { orgId: ctx.orgId });
    if (!eligibility.allowed) {
        return NextResponse.json(
            { error: eligibility.reason, recommended_action: eligibility.recommended_action },
            { status: 409 }
        );
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("pricing_dimension_values").delete().eq("id", id);
    if (error) {
        const msg = error.code === "23503" ? "Cannot delete: value is in use." : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}

/** PATCH: update value_label, value_key, sort_order, is_active */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const updates: Record<string, unknown> = {};
    if (body.value_label !== undefined) updates.value_label = body.value_label === "" ? null : body.value_label;
    if (body.value_key !== undefined) updates.value_key = body.value_key === "" ? null : body.value_key;
    if (body.sort_order !== undefined) {
        const n = body.sort_order === "" || body.sort_order === null ? null : Number(body.sort_order);
        updates.sort_order = n != null && Number.isFinite(n) ? n : null;
    }
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });
    (updates as { updated_at: string }).updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("pricing_dimension_values").update(updates).eq("id", id).select("id, value_label, value_key, sort_order, is_active, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
}
