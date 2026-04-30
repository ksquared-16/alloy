import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import {
    fetchLatestWorkflowEventByOpportunityId,
    getActivitySignalForEntity,
    resolveActivitySignalRules,
} from "@/lib/admin/activitySignals";

function trimOrEmpty(v: unknown): string {
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
}

/**
 * GET — Activity Signals V1 for a single opportunity (workflow_events + metadata rules).
 * Used by AdminEntityDrawer header; mirrors queue enrichment without N duplicate implementations.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    if (!trimOrEmpty(opportunityId)) {
        return NextResponse.json({ error: "Missing opportunity id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", opportunityId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, status_key, status, work_unit_id")
        .eq("id", opportunityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (oppErr || !opp) {
        return NextResponse.json({ error: oppErr?.message ?? "Not found" }, { status: 404 });
    }

    const row = opp as { status_key?: string | null; status?: string | null; work_unit_id?: string | null };
    const statusKey = trimOrEmpty(row.status_key) || trimOrEmpty(row.status) || "";

    let workUnitMetadata: unknown = null;
    let departmentMetadata: unknown = null;
    const wuid = trimOrEmpty(row.work_unit_id);
    if (wuid) {
        const { data: wu } = await supabase
            .from("work_units")
            .select("metadata, department_id")
            .eq("id", wuid)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        workUnitMetadata = (wu as { metadata?: unknown } | null)?.metadata ?? null;
        const deptId = trimOrEmpty((wu as { department_id?: string | null } | null)?.department_id);
        if (deptId) {
            const { data: deptRow } = await supabase
                .from("departments")
                .select("metadata")
                .eq("id", deptId)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            departmentMetadata = (deptRow as { metadata?: unknown } | null)?.metadata ?? null;
        }
    }

    const rules = resolveActivitySignalRules(workUnitMetadata, departmentMetadata);

    let latestById: Awaited<ReturnType<typeof fetchLatestWorkflowEventByOpportunityId>>;
    try {
        latestById = await fetchLatestWorkflowEventByOpportunityId(supabase, ctx.orgId, [opportunityId]);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load workflow events";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    const ev = latestById.get(opportunityId);
    const events = ev ? [ev] : [];

    const sig = getActivitySignalForEntity({
        events,
        entity: { id: opportunityId, status_key: statusKey || null },
        rules,
    });

    return NextResponse.json(sig);
}
