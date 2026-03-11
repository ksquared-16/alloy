import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** DELETE: hard delete (admin only). Fails if offering is in use. */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    let q = supabase.from("service_offerings").delete().eq("id", id);
    if (ctx.orgId) q = q.eq("org_id", ctx.orgId);
    const { error } = await q;
    if (error) {
        const msg = error.code === "23503" ? "Cannot delete: offering is in use." : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}

/** PATCH: update offering_name, offering_key, is_active, description. */
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
    if (body.offering_name !== undefined) updates.offering_name = body.offering_name === "" ? null : body.offering_name;
    if (body.offering_key !== undefined) updates.offering_key = body.offering_key === "" ? null : body.offering_key;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (body.description !== undefined) updates.description = body.description === "" ? null : body.description;
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ ok: true });
    }
    (updates as { updated_at: string }).updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    let q = supabase.from("service_offerings").update(updates).eq("id", id);
    if (ctx.orgId) q = q.eq("org_id", ctx.orgId);
    const { data, error } = await q.select("id, offering_name, offering_key, is_active, description, updated_at").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
}
