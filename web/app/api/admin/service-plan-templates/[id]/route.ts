import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { evaluateDeletionEligibility } from "@/lib/admin/deletionEligibility";

/** DELETE: hard delete (admin only). Enforces lifecycle eligibility. */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const eligibility = await evaluateDeletionEligibility("service_plan_templates", id, { orgId: ctx.orgId });
    if (!eligibility.allowed) {
        return NextResponse.json(
            { error: eligibility.reason, recommended_action: eligibility.recommended_action },
            { status: 409 }
        );
    }

    const supabase = createAdminClient();
    let q = supabase.from("service_plan_templates").delete().eq("id", id);
    if (ctx.orgId) q = q.eq("org_id", ctx.orgId);
    const { error } = await q;
    if (error) {
        const msg = error.code === "23503" ? "Cannot delete: template is in use." : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}

/** PATCH: update plan_name, plan_key, is_recurring, recurrence_unit, recurrence_interval, is_active. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
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
    if (body.plan_name !== undefined) updates.plan_name = body.plan_name === "" ? null : body.plan_name;
    if (body.plan_key !== undefined) updates.plan_key = body.plan_key === "" ? null : body.plan_key;
    if (body.is_recurring !== undefined) updates.is_recurring = !!body.is_recurring;
    if (body.recurrence_unit !== undefined) updates.recurrence_unit = body.recurrence_unit === "" ? null : body.recurrence_unit;
    if (body.recurrence_interval !== undefined) {
        const n = Number(body.recurrence_interval);
        updates.recurrence_interval = Number.isNaN(n) || n < 1 ? 1 : n;
    }
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ ok: true });
    }
    (updates as { updated_at: string }).updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    let q = supabase.from("service_plan_templates").update(updates).eq("id", id);
    if (ctx.orgId) q = q.eq("org_id", ctx.orgId);
    const { data, error } = await q
        .select("id, plan_name, plan_key, is_recurring, recurrence_unit, recurrence_interval, is_active, updated_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
}
