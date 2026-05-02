import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: single workflow in caller org. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.from("workflows").select("*").eq("id", id).eq("org_id", ctx.orgId).single();
        if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

const ALLOWED_KEYS = ["name", "description", "event_type", "entity_type", "enabled"] as const;

/** PATCH: update workflow (admin only). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const body = await request.json();
        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            updates[key] = body[key];
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }
        const { data, error } = await supabase.from("workflows").update(updates).eq("id", id).eq("org_id", ctx.orgId).select().single();
        if (error?.code === "PGRST116" || (!data && !error)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

/** DELETE: delete workflow (admin only). */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const { data: wf } = await supabase.from("workflows").select("id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
        if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });
        await supabase.from("workflow_conditions").delete().eq("workflow_id", id);
        await supabase.from("workflow_actions").delete().eq("workflow_id", id);
        const { error } = await supabase.from("workflows").delete().eq("id", id).eq("org_id", ctx.orgId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
