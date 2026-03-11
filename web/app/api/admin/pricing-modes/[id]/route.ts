import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** PATCH: update mode_key, mode_name, is_active */
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
    if (body.mode_key !== undefined) updates.mode_key = body.mode_key === "" ? null : body.mode_key;
    if (body.mode_name !== undefined) updates.mode_name = body.mode_name === "" ? null : body.mode_name;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });
    (updates as { updated_at: string }).updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("pricing_modes").update(updates).eq("id", id).select("id, mode_key, mode_name, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
}
