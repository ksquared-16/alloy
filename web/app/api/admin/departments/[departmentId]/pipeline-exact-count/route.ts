import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { getWorkUnitQueueSummaries, QueueServiceError } from "@/lib/queues/QueueService";

/**
 * Exact primary-lane (all-records) count for the department's `pipeline_overview` work unit.
 * Same QueueService path and filters as GET /api/admin/queues/{workUnitId}/{queueKey} for that lane.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const deptOk = await assertRowOrg(supabase, "departments", departmentId, ctx.orgId);
    if (!deptOk.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: wuRow, error: wuErr } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("department_id", departmentId)
        .eq("key", "pipeline_overview")
        .maybeSingle();

    if (wuErr) {
        return NextResponse.json({ error: wuErr.message || "Failed to load pipeline work unit" }, { status: 500 });
    }
    const workUnitId = wuRow != null && typeof (wuRow as { id?: unknown }).id === "string" ? String((wuRow as { id: string }).id) : "";
    if (!workUnitId) {
        return NextResponse.json({
            work_unit_id: null,
            queue_key: null,
            total: null,
            code: "no_pipeline_overview_work_unit",
        });
    }

    try {
        const result = await getWorkUnitQueueSummaries({
            orgId: ctx.orgId,
            workUnitId,
            limit: 3,
            includePreviews: false,
            countAccuracy: "exact",
        });
        const total = result.work_unit_scope_total ?? null;
        const queue_key = result.work_unit_scope_queue_key ?? null;

        console.warn("[pipeline-count-unify]", {
            surface: "api",
            source: "pipeline-exact-count",
            department_id: departmentId,
            work_unit_id: workUnitId,
            queue_key,
            total,
        });

        return NextResponse.json({
            work_unit_id: workUnitId,
            queue_key,
            total,
        });
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
