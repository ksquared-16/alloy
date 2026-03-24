import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list conditions for a workflow in caller org. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const rowOk = await assertRowOrg(supabase, "workflows", id, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const { data, error } = await supabase.from("workflow_conditions").select("*").eq("workflow_id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

type ConditionInput = {
    target_entity?: string | null;
    field_path?: string | null;
    field?: string | null;
    operator?: string | null;
    value?: string | number | boolean | null | unknown[];
    enabled?: boolean | null;
};

function normalizeFieldPath(targetEntity: string | null, fieldPath: string): string {
    const p = fieldPath.trim();
    if (!p) return p;
    const entity = (targetEntity ?? "").trim();
    if ((entity === "vendor" || entity === "vendors") && p.startsWith("vendor.")) {
        return p.slice("vendor.".length).trim() || p;
    }
    return p;
}

/** PUT: replace all conditions (admin only). */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const body = await request.json();
        const conditions = Array.isArray(body.conditions) ? body.conditions : [];
        const supabase = createAdminClient();
        const rowOk = await assertRowOrg(supabase, "workflows", id, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        await supabase.from("workflow_conditions").delete().eq("workflow_id", id);
        if (conditions.length > 0) {
            const rows = conditions.map((c: ConditionInput) => {
                const fieldPath = normalizeFieldPath(
                    (c.target_entity ?? "").toString().trim() || null,
                    (c.field_path ?? c.field ?? "").toString().trim()
                );
                const op = (c.operator ?? "eq").toString().trim();
                const val = c.value;
                const valueJsonb = val === undefined || val === null ? null : typeof val === "object" ? val : Array.isArray(val) ? val : val;
                const row: Record<string, unknown> = {
                    workflow_id: id,
                    org_id: ctx.orgId,
                    target_entity: (c.target_entity ?? "").toString().trim() || null,
                    field_path: fieldPath || null,
                    operator: op || "eq",
                    value_jsonb: valueJsonb,
                    enabled: c.enabled !== false,
                };
                return row;
            });
            const { data, error } = await supabase.from("workflow_conditions").insert(rows).select();
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json(data ?? []);
        }
        return NextResponse.json([]);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
