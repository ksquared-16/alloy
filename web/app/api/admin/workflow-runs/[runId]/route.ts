import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: workflow_run detail (enriched with workflow + event context). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const orgId = ctx.orgId;

    const { runId } = await params;
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: run, error } = await supabase
        .from("workflow_runs")
        .select("id, workflow_id, event_id, status, error, started_at, completed_at, event_payload")
        .eq("id", runId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const wfId = String((run as { workflow_id: string }).workflow_id);
    const evId = (run as { event_id?: string | null }).event_id ?? null;

    const [{ data: wf }, { data: ev }, { data: failedRows }] = await Promise.all([
        supabase.from("workflows").select("id, name, event_type, entity_type, enabled").eq("id", wfId).eq("org_id", orgId).maybeSingle(),
        evId
            ? supabase
                  .from("workflow_events")
                  .select("id, event_type, entity_type, entity_id, payload, occurred_at")
                  .eq("id", evId)
                  .eq("org_id", orgId)
                  .maybeSingle()
            : Promise.resolve({ data: null as any }),
        supabase
            .from("workflow_action_runs")
            .select("workflow_run_id")
            .eq("org_id", orgId)
            .eq("workflow_run_id", runId)
            .eq("status", "failed"),
    ]);

    const has_failed_action = (failedRows ?? []).length > 0;

    return NextResponse.json({
        run: {
            id: (run as { id: string }).id,
            workflow_id: wfId,
            workflow_name: (wf as { name?: string | null } | null)?.name ?? null,
            status: (run as { status: string }).status,
            error: (run as { error?: string | null }).error ?? null,
            started_at: (run as { started_at: string }).started_at,
            completed_at: (run as { completed_at?: string | null }).completed_at ?? null,
            event_payload: ((run as { event_payload?: unknown }).event_payload as Record<string, unknown>) ?? {},
            has_failed_action,
            event: ev
                ? {
                      id: (ev as { id: string }).id,
                      event_type: (ev as { event_type?: string | null }).event_type ?? null,
                      entity_type: (ev as { entity_type?: string | null }).entity_type ?? null,
                      entity_id: (ev as { entity_id?: string | null }).entity_id ?? null,
                      occurred_at: (ev as { occurred_at?: string | null }).occurred_at ?? null,
                      payload: ((ev as { payload?: unknown }).payload as Record<string, unknown>) ?? {},
                  }
                : null,
        },
    });
}

