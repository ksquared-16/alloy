import type { SupabaseClient } from "@supabase/supabase-js";

import { buildWorkflowOperationalTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceBuilder";
import { buildWorkflowAssistExplainFromTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistExplainFromTraceV1";
import type { WorkflowOperationalTraceSourceDataV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1";
import type { WorkflowOperationalTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1";
import type {
    WorkflowAssistExplainRequestV1,
    WorkflowAssistExplainResponseV1,
} from "@/lib/agent/workflowAssist/workflowAssistExplainV1";
import { normalizeWorkflowAssistEntityType, rangeToFromIso } from "@/lib/agent/workflowAssist/workflowAssistExplainV1";

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

function asPayload(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

export type WorkflowAssistExplainV1Result = {
    explanation: WorkflowAssistExplainResponseV1;
    trace: WorkflowOperationalTraceV1;
};

/**
 * Explain v1 — fetch org-scoped telemetry, build operational trace, derive explanation.
 */
export async function fetchWorkflowAssistExplainV1(
    supabase: SupabaseClient,
    orgId: string,
    request: WorkflowAssistExplainRequestV1
): Promise<WorkflowAssistExplainV1Result> {
    const normalized_entity_type = normalizeWorkflowAssistEntityType(request.entity_type) ?? request.entity_type;
    const fromIso = rangeToFromIso(request.range ?? null);

    let evQ = supabase
        .from("workflow_events")
        .select("id, occurred_at, event_type, entity_type, entity_id, payload")
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
        payload: asPayload((r as { payload: unknown }).payload),
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
    const runs: WorkflowOperationalTraceSourceDataV1["runs"] = [];

    if (eventIds.length) {
        let runQ = supabase
            .from("workflow_runs")
            .select("id, workflow_id, event_id, status, error, started_at, completed_at, event_payload")
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
                .or(`org_id.eq.${orgId},org_id.is.null`)
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

        for (const r of runRows ?? []) {
            const id = String((r as { id: string }).id);
            const workflow_id = String((r as { workflow_id: string }).workflow_id);
            const event_payload = asPayload((r as { event_payload: unknown }).event_payload);
            runs.push({
                id,
                workflow_id,
                event_id: (r as { event_id: string | null }).event_id ?? null,
                status: String((r as { status: string }).status ?? "unknown"),
                error: (r as { error: string | null }).error ?? null,
                started_at: String((r as { started_at: string }).started_at),
                completed_at: (r as { completed_at: string | null }).completed_at ?? null,
                event_payload,
                has_failed_action: failedRunIds.has(id),
                workflow_name: wfNameMap.get(workflow_id) ?? null,
                skip_reason: extractSkipReason(event_payload),
            });
        }
    }

    const conditions_by_workflow: WorkflowOperationalTraceSourceDataV1["conditions_by_workflow"] = {};
    const wfIdsForConditions = [...new Set(workflows.map((w) => w.id))];
    if (wfIdsForConditions.length) {
        const { data: condRows, error: condErr } = await supabase
            .from("workflow_conditions")
            .select("id, workflow_id, target_entity, field_path, field, operator, value, value_jsonb, enabled")
            .in("workflow_id", wfIdsForConditions);
        if (condErr) throw new Error(condErr.message);
        for (const row of condRows ?? []) {
            const wid = String((row as { workflow_id: string }).workflow_id);
            if (!conditions_by_workflow[wid]) conditions_by_workflow[wid] = [];
            conditions_by_workflow[wid]!.push({
                id: String((row as { id: string }).id),
                workflow_id: wid,
                target_entity: (row as { target_entity: string | null }).target_entity ?? null,
                field_path: (row as { field_path: string | null }).field_path ?? null,
                field: (row as { field: string | null }).field ?? null,
                operator: (row as { operator: string | null }).operator ?? null,
                value: (row as { value: unknown }).value,
                value_jsonb: (row as { value_jsonb: unknown }).value_jsonb,
                enabled: (row as { enabled: boolean | null }).enabled ?? null,
            });
        }
    }

    const actions_by_run: WorkflowOperationalTraceSourceDataV1["actions_by_run"] = {};
    const runIdsForActions = runs.map((r) => r.id);
    if (runIdsForActions.length) {
        const { data: actionRows, error: actErr } = await supabase
            .from("workflow_action_runs")
            .select("id, workflow_run_id, action_order, action_type, status, error, started_at, completed_at")
            .eq("org_id", orgId)
            .in("workflow_run_id", runIdsForActions)
            .order("action_order", { ascending: true });
        if (actErr) throw new Error(actErr.message);
        for (const row of actionRows ?? []) {
            const rid = String((row as { workflow_run_id: string }).workflow_run_id);
            if (!actions_by_run[rid]) actions_by_run[rid] = [];
            actions_by_run[rid]!.push({
                id: String((row as { id: string }).id),
                workflow_run_id: rid,
                action_order: (row as { action_order: number }).action_order ?? 0,
                action_type: String((row as { action_type: string }).action_type ?? ""),
                status: String((row as { status: string }).status ?? "unknown"),
                error: (row as { error: string | null }).error ?? null,
                started_at: String((row as { started_at: string }).started_at),
                completed_at: (row as { completed_at: string | null }).completed_at ?? null,
            });
        }
    }

    const source: WorkflowOperationalTraceSourceDataV1 = {
        entity_type: request.entity_type,
        entity_id: request.entity_id,
        normalized_entity_type,
        range: request.range ?? null,
        workflow_id_filter: request.workflow_id?.trim() || null,
        event_type_filter: request.event_type?.trim() || null,
        events,
        workflows,
        runs,
        conditions_by_workflow,
        actions_by_run,
    };

    const trace = buildWorkflowOperationalTraceV1(source);
    const explanation = buildWorkflowAssistExplainFromTraceV1(request, trace);
    return { explanation, trace };
}
