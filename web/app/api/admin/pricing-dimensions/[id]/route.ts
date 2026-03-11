import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** PATCH: update dimension_name, dimension_key, vertical_id, is_active */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    if (body.dimension_name !== undefined) updates.dimension_name = body.dimension_name === "" ? null : body.dimension_name;
    if (body.dimension_key !== undefined) updates.dimension_key = body.dimension_key === "" ? null : body.dimension_key;
    if (body.vertical_id !== undefined) updates.vertical_id = body.vertical_id === "" ? null : body.vertical_id;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });
    (updates as { updated_at: string }).updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("pricing_dimensions").update(updates).eq("id", id).select("id, dimension_name, dimension_key, vertical_id, is_active, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
}
