import type { DepartmentWorkspaceLayout } from "./types";

/**
 * Department workspace layouts — code-first registry (slice 2).
 *
 * Why code for now:
 * - Ship typed, reviewed layouts without a migration + admin editor.
 * - Same `DepartmentWorkspaceLayout` shape can later be loaded from DB per org/department.
 *
 * Add rows: duplicate the operations pattern with a new `department_key` and `blocks` array.
 */
const OPERATIONS: DepartmentWorkspaceLayout = {
    department_key: "operations",
    blocks: [
        {
            id: "signals_primary",
            type: "signals",
            title: "What needs attention",
            subtitle: "Live counts from your job data (samples capped per API — not full analytics).",
            signals: [
                {
                    id: "unassigned_jobs",
                    eyebrow: "Triage",
                    label: "No vendor",
                    metric: "jobs.unassigned_count",
                },
                {
                    id: "scheduled_today",
                    eyebrow: "Today",
                    label: "Visits scheduled (today)",
                    metric: "schedules.scheduled_today_count",
                },
                {
                    id: "needs_attention",
                    eyebrow: "Risk",
                    label: "Money or overdue visit",
                    metric: "jobs.needs_attention_count",
                },
                {
                    id: "high_value",
                    eyebrow: "Priority",
                    label: "High-value open",
                    metric: "jobs.high_value_attention_count",
                },
            ],
        },
        {
            id: "queues_primary",
            type: "queue",
            title: "Work queues",
            subtitle: "Operational entry points — same APIs as the admin jobs list; drawer opens resolver-backed records.",
            entries: [
                {
                    kind: "unassigned_jobs_triage",
                    label: "Unassigned jobs",
                    description: "Jobs with no vendor assigned — assign a vendor to exit this lane.",
                },
                {
                    kind: "department_workspace_route",
                    segment: "scheduled-today",
                    label: "Today’s Schedule",
                    description: "Visit occurrences on the org’s local calendar day (one row per schedule; timezone from org settings).",
                },
                {
                    kind: "department_workspace_route",
                    segment: "needs-attention",
                    label: "Needs Attention",
                    description: "Overdue visits or outstanding receivables in the current sample.",
                },
            ],
            list_remaining_work_units: true,
        },
        {
            id: "attention_exceptions",
            type: "attention",
            title: "Exceptions & attention",
            subtitle: "Grouped risk — counts from the same merged job sample as signals (≤200 rows per API source).",
            categories: [
                {
                    id: "overdue_visit",
                    label: "Overdue visits",
                    description: "Next visit time is already in the past.",
                    target: { deptRoute: "needs-attention", exception: "overdue_visit" },
                },
                {
                    id: "payment_issue",
                    label: "Payment issues",
                    description: "Outstanding receivable balance on the job.",
                    target: { deptRoute: "needs-attention", exception: "payment_issue" },
                },
                {
                    id: "high_value_unassigned",
                    label: "High-value unassigned",
                    description: "≥ $300 gross and no work unit yet.",
                    target: { deptRoute: "needs-attention", exception: "high_value_unassigned" },
                },
                {
                    id: "ready_for_assignment",
                    label: "Ready for assignment",
                    description: "Jobs in status ready_for_assignment.",
                    target: { deptRoute: "needs-attention", exception: "ready_for_assignment" },
                },
            ],
        },
        {
            id: "actions_admin",
            type: "actions",
            title: "What’s next",
            actions: [
                {
                    id: "open_unassigned",
                    label: "Open unassigned queue",
                    variant: "primary",
                    deptRoute: "unassigned",
                },
                {
                    id: "scheduled_today_action",
                    label: "Today’s Schedule",
                    deptRoute: "scheduled-today",
                },
                {
                    id: "needs_attention_action",
                    label: "Needs Attention",
                    deptRoute: "needs-attention",
                },
                {
                    id: "all_jobs",
                    label: "All jobs",
                    href: "/admin/jobs",
                    variant: "secondary",
                },
                {
                    id: "schedules",
                    label: "Schedules",
                    href: "/admin/schedules",
                    variant: "secondary",
                },
                {
                    id: "manage_work_units",
                    label: "Manage work units",
                    href: "/admin/system/work-units",
                    variant: "secondary",
                },
            ],
        },
        {
            id: "context_surface",
            type: "context",
            title: "About Operations",
            paragraphs: [
                "This surface is tuned for field operations: triage unassigned work, watch today’s visits, and clear money or schedule risk early.",
                "Counts and queues use the same admin jobs APIs as the rest of Alloy — one registry drives both /admin/workspace and /adminV2/workspace.",
            ],
        },
    ],
};

/** When no registry entry matches, still render a useful shell from API work units only. */
const GENERIC: DepartmentWorkspaceLayout = {
    department_key: null,
    blocks: [
        {
            id: "context_generic",
            type: "context",
            title: "Department workspace",
            paragraphs: [
                "No block layout is registered for this department key yet. Showing work units from the API below.",
                "Ask engineering to add a `DepartmentWorkspaceLayout` in `web/lib/workspace/registry.ts` for this department.",
            ],
        },
        {
            id: "queues_generic",
            type: "queue",
            title: "Work units",
            subtitle: "Operational queues for this department.",
            entries: [],
            list_remaining_work_units: true,
        },
        {
            id: "kpi_generic",
            type: "kpi",
            title: "KPIs",
            state: "placeholder",
            message: "—",
        },
    ],
};

/** Growth — opportunity-backed queues (server interpreter + `work_units.queue_definition`). */
const GROWTH: DepartmentWorkspaceLayout = {
    department_key: "growth",
    blocks: [
        {
            id: "signals_growth",
            type: "signals",
            title: "Pipeline signals",
            subtitle: "Counts from opportunity queue projections (same org scope as admin APIs).",
            signals: [
                {
                    id: "g_new_leads",
                    eyebrow: "Intake",
                    label: "New leads (queue)",
                    metric: "growth.new_leads_count",
                },
                {
                    id: "g_unbooked",
                    eyebrow: "Quotes",
                    label: "Unbooked quotes (queue)",
                    metric: "growth.unbooked_quotes_count",
                },
            ],
        },
        {
            id: "queues_growth",
            type: "queue",
            title: "Growth queues",
            subtitle: "Opportunities projected from each work unit’s queue_definition — open a row for the record drawer.",
            entries: [
                {
                    kind: "work_unit_key",
                    work_unit_key: "new_leads",
                    label: "New leads",
                    description: "Early demand — status new / needs_a_quote with no positive quote total.",
                },
                {
                    kind: "work_unit_key",
                    work_unit_key: "unbooked_quotes",
                    label: "Unbooked quotes",
                    description: "Quoted opportunities not yet booked (excludes booked / scheduled status; excludes booked stage).",
                },
            ],
            list_remaining_work_units: false,
        },
        {
            id: "context_growth",
            type: "context",
            title: "About Growth",
            paragraphs: [
                "Queues are read-only projections over opportunities — the opportunity row remains the lifecycle record.",
                "Filters are defined in each work unit’s queue_definition and executed on the server.",
            ],
        },
    ],
};

const BY_KEY: Record<string, DepartmentWorkspaceLayout> = {
    operations: OPERATIONS,
    growth: GROWTH,
};

export function getDepartmentWorkspaceLayout(departmentKey: string | null | undefined): DepartmentWorkspaceLayout {
    const k = (departmentKey ?? "").trim().toLowerCase();
    if (k && BY_KEY[k]) return BY_KEY[k];
    return GENERIC;
}
