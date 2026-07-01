/**
 * Workflow Assist — operational trace foundation (read-only).
 * Correlates workflow_events, workflows, workflow_runs, workflow_action_runs, workflow_conditions.
 */

import type { WorkflowConditionInspectResult } from "@/lib/workflowRun";
import type {
    WorkflowAssistExplainConfidenceV1,
    WorkflowAssistExplainStatusV1,
} from "@/lib/agent/workflowAssist/workflowAssistExplainV1";

export const WORKFLOW_OPERATIONAL_TRACE_VERSION = 1 as const;

export type WorkflowOperationalTraceOutcomeV1 = WorkflowAssistExplainStatusV1 | "condition_mismatch";

export type WorkflowOperationalTraceTimelineKindV1 =
    | "workflow_event"
    | "status_transition"
    | "workflow_run"
    | "condition_evaluation"
    | "workflow_action";

export type WorkflowOperationalTraceTimelineEntryV1 = {
    id: string;
    kind: WorkflowOperationalTraceTimelineKindV1;
    occurred_at: string;
    label: string;
    detail: string;
    status?: "ok" | "failed" | "skipped" | "warning" | "info";
    refs?: {
        event_id?: string | null;
        workflow_id?: string | null;
        run_id?: string | null;
        action_run_id?: string | null;
        condition_id?: string | null;
    };
};

export type WorkflowOperationalTraceEventAnchorV1 = {
    event_id: string;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    occurred_at: string;
    payload_summary: {
        old_status_key?: string | null;
        new_status_key?: string | null;
        skip_reason?: string | null;
    };
};

export type WorkflowOperationalTraceStatusTransitionV1 = {
    occurred_at: string;
    old_status_key: string | null;
    new_status_key: string | null;
    source: "workflow_event_payload" | "run_event_payload";
    event_id?: string | null;
    run_id?: string | null;
};

export type WorkflowOperationalTraceWorkflowSummaryV1 = {
    workflow_id: string;
    name: string | null;
    enabled: boolean | null;
    event_type: string | null;
    entity_type: string | null;
    condition_count: number;
};

export type WorkflowOperationalTraceRunSummaryV1 = {
    run_id: string;
    workflow_id: string;
    workflow_name: string | null;
    event_id: string | null;
    status: string;
    error: string | null;
    skip_reason: string | null;
    started_at: string;
    completed_at: string | null;
    has_failed_action: boolean;
};

export type WorkflowOperationalTraceActionSummaryV1 = {
    id: string;
    workflow_run_id: string;
    action_order: number;
    action_type: string;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
};

export type WorkflowOperationalTraceV1 = {
    version: typeof WORKFLOW_OPERATIONAL_TRACE_VERSION;
    trace_id: string;
    entity_type: string;
    entity_id: string;
    range: string | null;
    anchored_event: WorkflowOperationalTraceEventAnchorV1 | null;
    workflows: WorkflowOperationalTraceWorkflowSummaryV1[];
    primary_workflow_id: string | null;
    primary_run: WorkflowOperationalTraceRunSummaryV1 | null;
    condition_results: WorkflowConditionInspectResult[];
    action_results: WorkflowOperationalTraceActionSummaryV1[];
    status_transitions: WorkflowOperationalTraceStatusTransitionV1[];
    timeline: WorkflowOperationalTraceTimelineEntryV1[];
    outcome: WorkflowOperationalTraceOutcomeV1;
    confidence: WorkflowAssistExplainConfidenceV1;
    inspect_next: string[];
};

export type WorkflowOperationalTraceSourceEventV1 = {
    id: string;
    occurred_at: string;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
};

export type WorkflowOperationalTraceSourceWorkflowV1 = {
    id: string;
    name: string | null;
    enabled: boolean | null;
    event_type: string | null;
    entity_type: string | null;
};

export type WorkflowOperationalTraceSourceRunV1 = {
    id: string;
    workflow_id: string;
    event_id: string | null;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
    event_payload: Record<string, unknown>;
    has_failed_action: boolean;
    workflow_name: string | null;
    skip_reason: string | null;
};

export type WorkflowOperationalTraceSourceConditionV1 = {
    id: string;
    workflow_id: string;
    target_entity?: string | null;
    field_path?: string | null;
    field?: string | null;
    operator?: string | null;
    value?: unknown;
    value_jsonb?: unknown;
    enabled?: boolean | null;
};

export type WorkflowOperationalTraceSourceActionV1 = {
    id: string;
    workflow_run_id: string;
    action_order: number;
    action_type: string;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
};

export type WorkflowOperationalTraceSourceDataV1 = {
    entity_type: string;
    entity_id: string;
    normalized_entity_type: string;
    range: string | null;
    workflow_id_filter: string | null;
    event_type_filter: string | null;
    events: WorkflowOperationalTraceSourceEventV1[];
    workflows: WorkflowOperationalTraceSourceWorkflowV1[];
    runs: WorkflowOperationalTraceSourceRunV1[];
    conditions_by_workflow: Record<string, WorkflowOperationalTraceSourceConditionV1[]>;
    actions_by_run: Record<string, WorkflowOperationalTraceSourceActionV1[]>;
};

export function extractStatusTransitionFromPayload(
    payload: Record<string, unknown>,
    occurred_at: string,
    source: WorkflowOperationalTraceStatusTransitionV1["source"],
    refs: { event_id?: string | null; run_id?: string | null }
): WorkflowOperationalTraceStatusTransitionV1 | null {
    const nested = payload.payload as Record<string, unknown> | undefined;
    const old =
        payload.old_status_key != null ? String(payload.old_status_key)
        : nested?.old_status_key != null ? String(nested.old_status_key)
        : null;
    const newKey =
        payload.new_status_key != null ? String(payload.new_status_key)
        : nested?.new_status_key != null ? String(nested.new_status_key)
        : null;
    if (old == null && newKey == null) return null;
    return {
        occurred_at,
        old_status_key: old,
        new_status_key: newKey,
        source,
        event_id: refs.event_id ?? null,
        run_id: refs.run_id ?? null,
    };
}

export function summarizeEventPayload(payload: Record<string, unknown>): WorkflowOperationalTraceEventAnchorV1["payload_summary"] {
    const nested = payload.payload as Record<string, unknown> | undefined;
    const meta = payload.metadata as Record<string, unknown> | undefined;
    return {
        old_status_key:
            payload.old_status_key != null ? String(payload.old_status_key)
            : nested?.old_status_key != null ? String(nested.old_status_key)
            : null,
        new_status_key:
            payload.new_status_key != null ? String(payload.new_status_key)
            : nested?.new_status_key != null ? String(nested.new_status_key)
            : null,
        skip_reason:
            payload.skip_reason != null ? String(payload.skip_reason)
            : meta?.skip_reason != null ? String(meta.skip_reason)
            : null,
    };
}
