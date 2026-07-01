import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { NextRequest, NextResponse } from "next/server";

const PATCH_KEYS = ["ghl_stage_uuid", "name", "position", "show_in_funnel", "show_in_pie_chart"] as const;

async function assertPipelineStageInOrg(supabase: SupabaseClient, stageId: string, orgId: string): Promise<boolean> {
    const { data: stage } = await supabase.from("pipeline_stages").select("pipeline_id").eq("id", stageId).maybeSingle();
    const pid = (stage as { pipeline_id?: string } | null)?.pipeline_id;
    if (!pid) return false;
    const ok = await assertRowOrg(supabase, "pipelines", pid, orgId);
    return ok.ok;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const allowed = await assertPipelineStageInOrg(supabase, id, ctx.orgId);
        if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const body = (await request.json()) as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        for (const key of PATCH_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "name") updates.name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : body.name;
            else if (key === "ghl_stage_uuid") updates.ghl_stage_uuid = body.ghl_stage_uuid ?? null;
            else if (key === "position") updates.position = typeof body.position === "number" && Number.isFinite(body.position) ? body.position : body.position;
            else if (key === "show_in_funnel") updates.show_in_funnel = body.show_in_funnel !== false;
            else if (key === "show_in_pie_chart") updates.show_in_pie_chart = body.show_in_pie_chart !== false;
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }
        const { data, error } = await supabase.from("pipeline_stages").update(updates).eq("id", id).select().single();
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
        const allowed = await assertPipelineStageInOrg(supabase, id, ctx.orgId);
        if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
