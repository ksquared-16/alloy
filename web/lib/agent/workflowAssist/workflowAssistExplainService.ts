import type { SupabaseClient } from "@supabase/supabase-js";

import {
    buildWorkflowAssistExplainV1,
    normalizeWorkflowAssistEntityType,
    rangeToFromIso,
    type WorkflowAssistExplainRequestV1,
    type WorkflowAssistExplainResponseV1,
    type WorkflowAssistExplainSourceDataV1,
} from "@/lib/agent/workflowAssist/workflowAssistExplainV1";

function extractSkipReason(eventPayload: unknown): string | null {
    if (eventPayload == null || typeof eventPayload !== "object") return null;
    const p = eventPayload as Record<string, unknown>;
    const meta = p.metadata;
    if (meta != null && typeof meta === "object") {
        const sr = (meta as Record<string, unknown>).skip_reason;
        if (sr != null && String(sr).trim()) return String(sr).trim();
    }
    if (p.skip_reason != null && String(p.skip_reason).trim()) return String(p.skip_reason).trim();
    return null;
}

/**
 * Org-scoped read path for Explain v0 — queries workflow_events, workflows, workflow_runs, workflow_action_runs.
 */
export async function fetchWorkflowAssistExplainV1(
    supabase: SupabaseClient,
    orgId: string,
    request: WorkflowAssistExplainRequestV1
): Promise<WorkflowAssistExplainResponseV1> {
    const normalized_entity_type = normalizeWorkflowAssistEntityType(request.entity_type) ?? request.entity_type;
    const fromIso = rangeToFromIso(request.range ?? null);

    let evQ = supabase
        .from("workflow_events")
        .select("id, occurred_at, event_type, entity_type, entity_id")
        .eq("org_id", orgId)
        .eq("entity_id", request.entity_id)
        .order("occurred_at", { ascending: false })
        .limit(50);

    evQ = evQ.eq("entity_type", normalized_entity_type);
    if (request.event_type?.trim()) evQ = evQ.eq("event_type", request.event_type.trim());
    if (fromIso) evQ = evQ.gte("occurred_at", fromIso);

    const { data: evRows, error: evErr } = await evQ;
    if (evErr) throw new Error(evErr.message);

    const events = (evRows ?? []).map((r) => ({
        id: String((r as { id: string }).id),
        occurred_at: String((r as { occurred_at: string }).occurred_at),
        event_type: (r as { event_type: string | null }).event_type ?? null,
        entity_type: (r as { entity_type: string | null }).entity_type ?? null,
        entity_id: (r as { entity_id: string | null }).entity_id ?? null,
    }));

    const latestEvent = events[0] ?? null;
    const eventTypeForWorkflows =
        request.event_type?.trim() || latestEvent?.event_type?.trim() || null;

    let wfQ = supabase
        .from("workflows")
        .select("id, name, enabled, event_type, entity_type")
        .or(`org_id.eq.${orgId},org_id.is.null`);

    if (eventTypeForWorkflows) wfQ = wfQ.eq("event_type", eventTypeForWorkflows);
    wfQ = wfQ.eq("entity_type", normalized_entity_type);
    if (request.workflow_id?.trim()) wfQ = wfQ.eq("id", request.workflow_id.trim());

    const { data: wfRows, error: wfErr } = await wfQ;
    if (wfErr) throw new Error(wfErr.message);

    const workflows = (wfRows ?? []).map((w) => ({
        id: String((w as { id: string }).id),
        name: (w as { name: string | null }).name ?? null,
        enabled: (w as { enabled: boolean | null }).enabled ?? null,
        event_type: (w as { event_type: string | null }).event_type ?? null,
        entity_type: (w as { entity_type: string | null }).entity_type ?? null,
    }));

    const eventIds = events.map((e) => e.id);
    let runs: WorkflowAssistExplainSourceDataV1["runs"] = [];

    if (eventIds.length) {
        let runQ = supabase
            .from("workflow_runs")
            .select("id, workflow_id, event_id, status, error, started_at, event_payload")
            .eq("org_id", orgId)
            .in("event_id", eventIds)
            .order("started_at", { ascending: false })
            .limit(100);

        if (request.workflow_id?.trim()) runQ = runQ.eq("workflow_id", request.workflow_id.trim());

        const { data: runRows, error: runErr } = await runQ;
        if (runErr) throw new Error(runErr.message);

        const wfIds = [...new Set((runRows ?? []).map((r) => String((r as { workflow_id: string }).workflow_id)))];
        const wfNameMap = new Map<string, string | null>();
        if (wfIds.length) {
            const { data: wfNames } = await supabase
                .from("workflows")
                .select("id, name")
                .eq("org_id", orgId)
                .in("id", wfIds);
            for (const w of wfNames ?? []) {
                wfNameMap.set(String((w as { id: string }).id), (w as { name: string | null }).name ?? null);
            }
        }

        const runIds = (runRows ?? []).map((r) => String((r as { id: string }).id));
        let failedRunIds = new Set<string>();
        if (runIds.length) {
            const { data: failedRows } = await supabase
                .from("workflow_action_runs")
                .select("workflow_run_id")
                .eq("org_id", orgId)
                .in("workflow_run_id", runIds)
                .eq("status", "failed");
            failedRunIds = new Set((failedRows ?? []).map((r) => String((r as { workflow_run_id: string }).workflow_run_id)));
        }

        runs = (runRows ?? []).map((r) => {
            const id = String((r as { id: string }).id);
            const workflow_id = String((r as { workflow_id: string }).workflow_id);
            const payload = (r as { event_payload: unknown }).event_payload;
            return {
                id,
                workflow_id,
                event_id: (r as { event_id: string | null }).event_id ?? null,
                status: String((r as { status: string }).status ?? "unknown"),
                error: (r as { error: string | null }).error ?? null,
                started_at: String((r as { started_at: string }).started_at),
                has_failed_action: failedRunIds.has(id),
                workflow_name: wfNameMap.get(workflow_id) ?? null,
                skip_reason: extractSkipReason(payload),
            };
        });
    }

    const latestRun = runs[0] ?? null;
    let failed_actions: WorkflowAssistExplainSourceDataV1["failed_actions"] = [];
    if (latestRun) {
        const { data: actionRows } = await supabase
            .from("workflow_action_runs")
            .select("workflow_run_id, action_type, status, error")
            .eq("org_id", orgId)
            .eq("workflow_run_id", latestRun.id)
            .eq("status", "failed")
            .order("action_order", { ascending: true })
            .limit(5);
        failed_actions = (actionRows ?? []).map((a) => ({
            workflow_run_id: String((a as { workflow_run_id: string }).workflow_run_id),
            action_type: String((a as { action_type: string }).action_type ?? ""),
            status: String((a as { status: string }).status ?? "failed"),
            error: (a as { error: string | null }).error ?? null,
        }));
    }

    const source: WorkflowAssistExplainSourceDataV1 = {
        request,
        normalized_entity_type,
        events,
        workflows,
        runs,
        failed_actions,
    };

    return buildWorkflowAssistExplainV1(source);
}
