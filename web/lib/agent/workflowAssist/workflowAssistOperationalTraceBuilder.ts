import { createHash } from "node:crypto";

import { inspectWorkflowConditions } from "@/lib/workflowRun";
import {
    extractStatusTransitionFromPayload,
    summarizeEventPayload,
    WORKFLOW_OPERATIONAL_TRACE_VERSION,
    type WorkflowOperationalTraceActionSummaryV1,
    type WorkflowOperationalTraceOutcomeV1,
    type WorkflowOperationalTraceRunSummaryV1,
    type WorkflowOperationalTraceSourceDataV1,
    type WorkflowOperationalTraceTimelineEntryV1,
    type WorkflowOperationalTraceV1,
    type WorkflowOperationalTraceWorkflowSummaryV1,
} from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1";
import type { WorkflowAssistExplainConfidenceV1 } from "@/lib/agent/workflowAssist/workflowAssistExplainV1";
import { normalizeWorkflowAssistEntityType } from "@/lib/agent/workflowAssist/workflowAssistExplainV1";

function stableTraceId(parts: string[]): string {
    const h = createHash("sha256");
    for (const p of parts) {
        h.update(p);
        h.update("|");
    }
    return h.digest("hex").slice(0, 16);
}

function pickLatestRun(
    runs: WorkflowOperationalTraceSourceDataV1["runs"],
    eventId: string | null,
    workflowIds: Set<string>
): WorkflowOperationalTraceSourceDataV1["runs"][number] | null {
    const filtered = runs.filter(
        (r) =>
            workflowIds.has(r.workflow_id) &&
            (eventId == null || r.event_id === eventId || r.event_id == null)
    );
    if (!filtered.length) return null;
    return [...filtered].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0] ?? null;
}

function mapRunSummary(r: WorkflowOperationalTraceSourceDataV1["runs"][number]): WorkflowOperationalTraceRunSummaryV1 {
    return {
        run_id: r.id,
        workflow_id: r.workflow_id,
        workflow_name: r.workflow_name,
        event_id: r.event_id,
        status: r.status,
        error: r.error,
        skip_reason: r.skip_reason,
        started_at: r.started_at,
        completed_at: r.completed_at,
        has_failed_action: r.has_failed_action,
    };
}

function buildTimeline(args: {
    anchorEvent: WorkflowOperationalTraceSourceDataV1["events"][number] | null;
    statusTransitions: WorkflowOperationalTraceV1["status_transitions"];
    primaryRun: WorkflowOperationalTraceRunSummaryV1 | null;
    conditionResults: WorkflowOperationalTraceV1["condition_results"];
    actions: WorkflowOperationalTraceActionSummaryV1[];
}): WorkflowOperationalTraceTimelineEntryV1[] {
    const entries: WorkflowOperationalTraceTimelineEntryV1[] = [];

    if (args.anchorEvent) {
        const ev = args.anchorEvent;
        entries.push({
            id: `event-${ev.id}`,
            kind: "workflow_event",
            occurred_at: ev.occurred_at,
            label: "Workflow event",
            detail: `${ev.event_type ?? "unknown"} emitted for ${ev.entity_type ?? "entity"}`,
            status: "info",
            refs: { event_id: ev.id },
        });
    }

    for (const st of args.statusTransitions) {
        entries.push({
            id: `status-${st.event_id ?? st.run_id ?? st.occurred_at}`,
            kind: "status_transition",
            occurred_at: st.occurred_at,
            label: "Status change",
            detail: `${st.old_status_key ?? "—"} → ${st.new_status_key ?? "—"}`,
            status: "info",
            refs: { event_id: st.event_id, run_id: st.run_id },
        });
    }

    if (args.primaryRun) {
        const r = args.primaryRun;
        const st = String(r.status).toLowerCase();
        entries.push({
            id: `run-${r.run_id}`,
            kind: "workflow_run",
            occurred_at: r.started_at,
            label: "Workflow run",
            detail: `${r.workflow_name ?? r.workflow_id} — ${r.status}${r.skip_reason ? ` (${r.skip_reason})` : ""}`,
            status:
                st === "failed" ? "failed"
                : st === "skipped" ? "skipped"
                : st === "completed" ? "ok"
                : "info",
            refs: { run_id: r.run_id, workflow_id: r.workflow_id, event_id: r.event_id },
        });
    }

    for (const c of args.conditionResults) {
        entries.push({
            id: `cond-${c.condition_id}`,
            kind: "condition_evaluation",
            occurred_at: args.primaryRun?.started_at ?? args.anchorEvent?.occurred_at ?? new Date().toISOString(),
            label: "Condition",
            detail: `${c.field_path ?? "field"} ${c.operator} — ${c.passed ? "passed" : "failed"} (actual: ${formatActual(c.actual)})`,
            status: c.passed ? "ok" : "failed",
            refs: { condition_id: c.condition_id, workflow_id: args.primaryRun?.workflow_id },
        });
    }

    for (const a of args.actions) {
        const st = String(a.status).toLowerCase();
        entries.push({
            id: `action-${a.id}`,
            kind: "workflow_action",
            occurred_at: a.started_at,
            label: `Action: ${a.action_type}`,
            detail: a.error?.trim() ? a.error : a.status,
            status: st === "failed" ? "failed" : st === "completed" ? "ok" : "info",
            refs: { action_run_id: a.id, run_id: a.workflow_run_id },
        });
    }

    return entries.sort((a, b) => {
        const t = a.occurred_at.localeCompare(b.occurred_at);
        if (t !== 0) return t;
        return a.id.localeCompare(b.id);
    });
}

function formatActual(v: unknown): string {
    if (v == null) return "null";
    if (typeof v === "string") return v.length > 48 ? `${v.slice(0, 48)}…` : v;
    try {
        const s = JSON.stringify(v);
        return s.length > 64 ? `${s.slice(0, 64)}…` : s;
    } catch {
        return String(v);
    }
}

function deriveOutcome(args: {
    hasEntity: boolean;
    events: WorkflowOperationalTraceSourceDataV1["events"];
    matchedWorkflows: WorkflowOperationalTraceWorkflowSummaryV1[];
    primaryRun: WorkflowOperationalTraceRunSummaryV1 | null;
    conditionResults: WorkflowOperationalTraceV1["condition_results"];
    failedActions: WorkflowOperationalTraceActionSummaryV1[];
}): { outcome: WorkflowOperationalTraceOutcomeV1; confidence: WorkflowAssistExplainConfidenceV1; inspect_next: string[] } {
    const inspect_next: string[] = [];

    if (!args.hasEntity) {
        return {
            outcome: "insufficient_context",
            confidence: "high",
            inspect_next: ["Select a record in the workspace drawer before asking why a workflow did not run."],
        };
    }

    if (!args.events.length) {
        inspect_next.push("Confirm the business action that should emit workflow_events.");
        inspect_next.push("Check Activity log or admin PATCH paths for status changes.");
        return { outcome: "no_event_found", confidence: "medium", inspect_next };
    }

    if (!args.matchedWorkflows.length) {
        inspect_next.push("Open Automations and add a workflow for this event_type + entity_type.");
        return { outcome: "no_matching_workflow", confidence: "high", inspect_next };
    }

    const enabled = args.matchedWorkflows.filter((w) => w.enabled !== false);
    if (!enabled.length) {
        inspect_next.push("Enable the matching workflow in Automations after reviewing steps.");
        return { outcome: "workflow_disabled", confidence: "high", inspect_next };
    }

    if (!args.primaryRun) {
        inspect_next.push("Check server logs for executeWorkflowRun on the matching workflow id.");
        inspect_next.push("Confirm workflow org_id matches the event org.");
        return { outcome: "no_run_created", confidence: "medium", inspect_next };
    }

    const runStatus = String(args.primaryRun.status).toLowerCase();
    const skip = args.primaryRun.skip_reason ?? "";

    if (skip === "conditions_not_met" || (runStatus === "skipped" && args.conditionResults.some((c) => c.enabled && !c.passed))) {
        inspect_next.push("Edit workflow conditions in Automations to match the event payload.");
        inspect_next.push("Review failed condition rows in the trace timeline.");
        return { outcome: "condition_mismatch", confidence: "high", inspect_next };
    }

    if (runStatus === "failed" || (args.primaryRun.error && args.primaryRun.error.trim())) {
        inspect_next.push("Open the run in Automations and read workflow_runs.error.");
        return { outcome: "run_failed", confidence: "high", inspect_next };
    }

    const failedAction = args.failedActions.find((a) => a.status === "failed");
    if (args.primaryRun.has_failed_action || failedAction) {
        inspect_next.push("Inspect failed workflow_action_runs on the run detail page.");
        return { outcome: "action_failed", confidence: "high", inspect_next };
    }

    if (runStatus === "skipped" || skip) {
        inspect_next.push("Compare trigger entity_type/event_type with workflow definition.");
        return { outcome: "run_skipped", confidence: "high", inspect_next };
    }

    if (runStatus === "completed") {
        inspect_next.push("Verify each action output on the run — business outcome may still differ.");
        return { outcome: "run_successful", confidence: "high", inspect_next };
    }

    if (runStatus === "running") {
        return { outcome: "insufficient_data", confidence: "medium", inspect_next: ["Wait for run completion and refresh."] };
    }

    return {
        outcome: "insufficient_data",
        confidence: "low",
        inspect_next: ["Open Automations for full run and action-run detail."],
    };
}

/**
 * Build normalized operational trace (pure, deterministic).
 */
export function buildWorkflowOperationalTraceV1(
    data: WorkflowOperationalTraceSourceDataV1
): WorkflowOperationalTraceV1 {
    const anchorEvent = data.events[0] ?? null;
    const eventTypeForMatch = data.event_type_filter?.trim() || anchorEvent?.event_type?.trim() || null;

    const matchedSource = data.workflows.filter((w) => {
        if (data.workflow_id_filter && w.id !== data.workflow_id_filter) return false;
        if (eventTypeForMatch && w.event_type && w.event_type !== eventTypeForMatch) return false;
        const wfEt = normalizeWorkflowAssistEntityType(w.entity_type);
        if (wfEt && wfEt !== data.normalized_entity_type) return false;
        return true;
    });

    const workflows: WorkflowOperationalTraceWorkflowSummaryV1[] = matchedSource
        .map((w) => ({
            workflow_id: w.id,
            name: w.name,
            enabled: w.enabled,
            event_type: w.event_type,
            entity_type: w.entity_type,
            condition_count: (data.conditions_by_workflow[w.id] ?? []).length,
        }))
        .sort((a, b) => (a.name ?? a.workflow_id).localeCompare(b.name ?? b.workflow_id));

    const matchedIds = new Set(workflows.map((w) => w.workflow_id));
    const primaryRunSource = pickLatestRun(data.runs, anchorEvent?.id ?? null, matchedIds);
    const primaryRun = primaryRunSource ? mapRunSummary(primaryRunSource) : null;
    const primaryWorkflowId = primaryRun?.workflow_id ?? workflows.find((w) => w.enabled !== false)?.workflow_id ?? null;

    const runPayload = primaryRunSource?.event_payload ?? anchorEvent?.payload ?? {};
    const defaultEntityType = primaryRunSource ?
        normalizeWorkflowAssistEntityType(
            (runPayload.entity_type as string) ??
                workflows.find((w) => w.workflow_id === primaryWorkflowId)?.entity_type
        )
    :   data.normalized_entity_type;

    const conditionRows = primaryWorkflowId ? (data.conditions_by_workflow[primaryWorkflowId] ?? []) : [];
    const condition_results = inspectWorkflowConditions(
        runPayload,
        defaultEntityType ?? data.normalized_entity_type,
        conditionRows
    );

    const action_results: WorkflowOperationalTraceActionSummaryV1[] =
        primaryRun ?
            (data.actions_by_run[primaryRun.run_id] ?? []).map((a) => ({
                id: a.id,
                workflow_run_id: a.workflow_run_id,
                action_order: a.action_order,
                action_type: a.action_type,
                status: a.status,
                error: a.error,
                started_at: a.started_at,
                completed_at: a.completed_at,
            }))
        :   [];

    const status_transitions = [];
    if (anchorEvent) {
        const st = extractStatusTransitionFromPayload(anchorEvent.payload, anchorEvent.occurred_at, "workflow_event_payload", {
            event_id: anchorEvent.id,
        });
        if (st) status_transitions.push(st);
    }
    if (primaryRunSource) {
        const st = extractStatusTransitionFromPayload(
            primaryRunSource.event_payload,
            primaryRunSource.started_at,
            "run_event_payload",
            { run_id: primaryRunSource.id, event_id: primaryRunSource.event_id }
        );
        if (st) status_transitions.push(st);
    }

    const timeline = buildTimeline({
        anchorEvent,
        statusTransitions: status_transitions,
        primaryRun,
        conditionResults: condition_results,
        actions: action_results,
    });

    const { outcome, confidence, inspect_next } = deriveOutcome({
        hasEntity: Boolean(data.entity_id.trim() && data.normalized_entity_type),
        events: data.events,
        matchedWorkflows: workflows,
        primaryRun,
        conditionResults: condition_results,
        failedActions: action_results.filter((a) => a.status === "failed"),
    });

    const trace_id = stableTraceId([
        data.normalized_entity_type,
        data.entity_id,
        anchorEvent?.id ?? "no-event",
        primaryRun?.run_id ?? "no-run",
        outcome,
    ]);

    return {
        version: WORKFLOW_OPERATIONAL_TRACE_VERSION,
        trace_id,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        range: data.range,
        anchored_event:
            anchorEvent ?
                {
                    event_id: anchorEvent.id,
                    event_type: anchorEvent.event_type,
                    entity_type: anchorEvent.entity_type,
                    entity_id: anchorEvent.entity_id,
                    occurred_at: anchorEvent.occurred_at,
                    payload_summary: summarizeEventPayload(anchorEvent.payload),
                }
            :   null,
        workflows,
        primary_workflow_id: primaryWorkflowId,
        primary_run: primaryRun,
        condition_results,
        action_results,
        status_transitions,
        timeline,
        outcome,
        confidence,
        inspect_next,
    };
}
