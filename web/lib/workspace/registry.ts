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
            id: "kpi_growth_pipeline",
            type: "kpi",
            state: "opportunity_lifecycle_pipeline",
            title: "Growth pipeline",
            subtitle:
                "Volume and value derive from opportunities, your configured statuses, and lifecycle stages — not jobs or vendor assignment.",
            recordLabel: "Opportunity",
        },
        {
            id: "signals_growth",
            type: "signals",
            title: "Pipeline signals",
            subtitle: "Counts from opportunity queue projections (same org scope as admin APIs).",
            signals: [
                {
                    id: "g_new_leads",
                    eyebrow: "Intake · execution",
                    label: "Front of funnel (queue)",
                    metric: "growth.new_leads_count",
                },
                {
                    id: "g_unbooked",
                    eyebrow: "Decision",
                    label: "Priced · open (queue)",
                    metric: "growth.unbooked_quotes_count",
                },
            ],
        },
        {
            id: "queues_growth",
            type: "queue",
            title: "Growth queues",
            subtitle: "Each list is a lifecycle slice (intake → execution, or decision while priced and still open). Open a row for the full record.",
            entries: [
                {
                    kind: "work_unit_key",
                    work_unit_key: "new_leads",
                    label: "Front of funnel",
                    description:
                        "Intake / qualification / execution without a positive quote yet — early pipeline work before a priced decision.",
                },
                {
                    kind: "work_unit_key",
                    work_unit_key: "unbooked_quotes",
                    label: "Priced · not closed",
                    description:
                        "Decision stage: quote_total is positive and the opportunity is not in a terminal success/failure status (and not on a booked stage).",
                },
            ],
            list_remaining_work_units: false,
        },
        {
            id: "growth_actions_rail",
            type: "growth_workspace_actions",
            title: "Growth actions",
        },
        {
            id: "context_growth",
            type: "context",
            title: "About Growth",
            paragraphs: [
                "Queues are read-only projections over opportunities — the opportunity row remains the lifecycle record.",
                "Lifecycle stage (intake through success/failure) is resolved from status definitions plus a derived “decision” stage when a price exists.",
            ],
        },
    ],
};

/** Enrollment (childcare and other verticals) — same pipeline mechanics as Growth, department-local copy. */
const ENROLLMENT: DepartmentWorkspaceLayout = {
    department_key: "enrollment",
    blocks: [
        {
            id: "kpi_enrollment_pipeline",
            type: "kpi",
            state: "opportunity_lifecycle_pipeline",
            title: "Enrollment pipeline",
            subtitle:
                "Counts and dollars follow your opportunity statuses and lifecycle stages (same logic as queues below). This department owns family inquiries through enrollment decisions — not classroom operations or jobs.",
            recordLabel: "Family inquiry",
        },
        {
            id: "signals_enrollment",
            type: "signals",
            title: "Queue snapshot",
            subtitle: "Work-unit slices — open a queue to work rows; KPIs above are org-wide pipeline totals.",
            signals: [
                {
                    id: "g_new_leads",
                    eyebrow: "Intake · execution",
                    label: "Front of funnel (queue)",
                    metric: "growth.new_leads_count",
                },
                {
                    id: "g_unbooked",
                    eyebrow: "Decision",
                    label: "Priced · open (queue)",
                    metric: "growth.unbooked_quotes_count",
                },
            ],
        },
        {
            id: "queues_enrollment",
            type: "queue",
            title: "Enrollment queues",
            subtitle: "Lifecycle slices from your work units — each list uses the server queue interpreter on opportunities.",
            entries: [
                {
                    kind: "work_unit_key",
                    work_unit_key: "new_leads",
                    label: "Front of funnel",
                    description:
                        "Intake / qualification / execution before a positive enrollment offer — early pipeline work.",
                },
                {
                    kind: "work_unit_key",
                    work_unit_key: "unbooked_quotes",
                    label: "Offer out · not enrolled",
                    description:
                        "Decision stage: a price exists and the opportunity is not yet in a terminal enrolled/lost outcome.",
                },
            ],
            list_remaining_work_units: false,
        },
        {
            id: "enrollment_actions_rail",
            type: "growth_workspace_actions",
            title: "Enrollment actions",
        },
        {
            id: "context_enrollment",
            type: "context",
            title: "About Enrollment",
            paragraphs: [
                "This is your primary surface for family demand: inquiries, tours, offers, and enrollment decisions.",
                "Statuses and lifecycle stages are configurable per org — the KPI strip uses the same effective rules as opportunity records and queues.",
            ],
        },
    ],
};

const BY_KEY: Record<string, DepartmentWorkspaceLayout> = {
    operations: OPERATIONS,
    growth: GROWTH,
    enrollment: ENROLLMENT,
};

export function getDepartmentWorkspaceLayout(departmentKey: string | null | undefined): DepartmentWorkspaceLayout {
    const k = (departmentKey ?? "").trim().toLowerCase();
    if (k && BY_KEY[k]) return BY_KEY[k];
    return GENERIC;
}
