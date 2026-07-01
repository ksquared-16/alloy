import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { NextRequest, NextResponse } from "next/server";

const PATCH_KEYS = ["name", "ghl_pipeline_id", "is_active"] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const rowOk = await assertRowOrg(supabase, "pipelines", id, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const body = (await request.json()) as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        for (const key of PATCH_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "name") updates.name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : body.name;
            else if (key === "ghl_pipeline_id") updates.ghl_pipeline_id = body.ghl_pipeline_id != null ? String(body.ghl_pipeline_id) : null;
            else if (key === "is_active") updates.is_active = body.is_active !== false;
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }
        const { data, error } = await supabase
            .from("pipelines")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const rowOk = await assertRowOrg(supabase, "pipelines", id, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const { error } = await supabase.from("pipelines").delete().eq("id", id).eq("org_id", ctx.orgId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
