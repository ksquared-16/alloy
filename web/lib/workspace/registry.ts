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
            title: "Signals",
            subtitle: "Light operational counts (slice 2 — not a full alerting system).",
            signals: [
                {
                    id: "unassigned_jobs",
                    label: "Jobs with no work unit",
                    metric: "jobs.unassigned_count",
                },
            ],
        },
        {
            id: "queues_primary",
            type: "queue",
            title: "Queues",
            subtitle: "Entry points into work-unit queues. Unassigned triage uses the existing jobs API bridge.",
            entries: [
                {
                    kind: "unassigned_jobs_triage",
                    label: "Unassigned Jobs",
                    description: "Triage queue — jobs where work unit is not set. Backed by GET /api/admin/jobs?unassigned_work_unit=true until the queue interpreter lands.",
                },
            ],
            list_remaining_work_units: true,
        },
        {
            id: "kpi_strip",
            type: "kpi",
            title: "KPIs",
            state: "placeholder",
            message: "Placeholder strip — wire analytics when the metrics layer exists.",
        },
        {
            id: "actions_admin",
            type: "actions",
            title: "Actions",
            actions: [
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
            title: "About this surface",
            paragraphs: [
                "This department workspace is a configurable operational shell: blocks are driven by layout config, not one-off React pages.",
                "Queues combine RRS-backed records in the drawer with list bridges (today) and structured queue definitions (next).",
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

const BY_KEY: Record<string, DepartmentWorkspaceLayout> = {
    operations: OPERATIONS,
};

export function getDepartmentWorkspaceLayout(departmentKey: string | null | undefined): DepartmentWorkspaceLayout {
    const k = (departmentKey ?? "").trim().toLowerCase();
    if (k && BY_KEY[k]) return BY_KEY[k];
    return GENERIC;
}
