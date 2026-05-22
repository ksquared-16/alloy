import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import {
    isUuidString,
    partitionWorkflowsByWorkspaceScope,
    type WorkflowWithScopeRow,
} from "@/lib/workflows/workflowScopeMetadata";

type WorkflowSummaryRow = {
    id: string;
    name: string | null;
    enabled: boolean | null;
    entity_type: string | null;
    event_type: string | null;
    steps_count: number;
    metadata?: Record<string, unknown> | null;
    last_run: {
        id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        has_failed_action: boolean;
    } | null;
};

type WorkflowCardRow = {
    id: string;
    name: string | null;
    enabled: boolean | null;
    entity_type: string | null;
    event_type: string | null;
    steps_count: number;
};

/** GET: workflows summary for AdminV2 list (steps count + last run). */
export async function GET(request: NextRequest) {
    const t0 = Date.now();
    const gate = await requireAdminOrgContextLight();
    const gateMs = Date.now() - t0;
    if (gate instanceof Response) return gate;
    const orgId = gate.orgId;

    const variant = (request.nextUrl.searchParams.get("variant") ?? "").trim();
    const departmentId = (request.nextUrl.searchParams.get("department_id") ?? "").trim();
    const workUnitId = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim();
    const scopeContext = {
        department_id: isUuidString(departmentId) ? departmentId : null,
        work_unit_id: isUuidString(workUnitId) ? workUnitId : null,
    };

    if (variant === "workspace") {
        const supabase = createAdminClient();
        const wfPromise = supabase
            .from("workflows")
            .select("id, name, enabled, entity_type, event_type, metadata")
            .eq("org_id", orgId)
            .order("updated_at", { ascending: false });
        const actPromise = supabase.from("workflow_actions").select("id, workflow_id").eq("org_id", orgId);
        const runPromise = supabase
            .from("workflow_runs")
            .select("id, workflow_id, status, started_at, completed_at")
            .eq("org_id", orgId)
            .order("started_at", { ascending: false })
            .limit(200);

        const tp0 = Date.now();
        const [{ data: workflows, error: wfErr }, { data: actions, error: actErr }, { data: recentRuns, error: runErr }] =
            await Promise.all([wfPromise, actPromise, runPromise]);
        const parallelCardMs = Date.now() - tp0;

        if (wfErr) return NextResponse.json({ error: wfErr.message }, { status: 500 });
        if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });
        if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });

        const stepsCountByWorkflowId = new Map<string, number>();
        for (const a of actions ?? []) {
            const wid = String((a as { workflow_id?: string }).workflow_id ?? "");
            if (!wid) continue;
            stepsCountByWorkflowId.set(wid, (stepsCountByWorkflowId.get(wid) ?? 0) + 1);
        }

        const runIds = (recentRuns ?? []).map((r) => (r as { id: string }).id);
        let runIdsWithFailedAction = new Set<string>();
        if (runIds.length) {
            const { data: failedRows } = await supabase
                .from("workflow_action_runs")
                .select("workflow_run_id")
                .eq("org_id", orgId)
                .in("workflow_run_id", runIds as string[])
                .eq("status", "failed");
            runIdsWithFailedAction = new Set(
                (failedRows ?? []).map((r) => String((r as { workflow_run_id: string }).workflow_run_id))
            );
        }

        const lastRunByWorkflowId = new Map<string, WorkflowSummaryRow["last_run"]>();
        for (const r of recentRuns ?? []) {
            const wid = String((r as { workflow_id?: string }).workflow_id ?? "");
            if (!wid || lastRunByWorkflowId.has(wid)) continue;
            const id = String((r as { id: string }).id);
            lastRunByWorkflowId.set(wid, {
                id,
                status: String((r as { status?: string }).status ?? "unknown"),
                started_at: String((r as { started_at?: string }).started_at ?? ""),
                completed_at: ((r as { completed_at?: string | null }).completed_at ?? null) as string | null,
                has_failed_action: runIdsWithFailedAction.has(id),
            });
        }

        const rows: WorkflowSummaryRow[] = (workflows ?? []).map((w) => {
            const id = String((w as { id: string }).id);
            const md = (w as { metadata?: unknown }).metadata;
            return {
                id,
                name: (w as { name?: string | null }).name ?? null,
                enabled: (w as { enabled?: boolean | null }).enabled ?? null,
                entity_type: (w as { entity_type?: string | null }).entity_type ?? null,
                event_type: (w as { event_type?: string | null }).event_type ?? null,
                steps_count: stepsCountByWorkflowId.get(id) ?? 0,
                metadata: md && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : {},
                last_run: lastRunByWorkflowId.get(id) ?? null,
            };
        });

        const totalMs = Date.now() - t0;
        if (totalMs > 300) {
            console.warn("[admin-timing] GET /api/admin/workflows/summary variant=workspace", {
                total_ms: totalMs,
                portal_gate_ms: gateMs,
                light_context: true,
                parallel_queries_ms: parallelCardMs,
                workflow_count: rows.length,
            });
        }

        if (scopeContext.department_id || scopeContext.work_unit_id) {
            const partitions = partitionWorkflowsByWorkspaceScope(rows as WorkflowWithScopeRow[], scopeContext);
            return NextResponse.json({ workflows: rows, partitions });
        }

        return NextResponse.json({ workflows: rows });
    }

    const supabase = createAdminClient();

    const tw0 = Date.now();
    const wfQ = supabase
        .from("workflows")
        .select("id, name, enabled, entity_type, event_type, updated_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false });
    const actQ = supabase.from("workflow_actions").select("id, workflow_id").eq("org_id", orgId);
    const runQ = supabase
        .from("workflow_runs")
        .select("id, workflow_id, status, started_at, completed_at")
        .eq("org_id", orgId)
        .order("started_at", { ascending: false })
        .limit(200);

    const [{ data: workflows, error: wfErr }, { data: actions, error: actErr }, { data: recentRuns, error: runErr }] =
        await Promise.all([wfQ, actQ, runQ]);
    const parallelMs = Date.now() - tw0;

    if (wfErr) return NextResponse.json({ error: wfErr.message }, { status: 500 });
    if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });
    if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });

    const stepsCountByWorkflowId = new Map<string, number>();
    for (const a of actions ?? []) {
        const wid = String((a as { workflow_id?: string }).workflow_id ?? "");
        if (!wid) continue;
        stepsCountByWorkflowId.set(wid, (stepsCountByWorkflowId.get(wid) ?? 0) + 1);
    }

    const runIds = (recentRuns ?? []).map((r) => (r as { id: string }).id);
    let runIdsWithFailedAction = new Set<string>();
    const t3 = Date.now();
    if (runIds.length) {
        const { data: failedRows } = await supabase
            .from("workflow_action_runs")
            .select("workflow_run_id")
            .eq("org_id", orgId)
            .in("workflow_run_id", runIds as any)
            .eq("status", "failed");
        runIdsWithFailedAction = new Set((failedRows ?? []).map((r) => String((r as { workflow_run_id: string }).workflow_run_id)));
    }
    const failedLookupMs = Date.now() - t3;

    const lastRunByWorkflowId = new Map<string, WorkflowSummaryRow["last_run"]>();
    for (const r of recentRuns ?? []) {
        const wid = String((r as { workflow_id?: string }).workflow_id ?? "");
        if (!wid) continue;
        if (lastRunByWorkflowId.has(wid)) continue;
        const id = String((r as { id: string }).id);
        lastRunByWorkflowId.set(wid, {
            id,
            status: String((r as { status?: string }).status ?? "unknown"),
            started_at: String((r as { started_at?: string }).started_at ?? ""),
            completed_at: ((r as { completed_at?: string | null }).completed_at ?? null) as string | null,
            has_failed_action: runIdsWithFailedAction.has(id),
        });
    }

    const rows: WorkflowSummaryRow[] = (workflows ?? []).map((w) => {
        const id = String((w as { id: string }).id);
        return {
            id,
            name: (w as { name?: string | null }).name ?? null,
            enabled: (w as { enabled?: boolean | null }).enabled ?? null,
            entity_type: (w as { entity_type?: string | null }).entity_type ?? null,
            event_type: (w as { event_type?: string | null }).event_type ?? null,
            steps_count: stepsCountByWorkflowId.get(id) ?? 0,
            last_run: lastRunByWorkflowId.get(id) ?? null,
        };
    });

    const totalMs = Date.now() - t0;
    if (totalMs > 300) {
        console.warn("[admin-timing] GET /api/admin/workflows/summary full", {
            total_ms: totalMs,
            portal_gate_ms: gateMs,
            light_context: true,
            parallel_queries_ms: parallelMs,
            failed_action_lookup_ms: failedLookupMs,
            workflow_count: (workflows ?? []).length,
        });
    }

    return NextResponse.json({ workflows: rows });
}
