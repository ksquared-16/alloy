import type { JobRowForWorkspaceMetrics } from "./jobMetricsRow";

/** Canonical exception lanes for the Needs Attention work unit (exception-driven). */
export type NeedsAttentionExceptionType =
    | "overdue_visit"
    | "payment_issue"
    | "high_value_unassigned"
    | "ready_for_assignment";

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";

export type ExceptionPrimaryAction = {
    kind: "open_queue";
    /** Query key appended to the needs-attention route: `?exception=<key>` */
    exception: NeedsAttentionExceptionType;
};

export type ExceptionQuickAction = {
    id: string;
    label: string;
    /** Relative or absolute admin href — no new surfaces */
    href: string;
};

export type NeedsAttentionExceptionDefinition = {
    key: NeedsAttentionExceptionType;
    label: string;
    description: string;
    /** User-facing severity for ordering / emphasis (Amber stays visual-only via lane). */
    severity: ExceptionSeverity;
    defaultAction: ExceptionPrimaryAction;
    /** Optional secondary CTAs (scheduling, assignment, payments). */
    quickActions?: ExceptionQuickAction[];
    /**
     * Predicate on enriched job rows (same sample as workspace signals).
     * Documented to mirror `WorkspaceQueueFilterIntent` for future queue_definition parity.
     */
    matches: (job: JobRowForWorkspaceMetrics, nowMs: number) => boolean;
    /** Human-readable filter notes for operators / future DSL. */
    filterLogic: string;
};

const HIGH_VALUE_MIN_CENTS = 300 * 100;

function overdueVisit(job: JobRowForWorkspaceMetrics, nowMs: number): boolean {
    if (!job._next_schedule) return false;
    return new Date(job._next_schedule).getTime() < nowMs;
}

function paymentIssue(job: JobRowForWorkspaceMetrics): boolean {
    return (job.receivable_outstanding_cents ?? 0) > 0;
}

function highValueUnassigned(job: JobRowForWorkspaceMetrics): boolean {
    const g = job.gross_price_cents ?? 0;
    return g >= HIGH_VALUE_MIN_CENTS && (job.work_unit_id == null || job.work_unit_id === "");
}

function readyForAssignment(job: JobRowForWorkspaceMetrics): boolean {
    return (job.status_key ?? "").trim().toLowerCase() === "ready_for_assignment";
}

/**
 * Single source of truth for exception semantics, copy, and row matching.
 * Query/filter: client applies `matches` after the same merged job sample as signals (≤200/endpoint).
 */
export const NEEDS_ATTENTION_EXCEPTIONS: Record<NeedsAttentionExceptionType, NeedsAttentionExceptionDefinition> = {
    overdue_visit: {
        key: "overdue_visit",
        label: "Overdue visit",
        description: "Next scheduled visit is already in the past — reschedule or confirm completion.",
        severity: "high",
        defaultAction: { kind: "open_queue", exception: "overdue_visit" },
        quickActions: [
            { id: "open_schedules", label: "Schedules", href: "/admin/schedules" },
        ],
        matches: (job, nowMs) => overdueVisit(job, nowMs),
        filterLogic: "jobs where next non-canceled future schedule start_at < now (enriched as _next_schedule)",
    },
    payment_issue: {
        key: "payment_issue",
        label: "Payment issue",
        description: "Outstanding receivable on the job — collect or reconcile.",
        severity: "high",
        defaultAction: { kind: "open_queue", exception: "payment_issue" },
        quickActions: [
            { id: "open_jobs_admin", label: "All jobs", href: "/admin/jobs" },
        ],
        matches: (job, _nowMs) => paymentIssue(job),
        filterLogic: "jobs where receivable_outstanding_cents > 0 (balance snapshot on list payload)",
    },
    high_value_unassigned: {
        key: "high_value_unassigned",
        label: "High-value unassigned",
        description: "Gross ≥ $300 and no work unit — assign routing before work proceeds.",
        severity: "medium",
        defaultAction: { kind: "open_queue", exception: "high_value_unassigned" },
        quickActions: [{ id: "configure_work_units", label: "Work units", href: "/admin/system/work-units" }],
        matches: (job, _nowMs) => highValueUnassigned(job),
        filterLogic: "gross_price_cents >= 300_00 AND work_unit_id IS NULL",
    },
    ready_for_assignment: {
        key: "ready_for_assignment",
        label: "Ready for assignment",
        description: "Status is ready_for_assignment — move into a lane or assign vendor.",
        severity: "medium",
        defaultAction: { kind: "open_queue", exception: "ready_for_assignment" },
        quickActions: [{ id: "configure_work_units", label: "Work units", href: "/admin/system/work-units" }],
        matches: (job, _nowMs) => readyForAssignment(job),
        filterLogic: "status_key = ready_for_assignment",
    },
};

export const NEEDS_ATTENTION_EXCEPTION_ORDER: NeedsAttentionExceptionType[] = [
    "overdue_visit",
    "payment_issue",
    "high_value_unassigned",
    "ready_for_assignment",
];

export function jobMatchesExceptionType(
    job: JobRowForWorkspaceMetrics,
    type: NeedsAttentionExceptionType,
    nowMs: number
): boolean {
    return NEEDS_ATTENTION_EXCEPTIONS[type].matches(job, nowMs);
}

export function parseNeedsAttentionExceptionParam(raw: string | null | undefined): NeedsAttentionExceptionType | null {
    if (!raw || !raw.trim()) return null;
    const k = raw.trim() as NeedsAttentionExceptionType;
    return NEEDS_ATTENTION_EXCEPTIONS[k] ? k : null;
}

/** True if the job matches at least one Needs Attention exception predicate (union of exception lanes). */
export function jobMatchesAnyNeedsAttentionException(job: JobRowForWorkspaceMetrics, nowMs: number): boolean {
    return NEEDS_ATTENTION_EXCEPTION_ORDER.some((t) => NEEDS_ATTENTION_EXCEPTIONS[t].matches(job, nowMs));
}

/** Default rows for the needs_attention work-unit queue — union of all exception types, one row per job id. */
export function filterJobsForNeedsAttentionWorkUnit(
    rows: JobRowForWorkspaceMetrics[],
    nowMs: number
): JobRowForWorkspaceMetrics[] {
    const seen = new Set<string>();
    const out: JobRowForWorkspaceMetrics[] = [];
    for (const j of rows) {
        if (!jobMatchesAnyNeedsAttentionException(j, nowMs)) continue;
        if (seen.has(j.id)) continue;
        seen.add(j.id);
        out.push(j);
    }
    return out;
}
