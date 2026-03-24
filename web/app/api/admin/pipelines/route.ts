import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { NextRequest, NextResponse } from "next/server";

/** GET: list pipelines for caller org. */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("pipelines")
            .select("id, name")
            .eq("org_id", ctx.orgId)
            .order("name", { ascending: true });
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
        const nameRaw = body.name;
        const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : "Pipeline";
        const row = {
            name,
            ghl_pipeline_id: body.ghl_pipeline_id != null ? String(body.ghl_pipeline_id) : null,
            is_active: body.is_active !== false,
            org_id: ctx.orgId,
        };
        const { data, error } = await supabase.from("pipelines").insert([row]).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
