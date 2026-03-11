import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("gl_accounts")
        .select("id, code, name, type, currency, is_active, created_at, updated_at")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
}

const ALLOWED_KEYS = ["code", "name", "type", "currency", "is_active"] as const;

/** PATCH: update GL account. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
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
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("gl_accounts")
        .select("id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_KEYS) {
        if (body[key] === undefined) continue;
        if (key === "code" || key === "name" || key === "type" || key === "currency") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
        } else if (key === "is_active") {
            updates[key] = !!body[key];
        }
    }
    if (Object.keys(updates).length === 0) {
        const { data: current } = await supabase
            .from("gl_accounts")
            .select("id, code, name, type, currency, is_active, created_at, updated_at")
            .eq("id", id)
            .single();
        return NextResponse.json(current);
    }

    const { data: updated, error: updateErr } = await supabase
        .from("gl_accounts")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select("id, code, name, type, currency, is_active, created_at, updated_at")
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json(updated);
}
