import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";

type WorkflowSummaryRow = {
    id: string;
    name: string | null;
    enabled: boolean | null;
    entity_type: string | null;
    event_type: string | null;
    steps_count: number;
    last_run: {
        id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        has_failed_action: boolean;
    } | null;
};

/** GET: workflows summary for AdminV2 list (steps count + last run). */
export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const orgId = ctx.orgId;

    const supabase = createAdminClient();

    const [{ data: workflows, error: wfErr }, { data: actions, error: actErr }, { data: recentRuns, error: runErr }] =
        await Promise.all([
            supabase
                .from("workflows")
                .select("id, name, enabled, entity_type, event_type, updated_at")
                .eq("org_id", orgId)
                .order("updated_at", { ascending: false }),
            supabase.from("workflow_actions").select("id, workflow_id").eq("org_id", orgId),
            supabase
                .from("workflow_runs")
                .select("id, workflow_id, status, started_at, completed_at")
                .eq("org_id", orgId)
                .order("started_at", { ascending: false })
                .limit(500),
        ]);

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
            .in("workflow_run_id", runIds as any)
            .eq("status", "failed");
        runIdsWithFailedAction = new Set((failedRows ?? []).map((r) => String((r as { workflow_run_id: string }).workflow_run_id)));
    }

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

    return NextResponse.json({ workflows: rows });
}

