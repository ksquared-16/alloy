/**
 * Workflow Assist V1 — read-only contracts (Cards 1–3) + thread UI hooks for proposal actions (Cards 4–5).
 * Proposal/apply payloads live in `workflowAssistProposalV1.ts`.
 */

export const WORKFLOW_ASSIST_AGENT_KEY = "workflow_assist" as const;

/** Sub-intent for deterministic routing (Orchestrator → read cards). */
export type WorkflowAssistReadSubIntentV1 =
    | "explain_placeholder"
    | "failed_runs_last_7d"
    | "enrollment_touch"
    | "workflow_summary";

/** Parsed operator intent for read-only Workflow Assist turns. */
export type WorkflowAssistReadIntentV1 = {
    version: 1;
    sub_intent: WorkflowAssistReadSubIntentV1;
    /** Short machine-readable parse trace (tests, support). */
    parse_reason: string;
};

/** Standard error envelope for Workflow Assist read paths. */
export type WorkflowAssistErrorEnvelopeV1 = {
    version: 1;
    code: "fetch_failed" | "forbidden" | "bad_response" | "unknown";
    message: string;
    http_status?: number;
};

export function workflowAssistErrorEnvelope(
    code: WorkflowAssistErrorEnvelopeV1["code"],
    message: string,
    http_status?: number
): WorkflowAssistErrorEnvelopeV1 {
    return { version: 1, code, message, ...(http_status != null ? { http_status } : {}) };
}

const WHY_RE = /\bwhy\b/i;
const BLOCKED_RE = /\b(didn'?t|did\s+not|not|won'?t|never)\b/i;
const MOVE_RE = /\b(move|moved|transition|trigger|run|fire|happen|happen(?:ed|s)?)\b/i;
const FAMILY_RE = /\b(family|household|this\s+record|opportunity|lead)\b/i;

const FAIL_RE = /\b(fail(?:ed|s|ure)?|error|broken)\b/i;
const WEEK_RE = /\b(this|past|last)\s+week\b|\b7\s*days\b|\blast\s*7\b|\bseven\s+days\b/i;

const ENROLLMENT_RE =
    /\b(enroll(?:ment)?|inquiry|intake|waitlist|pipeline|tour|packet|subsidy)\b/i;

const SUMMARY_RE =
    /\b(summary|overview|list|show|display|what\s+workflows|which\s+workflows|automations?|my\s+workflows)\b/i;

export type WorkflowAssistReadParseContextV1 = {
    /** Drawer set an opportunity — used for explain placeholder copy only. */
    hasAmbientOpportunity?: boolean;
};

/**
 * Deterministic read-intent classifier for Workflow Assist (no LLM).
 * Precedence: explain → failed runs → enrollment touch → default summary.
 */
export function parseWorkflowAssistReadIntent(
    raw: string,
    ctx: WorkflowAssistReadParseContextV1 = {}
): WorkflowAssistReadIntentV1 {
    const t = raw.trim().slice(0, 500);
    if (!t) {
        return { version: 1, sub_intent: "workflow_summary", parse_reason: "empty_default_summary" };
    }

    const explainish = WHY_RE.test(t) && (BLOCKED_RE.test(t) || MOVE_RE.test(t) || FAMILY_RE.test(t));
    if (explainish) {
        return {
            version: 1,
            sub_intent: "explain_placeholder",
            parse_reason: ctx.hasAmbientOpportunity ? "why_blocked_ambient" : "why_blocked_generic",
        };
    }

    if (FAIL_RE.test(t) && WEEK_RE.test(t)) {
        return { version: 1, sub_intent: "failed_runs_last_7d", parse_reason: "fail_language_week_window" };
    }
    if (FAIL_RE.test(t) && /\b(last|recent|today)\b/i.test(t)) {
        return { version: 1, sub_intent: "failed_runs_last_7d", parse_reason: "fail_language_recent" };
    }

    if (/\bwhich\b.*\bworkflow/i.test(t) && ENROLLMENT_RE.test(t)) {
        return { version: 1, sub_intent: "enrollment_touch", parse_reason: "which_workflows_touch_vertical" };
    }
    if (/\btouch(?:es|ing)?\b/i.test(t) && ENROLLMENT_RE.test(t)) {
        return { version: 1, sub_intent: "enrollment_touch", parse_reason: "touch_vertical_language" };
    }
    if (/\bworkflow/.test(t) && ENROLLMENT_RE.test(t) && !SUMMARY_RE.test(t)) {
        return { version: 1, sub_intent: "enrollment_touch", parse_reason: "workflow_plus_vertical" };
    }

    if (SUMMARY_RE.test(t) || /\bworkflows?\b.*\b(list|all)\b/i.test(t)) {
        return { version: 1, sub_intent: "workflow_summary", parse_reason: "summary_vocabulary" };
    }

    return { version: 1, sub_intent: "workflow_summary", parse_reason: "workflow_default_read_summary" };
}

/** Row shape for summary / enrollment cards (client-safe). */
export type WorkflowAssistSummaryRowV1 = {
    workflow_id: string;
    name: string;
    enabled: boolean | null;
    entity_type: string | null;
    event_type: string | null;
    steps_count: number;
    last_run_status: string | null;
    last_run_at: string | null;
    last_run_has_failed_action: boolean;
};

export type WorkflowAssistThreadMutationHandlersV1 = {
    onProposePause: (workflowId: string) => Promise<void>;
    onProposeCreateTemplate: () => Promise<void>;
};

/** Shown on read cards when the portal user is not `admin` (same gate as propose/apply `requireAdmin`). */
export const WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE =
    "Workflow changes require admin approval." as const;

export type WorkflowAssistFailedRunRowV1 = {
    run_id: string;
    workflow_id: string;
    workflow_name: string | null;
    status: string;
    started_at: string;
    has_failed_action: boolean;
};

export type WorkflowAssistReadCardPayloadV1 =
    | {
          variant: "workflow_summary";
          headline: string;
          subline?: string;
          workflows: WorkflowAssistSummaryRowV1[];
          total_count: number;
      }
    | {
          variant: "failed_runs";
          headline: string;
          subline?: string;
          failed_last_7d_kpi: number | null;
          runs: WorkflowAssistFailedRunRowV1[];
      }
    | {
          variant: "enrollment_touch";
          headline: string;
          subline?: string;
          workflows: WorkflowAssistSummaryRowV1[];
      }
    | {
          variant: "explain_placeholder";
          headline: string;
          checklist: string[];
          ambient_entity: { entity_type: string; entity_id: string } | null;
      };

type SummaryApiRow = {
    id: string;
    name?: string | null;
    enabled?: boolean | null;
    entity_type?: string | null;
    event_type?: string | null;
    steps_count?: number;
    last_run?: {
        status?: string;
        started_at?: string;
        has_failed_action?: boolean;
    } | null;
};

function mapSummaryRow(w: SummaryApiRow): WorkflowAssistSummaryRowV1 {
    const lr = w.last_run;
    return {
        workflow_id: String(w.id),
        name: (w.name ?? "—").trim() || "—",
        enabled: w.enabled ?? null,
        entity_type: w.entity_type ?? null,
        event_type: w.event_type ?? null,
        steps_count: typeof w.steps_count === "number" ? w.steps_count : 0,
        last_run_status: lr?.status != null ? String(lr.status) : null,
        last_run_at: lr?.started_at != null ? String(lr.started_at) : null,
        last_run_has_failed_action: Boolean(lr?.has_failed_action),
    };
}

function enrollmentHaystack(w: WorkflowAssistSummaryRowV1): string {
    return [w.name, w.entity_type, w.event_type].filter(Boolean).join(" ").toLowerCase();
}

function isEnrollmentTouchRow(w: WorkflowAssistSummaryRowV1): boolean {
    return ENROLLMENT_RE.test(enrollmentHaystack(w));
}

type RunApiRow = {
    id: string;
    workflow_id: string;
    workflow_name?: string | null;
    status?: string;
    started_at?: string;
    has_failed_action?: boolean;
};

function isRunFailedish(r: RunApiRow): boolean {
    const st = String(r.status ?? "").toLowerCase();
    return st === "failed" || Boolean(r.has_failed_action);
}

/** Build read-only card payload from existing admin API JSON (pure). */
export function buildWorkflowAssistReadCardPayload(
    intent: WorkflowAssistReadIntentV1,
    summaryJson: unknown,
    runs7dJson: unknown | null,
    kpisJson: unknown | null,
    ambient: { entity_type: string; entity_id: string } | null
): { ok: true; payload: WorkflowAssistReadCardPayloadV1 } | { ok: false; error: WorkflowAssistErrorEnvelopeV1 } {
    const body = summaryJson as { workflows?: unknown; error?: string };
    if (body?.error && typeof body.error === "string") {
        return { ok: false, error: workflowAssistErrorEnvelope("bad_response", body.error) };
    }
    const rawList = body?.workflows;
    if (!Array.isArray(rawList)) {
        return { ok: false, error: workflowAssistErrorEnvelope("bad_response", "Missing workflows array in summary response.") };
    }
    const workflows = (rawList as SummaryApiRow[]).map(mapSummaryRow);
    const total = workflows.length;

    const failedKpi =
        kpisJson && typeof kpisJson === "object" && (kpisJson as { kpis?: { failed_last_7d?: number } }).kpis?.failed_last_7d;
    const failedKpiNum = typeof failedKpi === "number" && !Number.isNaN(failedKpi) ? failedKpi : null;

    switch (intent.sub_intent) {
        case "explain_placeholder": {
            const checklist = [
                "Confirm the triggering event fired (status change, form completion, message queued, etc.).",
                "Check the workflow is enabled and matches event type + entity type for this org.",
                "Review conditions on the workflow — a failed condition skips or stops the run.",
                "Open Automations → select the workflow → inspect the latest run and step errors.",
                "If the record never reached the expected status, trace the admin action or PATCH path that should emit `workflow_events`.",
            ];
            return {
                ok: true,
                payload: {
                    variant: "explain_placeholder",
                    headline: "Why didn’t this run or move the record?",
                    checklist,
                    ambient_entity: ambient,
                },
            };
        }
        case "failed_runs_last_7d": {
            const runsBody = runs7dJson as { runs?: unknown; error?: string } | null;
            if (runsBody?.error) {
                return { ok: false, error: workflowAssistErrorEnvelope("bad_response", String(runsBody.error)) };
            }
            const rawRuns = Array.isArray(runsBody?.runs) ? (runsBody!.runs as RunApiRow[]) : [];
            const failedish = rawRuns.filter(isRunFailedish).slice(0, 20);
            const runs: WorkflowAssistFailedRunRowV1[] = failedish.map((r) => ({
                run_id: String(r.id),
                workflow_id: String(r.workflow_id),
                workflow_name: r.workflow_name ?? null,
                status: String(r.status ?? "unknown"),
                started_at: String(r.started_at ?? ""),
                has_failed_action: Boolean(r.has_failed_action),
            }));
            return {
                ok: true,
                payload: {
                    variant: "failed_runs",
                    headline: "Workflow runs with failures (last 7 days)",
                    subline:
                        runs.length ?
                            "Showing recent runs with run status failed or a failed action step."
                        :   "No failed runs in the sampled window, or none returned by the list API.",
                    failed_last_7d_kpi: failedKpiNum,
                    runs,
                },
            };
        }
        case "enrollment_touch": {
            const touched = workflows.filter(isEnrollmentTouchRow);
            return {
                ok: true,
                payload: {
                    variant: "enrollment_touch",
                    headline: "Workflows that may touch enrollment-style signals",
                    subline:
                        "Matched on workflow name, entity type, or event type (keyword heuristic — verify in Automations).",
                    workflows: touched.slice(0, 24),
                },
            };
        }
        case "workflow_summary":
        default: {
            return {
                ok: true,
                payload: {
                    variant: "workflow_summary",
                    headline: "Workflow summary",
                    subline: total ? `${total} workflow${total === 1 ? "" : "s"} in this org.` : "No workflows configured for this org.",
                    workflows: workflows.slice(0, 16),
                    total_count: total,
                },
            };
        }
    }
}
