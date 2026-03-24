import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { NextRequest, NextResponse } from "next/server";

/** GET: stages for caller org; optional ?pipeline_id= (must belong to org). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const pipelineId = request.nextUrl.searchParams.get("pipeline_id");
    try {
        const supabase = createAdminClient();
        let query = supabase
            .from("pipeline_stages")
            .select("id, pipeline_id, name, position, show_in_funnel, show_in_pie_chart, ghl_stage_uuid");
        if (pipelineId) {
            const rowOk = await assertRowOrg(supabase, "pipelines", pipelineId, ctx.orgId);
            if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
            query = query.eq("pipeline_id", pipelineId);
        } else {
            const { data: pipes, error: pe } = await supabase.from("pipelines").select("id").eq("org_id", ctx.orgId);
            if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
            const ids = (pipes ?? []).map((p: { id: string }) => p.id);
            if (ids.length === 0) return NextResponse.json([]);
            query = query.in("pipeline_id", ids);
        }
        const { data, error } = await query.order("position", { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const body = (await request.json()) as Record<string, unknown>;
        const pipelineId = typeof body.pipeline_id === "string" ? body.pipeline_id : "";
        if (!pipelineId) {
            return NextResponse.json({ error: "pipeline_id is required" }, { status: 400 });
        }
        const rowOk = await assertRowOrg(supabase, "pipelines", pipelineId, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const nameRaw = body.name;
        const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : "Stage";
        const position = typeof body.position === "number" && Number.isFinite(body.position) ? body.position : 0;
        const row = {
            pipeline_id: pipelineId,
            ghl_stage_uuid: body.ghl_stage_uuid != null ? body.ghl_stage_uuid : null,
            name,
            position,
            show_in_funnel: body.show_in_funnel !== false,
            show_in_pie_chart: body.show_in_pie_chart !== false,
            org_id: ctx.orgId,
        };
        const { data, error } = await supabase.from("pipeline_stages").insert([row]).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
