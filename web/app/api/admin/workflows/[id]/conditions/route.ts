import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireWorkflowConfigurationCapability } from "@/lib/access/workflowAuthority";

/** GET: list conditions for a workflow in caller org. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ctx = await getAdminContextCached();
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
    if ((entity === "location" || entity === "locations") && p.startsWith("location.")) {
        return p.slice("location.".length).trim() || p;
    }
    return p;
}

/** PUT: replace all conditions (admin only). */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    /*
     * WORKFLOW CONFIGURATION — replaces a Workflow's conditions.
     *
     * `requireAdmin()` stood here, and it is a ROLE TITLE (`auth.role !== "admin"`), not an
     * authority: it admitted an admin whose package withholds `ops.workflows.write` and
     * refused a custom Workflow Writer who holds it. The key has owned this operation since
     * AI + Agent Authority V2 activated it for the Workflow Assist apply path, which commits
     * into these same tables, so nothing is invented here.
     */
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireWorkflowConfigurationCapability(access);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const body = await request.json();
        const conditions = Array.isArray(body.conditions) ? body.conditions : [];
        const supabase = createAdminClient();
        const rowOk = await assertRowOrg(supabase, "workflows", id, ctx.orgId);
        if (!rowOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        /*
         * STORE WHAT THE TABLE HAS. `workflow_conditions` is `field / operator / value (text) / org_id`
         * (baseline schema; no migration ever added `field_path`, `value_jsonb`, `target_entity` or
         * `enabled`). Writing those columns failed every insert — AFTER the old conditions had already
         * been deleted, so a workflow silently lost its conditions. The evaluator reads `field_path ?? field`
         * and `value_jsonb ?? value`, and compares as strings, so `field` + text `value` is the whole contract.
         *
         * Replace safely: insert the new set first, then remove the previous rows. A failed insert leaves
         * the workflow's existing conditions exactly as they were, and the failure is reported.
         */
        const { data: previous, error: readErr } = await supabase.from("workflow_conditions").select("id").eq("workflow_id", id);
        if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
        const previousIds = ((previous ?? []) as Array<{ id: string }>).map((r) => r.id);

        const rows = conditions.map((c: ConditionInput) => {
            const field = (c.field_path ?? c.field ?? "").toString().trim();
            const val = c.value;
            const value =
                val === undefined || val === null ? null : typeof val === "object" ? JSON.stringify(val) : String(val);
            return { workflow_id: id, org_id: ctx.orgId, field, operator: (c.operator ?? "eq").toString().trim() || "eq", value };
        });
        if (rows.some((r: { field: string }) => !r.field)) {
            return NextResponse.json({ error: "Every condition needs a field." }, { status: 400 });
        }
        let inserted: unknown[] = [];
        if (rows.length > 0) {
            const { data, error } = await supabase.from("workflow_conditions").insert(rows).select();
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            inserted = data ?? [];
        }
        if (previousIds.length > 0) {
            const { error: delErr } = await supabase.from("workflow_conditions").delete().in("id", previousIds);
            if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
        }
        return NextResponse.json(inserted);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
