import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { computeOpportunityLifecycleKpis } from "@/lib/workspace/computeOpportunityLifecycleKpis";
import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";

const MAX_ROWS = 10_000;

/**
 * GET — Org-wide opportunity lifecycle aggregates for Growth-slice departments (Enrollment, Growth).
 * Uses the same effective lifecycle rules as queue/list presentation (status_definitions + quote_total).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const supabase = createAdminClient();

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, key")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (deptErr || !dept) {
        return NextResponse.json({ error: deptErr?.message ?? "Department not found" }, { status: 404 });
    }

    const deptKey = (dept as { key?: string | null }).key ?? null;
    if (!isGrowthSliceDepartmentKey(deptKey)) {
        return NextResponse.json(
            { error: "Lifecycle KPIs are only available for pipeline departments (e.g. Enrollment, Growth)." },
            { status: 400 }
        );
    }

    const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", { activeOnly: true });

    const { data: rows, error: oppErr } = await supabase
        .from("opportunities")
        .select("status_key, quote_total")
        .eq("org_id", ctx.orgId)
        .limit(MAX_ROWS);

    if (oppErr) {
        return NextResponse.json({ error: oppErr.message }, { status: 500 });
    }

    const snapshot = computeOpportunityLifecycleKpis((rows ?? []) as { status_key: string | null; quote_total: number | null }[], defs);

    return NextResponse.json({
        department_id: departmentId,
        department_key: deptKey,
        truncated: (rows?.length ?? 0) >= MAX_ROWS,
        ...snapshot,
    });
}
