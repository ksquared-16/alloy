/**
 * Explain v1 — derives operator-facing explanation from operational trace.
 */

import type { WorkflowOperationalTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1";
import type {
    WorkflowAssistExplainChecklistItemV1,
    WorkflowAssistExplainLinksV1,
    WorkflowAssistExplainRequestV1,
    WorkflowAssistExplainResponseV1,
    WorkflowAssistExplainStatusV1,
} from "@/lib/agent/workflowAssist/workflowAssistExplainV1";

function automationsHref(workflowId?: string | null, runId?: string | null): string {
    const base = "/admin/workflows";
    if (runId) return `${base}?run=${encodeURIComponent(runId)}`;
    if (workflowId) return `${base}?workflow=${encodeURIComponent(workflowId)}`;
    return base;
}

function headlineForOutcome(status: WorkflowAssistExplainStatusV1): string {
    switch (status) {
        case "insufficient_context":
            return "Needs more context";
        case "no_event_found":
            return "No workflow event found for this record";
        case "no_matching_workflow":
            return "Event found, but no matching workflow";
        case "workflow_disabled":
            return "Matching workflow exists but is disabled";
        case "no_run_created":
            return "Event and workflow match, but no run was recorded";
        case "condition_mismatch":
            return "Workflow run skipped — conditions not met";
        case "run_failed":
            return "Workflow run failed";
        case "action_failed":
            return "Workflow action step failed";
        case "run_skipped":
            return "Workflow run was skipped";
        case "run_successful":
            return "Workflow run completed successfully";
        default:
            return "Not enough data to determine";
    }
}

function likelyReasonFromTrace(trace: WorkflowOperationalTraceV1): string {
    const failedConds = trace.condition_results.filter((c) => c.enabled && !c.passed);
    switch (trace.outcome) {
        case "insufficient_context":
            return "Operational trace needs entity_type and entity_id to correlate events, runs, and conditions.";
        case "no_event_found":
            return "No workflow_events row exists for this record in the time window — the trigger likely never fired.";
        case "no_matching_workflow":
            return "An event exists but no workflow definition matches event_type + entity_type for this org.";
        case "workflow_disabled":
            return `Matching workflow “${trace.workflows[0]?.name ?? trace.workflows[0]?.workflow_id}” is disabled.`;
        case "no_run_created":
            return "A matching enabled workflow exists, but no workflow_runs row is linked to the anchor event.";
        case "condition_mismatch":
            if (failedConds.length) {
                const f = failedConds[0]!;
                return `Run skipped because condition failed: ${f.field_path ?? "field"} ${f.operator} (expected ${String(f.expected)}, actual ${String(f.actual)}).`;
            }
            return trace.primary_run?.skip_reason === "conditions_not_met" ?
                    "The engine recorded conditions_not_met — one or more workflow conditions did not pass against the run payload."
                :   "The run was skipped and condition evaluation indicates a mismatch with the event payload.";
        case "run_failed":
            return trace.primary_run?.error?.trim() || "The workflow run ended in status failed.";
        case "action_failed": {
            const fa = trace.action_results.find((a) => a.status === "failed");
            return fa?.error?.trim() || `Action step “${fa?.action_type ?? "unknown"}” failed.`;
        }
        case "run_skipped":
            return trace.primary_run?.skip_reason ?
                    `Run skipped: ${trace.primary_run.skip_reason}.`
                :   "Trigger validation or pre-run checks caused a skipped run.";
        case "run_successful":
            return "The primary run completed without failed actions. If the business outcome is still wrong, verify action templates and downstream manual steps.";
        default:
            return `Trace outcome is ambiguous (run status: ${trace.primary_run?.status ?? "unknown"}).`;
    }
}

function buildChecklistFromTrace(trace: WorkflowOperationalTraceV1): WorkflowAssistExplainChecklistItemV1[] {
    const items: WorkflowAssistExplainChecklistItemV1[] = [];

    if (trace.anchored_event) {
        const e = trace.anchored_event;
        items.push({
            id: "anchor_event",
            what_checked: "Anchor workflow_events row",
            what_found: `${e.event_type ?? "—"} at ${e.occurred_at}`,
            likely_reason:
                e.payload_summary.new_status_key ?
                    `Status transition ${e.payload_summary.old_status_key ?? "—"} → ${e.payload_summary.new_status_key}.`
                :   undefined,
            recommended_action: "Use this event as the trigger anchor for workflow matching.",
        });
    }

    items.push({
        id: "workflow_match",
        what_checked: "Matching workflow definitions",
        what_found:
            trace.workflows.length ?
                trace.workflows.map((w) => `${w.name ?? w.workflow_id}${w.enabled === false ? " (disabled)" : ""}`).join(", ")
            :   "None",
        recommended_action:
            trace.workflows.length ?
                "Confirm enabled flag and trigger event/entity types."
            :   "Add or fix a workflow trigger in Automations.",
    });

    if (trace.primary_run) {
        const r = trace.primary_run;
        items.push({
            id: "primary_run",
            what_checked: "Primary workflow_runs row",
            what_found: `${r.status}${r.skip_reason ? ` · ${r.skip_reason}` : ""}${r.has_failed_action ? " · failed action" : ""}`,
            recommended_action: "Open run detail for step-level errors.",
        });
    }

    if (trace.condition_results.length) {
        const failed = trace.condition_results.filter((c) => c.enabled && !c.passed);
        items.push({
            id: "conditions",
            what_checked: `workflow_conditions (${trace.condition_results.length})`,
            what_found:
                failed.length ?
                    `${failed.length} failed: ${failed.map((c) => c.field_path ?? c.condition_id).join(", ")}`
                :   "All enabled conditions passed",
            likely_reason: failed.length ? "Failed conditions cause the engine to skip actions." : undefined,
            recommended_action: failed.length ? "Adjust conditions or ensure payload fields are populated before the event." : undefined,
        });
    }

    if (trace.action_results.length) {
        const failed = trace.action_results.filter((a) => a.status === "failed");
        items.push({
            id: "actions",
            what_checked: `workflow_action_runs (${trace.action_results.length})`,
            what_found:
                failed.length ?
                    failed.map((a) => `${a.action_type}: ${a.error ?? a.status}`).join("; ")
                :   trace.action_results.map((a) => `${a.action_type}: ${a.status}`).join(", "),
            recommended_action: failed.length ? "Fix the failed action configuration or inputs." : undefined,
        });
    }

    return items;
}

/** Map trace outcome to explain status (condition_mismatch is v1-only). */
export function traceOutcomeToExplainStatus(
    outcome: WorkflowOperationalTraceV1["outcome"]
): WorkflowAssistExplainStatusV1 {
    if (outcome === "condition_mismatch") return "condition_mismatch";
    return outcome;
}

export function buildWorkflowAssistExplainFromTraceV1(
    request: WorkflowAssistExplainRequestV1,
    trace: WorkflowOperationalTraceV1
): WorkflowAssistExplainResponseV1 {
    const status = traceOutcomeToExplainStatus(trace.outcome);
    const links: WorkflowAssistExplainLinksV1 = {
        automations_href: automationsHref(trace.primary_workflow_id, trace.primary_run?.run_id),
        workflow_id: trace.primary_workflow_id,
        run_id: trace.primary_run?.run_id ?? null,
        event_id: trace.anchored_event?.event_id ?? null,
        run_href: trace.primary_run ? automationsHref(null, trace.primary_run.run_id) : null,
    };

    return {
        version: 1,
        explain_engine: 1,
        status,
        confidence: trace.confidence,
        headline: headlineForOutcome(status),
        likely_reason: likelyReasonFromTrace(trace),
        recommended_action: trace.inspect_next[0] ?? "Open Automations for authoritative run detail.",
        checklist: buildChecklistFromTrace(trace),
        links,
        context: {
            entity_type: request.entity_type,
            entity_id: request.entity_id,
            workflow_id: request.workflow_id ?? null,
            event_type: request.event_type ?? null,
            range: request.range ?? null,
            latest_event_type: trace.anchored_event?.event_type ?? null,
            latest_event_at: trace.anchored_event?.occurred_at ?? null,
            trace_id: trace.trace_id,
        },
    };
}
