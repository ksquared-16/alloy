/**
 * Workflow Assist Explain v0 — deterministic, read-only contracts + pure builder.
 * No LLM; inspects workflow_events, workflows, workflow_runs, workflow_action_runs only.
 */

import { workflowAssistErrorEnvelope, type WorkflowAssistErrorEnvelopeV1 } from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { ADMIN_WORKFLOWS_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const WORKFLOW_ASSIST_EXPLAIN_AGENT_KEY = "workflow_assist_explain" as const;

/** Query params for GET `/api/admin/ai/workflow-assist/explain`. */
export type WorkflowAssistExplainRequestV1 = {
    version: 1;
    entity_type: string;
    entity_id: string;
    workflow_id?: string | null;
    event_type?: string | null;
    /** `24h` | `7d` | `30d` — filters workflow_events by occurred_at. */
    range?: "24h" | "7d" | "30d" | null;
};

export type WorkflowAssistExplainStatusV1 =
    | "insufficient_context"
    | "no_event_found"
    | "no_matching_workflow"
    | "workflow_disabled"
    | "no_run_created"
    | "condition_mismatch"
    | "run_failed"
    | "action_failed"
    | "run_successful"
    | "run_skipped"
    | "insufficient_data";

export type WorkflowAssistExplainConfidenceV1 = "high" | "medium" | "low";

export type WorkflowAssistExplainChecklistItemV1 = {
    id: string;
    what_checked: string;
    what_found: string;
    likely_reason?: string;
    recommended_action?: string;
};

export type WorkflowAssistExplainLinksV1 = {
    workflow_id?: string | null;
    run_id?: string | null;
    event_id?: string | null;
    automations_href?: string | null;
    run_href?: string | null;
};

export type WorkflowAssistExplainResponseV1 = {
    version: 1;
    /** `0` = Explain v0 checklist; `1` = operational trace (Explain v1). */
    explain_engine: 0 | 1;
    status: WorkflowAssistExplainStatusV1;
    confidence: WorkflowAssistExplainConfidenceV1;
    headline: string;
    likely_reason: string;
    recommended_action: string;
    checklist: WorkflowAssistExplainChecklistItemV1[];
    links: WorkflowAssistExplainLinksV1;
    context: {
        entity_type: string;
        entity_id: string;
        workflow_id?: string | null;
        event_type?: string | null;
        range?: string | null;
        latest_event_type?: string | null;
        latest_event_at?: string | null;
        trace_id?: string | null;
    };
};

export type WorkflowAssistExplainApiSuccessV1 = {
    ok: true;
    explain_engine: 0 | 1;
    explanation: WorkflowAssistExplainResponseV1;
    /** Present when `explain_engine === 1`. */
    trace?: import("@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1").WorkflowOperationalTraceV1;
};

export type WorkflowAssistExplainApiFailureV1 = {
    ok: false;
    error: string;
    message: string;
    envelope?: WorkflowAssistErrorEnvelopeV1;
};

const ENTITY_TYPE_ALIASES: Record<string, string> = {
    job: "jobs",
    jobs: "jobs",
    schedule: "schedules",
    schedules: "schedules",
    opportunity: "opportunities",
    opportunities: "opportunities",
    contact: "contacts",
    contacts: "contacts",
    customer: "customers",
    vendor: "vendors",
    vendors: "vendors",
    location: "locations",
    locations: "locations",
    customer_member: "customer_members",
    customer_members: "customer_members",
};

export function normalizeWorkflowAssistEntityType(raw: string | null | undefined): string | null {
    if (raw == null || String(raw).trim() === "") return null;
    const key = String(raw).trim().toLowerCase();
    return ENTITY_TYPE_ALIASES[key] ?? key;
}

export function rangeToFromIso(range: WorkflowAssistExplainRequestV1["range"]): string | null {
    if (!range) return null;
    const d = new Date();
    if (range === "24h") {
        d.setHours(d.getHours() - 24);
        return d.toISOString();
    }
    if (range === "7d") {
        d.setDate(d.getDate() - 7);
        return d.toISOString();
    }
    if (range === "30d") {
        d.setDate(d.getDate() - 30);
        return d.toISOString();
    }
    return null;
}

export function parseWorkflowAssistExplainRequest(
    searchParams: URLSearchParams
): { ok: true; request: WorkflowAssistExplainRequestV1 } | { ok: false; error: string; message: string; status: number } {
    const entity_type = (searchParams.get("entity_type") ?? "").trim();
    const entity_id = (searchParams.get("entity_id") ?? "").trim();
    const workflow_id = (searchParams.get("workflow_id") ?? "").trim() || null;
    const event_type = (searchParams.get("event_type") ?? "").trim() || null;
    const rangeRaw = (searchParams.get("range") ?? "").trim();
    const range =
        rangeRaw === "24h" || rangeRaw === "7d" || rangeRaw === "30d" ? rangeRaw : null;

    if (!entity_type && !entity_id) {
        return {
            ok: false,
            error: "MISSING_ENTITY",
            message: "entity_type and entity_id are required for Explain v0.",
            status: 400,
        };
    }
    if (!entity_type || !entity_id) {
        return {
            ok: false,
            error: "MISSING_ENTITY",
            message: "Both entity_type and entity_id are required.",
            status: 400,
        };
    }

    return {
        ok: true,
        request: {
            version: 1,
            entity_type,
            entity_id,
            workflow_id,
            event_type,
            range,
        },
    };
}

export type WorkflowAssistExplainEventRowV1 = {
    id: string;
    occurred_at: string;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
};

export type WorkflowAssistExplainWorkflowRowV1 = {
    id: string;
    name: string | null;
    enabled: boolean | null;
    event_type: string | null;
    entity_type: string | null;
};

export type WorkflowAssistExplainRunRowV1 = {
    id: string;
    workflow_id: string;
    event_id: string | null;
    status: string;
    error: string | null;
    started_at: string;
    has_failed_action: boolean;
    workflow_name: string | null;
    skip_reason: string | null;
};

export type WorkflowAssistExplainActionRowV1 = {
    workflow_run_id: string;
    action_type: string;
    status: string;
    error: string | null;
};

/** Inputs gathered server-side (org-scoped) for the pure builder. */
export type WorkflowAssistExplainSourceDataV1 = {
    request: WorkflowAssistExplainRequestV1;
    normalized_entity_type: string;
    events: WorkflowAssistExplainEventRowV1[];
    workflows: WorkflowAssistExplainWorkflowRowV1[];
    runs: WorkflowAssistExplainRunRowV1[];
    failed_actions: WorkflowAssistExplainActionRowV1[];
};

function automationsHref(workflowId?: string | null, runId?: string | null): string {
    const base = ADMIN_WORKFLOWS_HREF;
    if (runId) return `${base}?run=${encodeURIComponent(runId)}`;
    if (workflowId) return `${base}?workflow=${encodeURIComponent(workflowId)}`;
    return base;
}

function pickLatestRun(runs: WorkflowAssistExplainRunRowV1[]): WorkflowAssistExplainRunRowV1 | null {
    if (!runs.length) return null;
    return [...runs].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0] ?? null;
}

/**
 * Deterministic explanation from org-scoped workflow telemetry (pure — unit tested).
 */
export function buildWorkflowAssistExplainV1(data: WorkflowAssistExplainSourceDataV1): WorkflowAssistExplainResponseV1 {
    const { request, normalized_entity_type, events, workflows, runs, failed_actions } = data;
    const ctxBase = {
        entity_type: request.entity_type,
        entity_id: request.entity_id,
        workflow_id: request.workflow_id ?? null,
        event_type: request.event_type ?? null,
        range: request.range ?? null,
    };

    const links: WorkflowAssistExplainLinksV1 = {
        automations_href: automationsHref(request.workflow_id),
    };

    const checklist: WorkflowAssistExplainChecklistItemV1[] = [];

    const push = (item: WorkflowAssistExplainChecklistItemV1) => {
        checklist.push(item);
    };

    if (!normalized_entity_type || !request.entity_id.trim()) {
        return {
            version: 1,
            explain_engine: 0,
            status: "insufficient_context",
            confidence: "high",
            headline: "Needs more context",
            likely_reason: "Explain v0 needs a specific record (entity type and id) to inspect workflow events and runs.",
            recommended_action:
                "Open the opportunity or record in the drawer, then ask again — or paste the record id if you have it.",
            checklist: [
                {
                    id: "entity_context",
                    what_checked: "Entity type and entity id",
                    what_found: "Missing or invalid",
                    likely_reason: "No record was selected in the command surface context.",
                    recommended_action: "Select a record from the workspace before asking why a workflow did not run.",
                },
            ],
            links,
            context: ctxBase,
        };
    }

    push({
        id: "entity_scope",
        what_checked: `Workflow events for ${normalized_entity_type} / ${request.entity_id.slice(0, 8)}…`,
        what_found:
            events.length ?
                `${events.length} event(s) in the selected window${request.event_type ? ` (filter: ${request.event_type})` : ""}.`
            :   "No workflow events in the selected window.",
        recommended_action:
            events.length ?
                "Use the latest event below as the anchor for workflow matching."
            :   "Confirm the status change or action that should have emitted a workflow event.",
    });

    if (!events.length) {
        return {
            version: 1,
            explain_engine: 0,
            status: "no_event_found",
            confidence: "medium",
            headline: "No workflow event found for this record",
            likely_reason:
                "Nothing was written to workflow_events for this entity in the time window — the trigger may not have fired or the change happened outside Automations.",
            recommended_action:
                "Verify the record actually changed status (or completed the expected action), then check Activity or admin audit paths that emit workflow_events.",
            checklist,
            links,
            context: ctxBase,
        };
    }

    const latest = events[0]!;
    const latestEventType = latest.event_type ?? null;
    const ctx = {
        ...ctxBase,
        latest_event_type: latestEventType,
        latest_event_at: latest.occurred_at,
    };
    links.event_id = latest.id;

    push({
        id: "latest_event",
        what_checked: "Most recent workflow_events row",
        what_found: `${latestEventType ?? "unknown type"} at ${latest.occurred_at}`,
        likely_reason: "Downstream workflows match on event_type + entity_type for enabled definitions.",
        recommended_action: "Open Automations and confirm a workflow listens for this event type on this entity type.",
    });

    const eventTypeForMatch = request.event_type?.trim() || latestEventType;
    const matched = workflows.filter((w) => {
        if (request.workflow_id && w.id !== request.workflow_id) return false;
        if (eventTypeForMatch && w.event_type && w.event_type !== eventTypeForMatch) return false;
        const wfEt = normalizeWorkflowAssistEntityType(w.entity_type);
        if (wfEt && wfEt !== normalized_entity_type) return false;
        return true;
    });

    push({
        id: "workflow_definitions",
        what_checked: `Workflow definitions (event_type=${eventTypeForMatch ?? "—"}, entity_type=${normalized_entity_type})`,
        what_found:
            matched.length ?
                `${matched.length} definition(s): ${matched.map((w) => w.name ?? w.id).join(", ")}`
            :   "No definitions matched.",
        recommended_action:
            matched.length ?
                "Inspect whether each definition is enabled and has conditions that could skip the run."
            :   "Create or fix a workflow trigger for this event/entity pair in Automations.",
    });

    if (!matched.length) {
        return {
            version: 1,
            explain_engine: 0,
            status: "no_matching_workflow",
            confidence: "high",
            headline: "Event found, but no matching workflow",
            likely_reason:
                "A workflow_events row exists, but no enabled workflow in this org is configured for that event_type and entity_type (or the optional workflow filter excluded all).",
            recommended_action:
                "In Automations, add or enable a workflow with the same event type and entity type, then retry the business action.",
            checklist,
            links,
            context: ctx,
        };
    }

    const enabledMatched = matched.filter((w) => w.enabled !== false);
    const allDisabled = matched.length > 0 && enabledMatched.length === 0;

    push({
        id: "workflow_enabled",
        what_checked: "Enabled flag on matching workflows",
        what_found:
            allDisabled ?
                "All matching workflows are disabled."
            :   `${enabledMatched.length} enabled, ${matched.length - enabledMatched.length} disabled.`,
        likely_reason: allDisabled ? "Disabled workflows do not execute on new events." : undefined,
        recommended_action: allDisabled ? "Enable the workflow in Automations after reviewing steps and conditions." : undefined,
    });

    const runsForEvent = runs.filter((r) => r.event_id === latest.id || !r.event_id);
    const runsForWorkflows = runsForEvent.filter((r) => matched.some((w) => w.id === r.workflow_id));
    const latestRun = pickLatestRun(runsForWorkflows);

    push({
        id: "workflow_runs",
        what_checked: `workflow_runs for event ${latest.id.slice(0, 8)}…`,
        what_found:
            latestRun ?
                `Latest run ${latestRun.id.slice(0, 8)}… — status ${latestRun.status}${latestRun.has_failed_action ? " (failed action)" : ""}.`
            :   "No workflow run linked to this event for the matched workflows.",
        recommended_action: latestRun ? "Open the run in Automations for step-level detail." : undefined,
    });

    if (allDisabled) {
        const wf = matched[0]!;
        links.workflow_id = wf.id;
        links.automations_href = automationsHref(wf.id);
        return {
            version: 1,
            explain_engine: 0,
            status: "workflow_disabled",
            confidence: "high",
            headline: "Matching workflow exists but is disabled",
            likely_reason: `“${wf.name ?? wf.id}” matches this event but is turned off, so no new runs are started.`,
            recommended_action: "Review the workflow in Automations, enable it when ready, then re-trigger the business action if needed.",
            checklist,
            links,
            context: ctx,
        };
    }

    if (!latestRun) {
        return {
            version: 1,
            explain_engine: 0,
            status: "no_run_created",
            confidence: "medium",
            headline: "Event and workflow match, but no run was recorded",
            likely_reason:
                "An event exists and at least one enabled workflow should match, but no workflow_runs row was found for this event — execution may have failed before insert, or matching used a different org/workflow id.",
            recommended_action:
                "Check server logs for executeWorkflowRun warnings, confirm org_id on the workflow, and retry the triggering action.",
            checklist,
            links: { ...links, workflow_id: enabledMatched[0]?.id ?? matched[0]?.id },
            context: ctx,
        };
    }

    links.workflow_id = latestRun.workflow_id;
    links.run_id = latestRun.id;
    links.automations_href = automationsHref(latestRun.workflow_id, latestRun.id);
    links.run_href = automationsHref(null, latestRun.id);

    const runStatus = String(latestRun.status ?? "").toLowerCase();
    const failedAction = failed_actions.find((a) => a.workflow_run_id === latestRun.id);

    if (runStatus === "failed" || (latestRun.error && latestRun.error.trim())) {
        push({
            id: "run_error",
            what_checked: "workflow_runs.error",
            what_found: latestRun.error?.trim() || "Run status failed.",
            recommended_action: "Open the run in Automations and fix configuration or upstream data, then re-trigger if appropriate.",
        });
        return {
            version: 1,
            explain_engine: 0,
            status: "run_failed",
            confidence: "high",
            headline: "Workflow run failed",
            likely_reason: latestRun.error?.trim() || "The workflow run ended in a failed state.",
            recommended_action: "Inspect the run and step errors in Automations; correct the root cause before retrying.",
            checklist,
            links,
            context: ctx,
        };
    }

    if (latestRun.has_failed_action || failedAction) {
        push({
            id: "action_runs",
            what_checked: "workflow_action_runs with status failed",
            what_found:
                failedAction ?
                    `${failedAction.action_type}: ${failedAction.error ?? "failed"}`
                :   "At least one action step failed.",
            recommended_action: "Open the failed action in Automations and resolve the error (template, recipient, permissions, etc.).",
        });
        return {
            version: 1,
            explain_engine: 0,
            status: "action_failed",
            confidence: "high",
            headline: "Workflow run completed with a failed action",
            likely_reason:
                failedAction?.error?.trim() ||
                "One or more action steps reported failure even though the run may show completed.",
            recommended_action: "Review failed steps on the run detail page; fix and manually complete follow-up if needed.",
            checklist,
            links,
            context: ctx,
        };
    }

    if (runStatus === "skipped" || latestRun.skip_reason) {
        return {
            version: 1,
            explain_engine: 0,
            status: "run_skipped",
            confidence: "high",
            headline: "Workflow run was skipped",
            likely_reason:
                latestRun.skip_reason ?
                    `Run skipped: ${latestRun.skip_reason} (trigger/condition validation).`
                :   "The workflow engine recorded a skipped run — often entity/event mismatch or missing status key on the payload.",
            recommended_action:
                "Compare workflow entity_type/event_type and conditions against the event payload in Automations.",
            checklist,
            links,
            context: ctx,
        };
    }

    if (runStatus === "completed") {
        return {
            version: 1,
            explain_engine: 0,
            status: "run_successful",
            confidence: "high",
            headline: "Workflow run appears successful",
            likely_reason:
                "The latest run for this event completed without a failed action. If the business outcome still looks wrong, the workflow may not perform the step you expect (conditions, wrong template, or downstream manual step).",
            recommended_action:
                "Open the run in Automations to verify each action output; trace comms or status side effects separately.",
            checklist,
            links,
            context: ctx,
        };
    }

    if (runStatus === "running") {
        return {
            version: 1,
            explain_engine: 0,
            status: "insufficient_data",
            confidence: "medium",
            headline: "Workflow run is still in progress",
            likely_reason: "A run exists but has not finished — wait and refresh Automations.",
            recommended_action: "Check back in Automations once the run completes.",
            checklist,
            links,
            context: ctx,
        };
    }

    return {
        version: 1,
        explain_engine: 0,
        status: "insufficient_data",
        confidence: "low",
        headline: "Not enough data to determine",
        likely_reason: `Latest run status is “${latestRun.status}” — Explain v0 could not map this to a known outcome.`,
        recommended_action: "Open Automations for full run and action-run detail.",
        checklist,
        links,
        context: ctx,
    };
}

export function workflowAssistExplainApiFailure(
    error: string,
    message: string,
    envelope?: WorkflowAssistErrorEnvelopeV1
): WorkflowAssistExplainApiFailureV1 {
    return { ok: false, error, message, ...(envelope ? { envelope } : {}) };
}

/** Card payload for Orchestrator read thread (Explain v0 / v1). */
export type WorkflowAssistExplainCardPayloadV1 = {
    variant: "explain_v0" | "explain_v1";
    headline: string;
    explanation: WorkflowAssistExplainResponseV1;
    needs_more_context: boolean;
    trace?: import("@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1").WorkflowOperationalTraceV1;
};

export function buildWorkflowAssistExplainCardPayload(
    explanation: WorkflowAssistExplainResponseV1,
    trace?: import("@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1").WorkflowOperationalTraceV1
): WorkflowAssistExplainCardPayloadV1 {
    const variant = explanation.explain_engine === 1 ? "explain_v1" : "explain_v0";
    return {
        variant,
        headline: explanation.headline,
        explanation,
        needs_more_context: explanation.status === "insufficient_context",
        ...(trace ? { trace } : {}),
    };
}
