import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

export type WorkflowActionRunRow = {
    id: string;
    workflow_run_id: string;
    action_order: number;
    action_type: string;
    status: string;
    error: string | null;
    meta: Record<string, unknown>;
    started_at: string;
    completed_at: string | null;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
};

/** GET: list workflow_action_runs for a given workflow run (caller org). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { runId } = await params;
    if (!runId) {
        return NextResponse.json({ error: "runId required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: runRow } = await supabase
        .from("workflow_runs")
        .select("id")
        .eq("id", runId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (!runRow) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const { data: rows, error } = await supabase
        .from("workflow_action_runs")
        .select("id, workflow_run_id, action_order, action_type, status, error, meta, started_at, completed_at, inputs, outputs")
        .eq("workflow_run_id", runId)
        .eq("org_id", ctx.orgId)
        .order("action_order", { ascending: true })
        .order("started_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const action_runs: WorkflowActionRunRow[] = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        workflow_run_id: (r as { workflow_run_id: string }).workflow_run_id,
        action_order: (r as { action_order: number }).action_order ?? 0,
        action_type: (r as { action_type: string }).action_type ?? "",
        status: (r as { status: string }).status ?? "started",
        error: (r as { error: string | null }).error ?? null,
        meta: ((r as { meta: unknown }).meta as Record<string, unknown>) ?? {},
        started_at: (r as { started_at: string }).started_at,
        completed_at: (r as { completed_at: string | null }).completed_at ?? null,
        inputs: ((r as { inputs: unknown }).inputs as Record<string, unknown>) ?? {},
        outputs: ((r as { outputs: unknown }).outputs as Record<string, unknown>) ?? {},
    }));

    return NextResponse.json({ action_runs });
}
