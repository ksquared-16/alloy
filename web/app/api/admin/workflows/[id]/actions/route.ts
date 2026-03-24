import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list actions for a workflow in caller org. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const rowOk = await assertRowOrg(supabase, "workflows", id, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const { data, error } = await supabase
            .from("workflow_actions")
            .select("id, workflow_id, action_order, action_type, target_entity, payload")
            .eq("workflow_id", id)
            .order("action_order", { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

/** PUT: replace all actions (admin only). Body: { actions: [{ action_type, target_entity?, payload? }] }. */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const body = await request.json();
        const actions = Array.isArray(body.actions) ? body.actions : [];
        const supabase = createAdminClient();
        const rowOk = await assertRowOrg(supabase, "workflows", id, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        await supabase.from("workflow_actions").delete().eq("workflow_id", id);
        if (actions.length > 0) {
            const rows = actions.map(
                (a: { action_type: string; target_entity?: string; payload?: Record<string, unknown> }, i: number) => ({
                    workflow_id: id,
                    org_id: ctx.orgId,
                    action_order: i + 1,
                    action_type: String(a.action_type ?? "log"),
                    target_entity: a.target_entity != null ? String(a.target_entity) : null,
                    payload: a.payload && typeof a.payload === "object" ? a.payload : {},
                })
            );
            const { data, error } = await supabase.from("workflow_actions").insert(rows).select();
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json(data ?? []);
        }
        return NextResponse.json([]);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
