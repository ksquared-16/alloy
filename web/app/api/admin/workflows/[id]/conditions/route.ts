import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

/** GET: list conditions for a workflow. */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("workflow_conditions")
            .select("*")
            .eq("workflow_id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

/** PUT: replace all conditions (admin only). Body: { conditions: [{ field, operator, value }] } */
export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const body = await request.json();
        const conditions = Array.isArray(body.conditions) ? body.conditions : [];
        const supabase = createAdminClient();
        await supabase.from("workflow_conditions").delete().eq("workflow_id", id);
        if (conditions.length > 0) {
            const rows = conditions.map((c: { field: string; operator: string; value: string }) => ({
                workflow_id: id,
                field: String(c.field ?? ""),
                operator: String(c.operator ?? "equals"),
                value: c.value != null ? String(c.value) : "",
            }));
            const { data, error } = await supabase.from("workflow_conditions").insert(rows).select();
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json(data ?? []);
        }
        return NextResponse.json([]);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
