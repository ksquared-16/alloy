import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** PATCH: update role (role_label, is_active). Admin only. Cannot edit role_key, org_id, is_system. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ role_key: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { role_key } = await context.params;
    if (!role_key) {
        return NextResponse.json({ error: "Missing role_key" }, { status: 400 });
    }

    let body: { role_label?: string; is_active?: boolean } = {};
    try {
        body = (await request.json()) as { role_label?: string; is_active?: boolean };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing, error: fetchErr } = await supabase
        .from("role_definitions")
        .select("role_key, is_system")
        .eq("org_id", ctx.orgId)
        .eq("role_key", role_key)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const is_system = (existing as { is_system: boolean }).is_system;
    const updates: { role_label?: string; is_active?: boolean } = {};
    if (typeof body.role_label === "string") {
        updates.role_label = body.role_label.trim();
    }
    if (typeof body.is_active === "boolean") {
        if (is_system && body.is_active === false) {
            return NextResponse.json({ error: "System roles cannot be deactivated" }, { status: 400 });
        }
        updates.is_active = body.is_active;
    }

    if (Object.keys(updates).length === 0) {
        const { data: current } = await supabase
            .from("role_definitions")
            .select("role_key, role_label, is_system, is_active, created_at")
            .eq("org_id", ctx.orgId)
            .eq("role_key", role_key)
            .single();
        return NextResponse.json(current ?? {});
    }

    const { data: updated, error: updateErr } = await supabase
        .from("role_definitions")
        .update(updates)
        .eq("org_id", ctx.orgId)
        .eq("role_key", role_key)
        .select("role_key, role_label, is_system, is_active, created_at")
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json(updated);
}
