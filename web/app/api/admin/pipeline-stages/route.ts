import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from "next/server";

/** GET: list stages. ?pipeline_id= required for filtered list; without it returns all stages (for opportunity dropdown lookup). */
export async function GET(request: NextRequest) {
    const pipelineId = request.nextUrl.searchParams.get("pipeline_id");
    try {
        const supabase = createAdminClient();
        let query = supabase
            .from("pipeline_stages")
            .select("id, pipeline_id, name, position, show_in_funnel, show_in_pie_chart, ghl_stage_uuid");
        if (pipelineId) query = query.eq("pipeline_id", pipelineId);
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
    try {
        const supabase = createAdminClient();
        const body = await request.json();
        const { data, error } = await supabase
            .from("pipeline_stages")
            .insert([body])
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
