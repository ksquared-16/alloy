import type {
    ContextBlockVm,
    KPIVm,
    QueueItemVm,
    QueueVm,
    SignalVm,
    WorkUnitWorkspaceModel,
} from "@/lib/ui-v2/workspace-types";
import type { AdminJobListRow, DepartmentJobsQueueMode } from "@/hooks/useDepartmentQueueData";
import { formatDateTime, formatMoneyFromDollars } from "@/lib/adminFormatters";

const MODE_HEADLINE: Record<DepartmentJobsQueueMode, string> = {
    unassigned: "Unassigned jobs",
    scheduled_today: "Scheduled today",
    needs_attention: "Needs attention",
};

function jobToQueueItem(j: AdminJobListRow): QueueItemVm {
    const subtitle = [j._customer_name?.trim(), j._status_display?.trim()].filter(Boolean).join(" · ");
    const overdue = j._next_schedule ? new Date(j._next_schedule).getTime() < Date.now() : false;
    const money = (j.receivable_outstanding_cents ?? 0) > 0;
    let urgencyTier: QueueItemVm["urgencyTier"] = "standard";
    if (money || overdue) urgencyTier = "warning";

    const vendorLabel = (j._vendor_name ?? j._assigned_vendor_name ?? "").trim();

    const metaLines: { label: string; value: string }[] = [];
    const loc = (j._location_label ?? "").trim();
    if (loc) {
        metaLines.push({ label: "Location", value: loc });
    }
    if (vendorLabel) {
        metaLines.push({ label: "Vendor", value: vendorLabel });
    }
    if (j._next_schedule) {
        metaLines.push({ label: "Next visit", value: formatDateTime(j._next_schedule) });
    }
    if (money && j.receivable_outstanding_cents != null) {
        metaLines.push({
            label: "Outstanding",
            value: formatMoneyFromDollars(j.receivable_outstanding_cents / 100),
        });
    }

    const title = (j._job_label ?? j.title ?? "Job").trim() || "Job";
    const valueLabel =
        j._price_display != null && Number.isFinite(j._price_display)
            ? formatMoneyFromDollars(j._price_display)
            : undefined;

    return {
        id: j.id,
        title,
        subtitle: subtitle || undefined,
        quickActions: [{ id: "open", label: "Open" }],
        metaLines: metaLines.length > 0 ? metaLines : undefined,
        valueLabel,
        urgencyTier,
    };
}

/**
 * Maps live job rows into the Admin V2 `WorkUnitWorkspace` view model (same shell as the UI V2 mock).
 * No invented business facts — copy explains API sampling limits.
 */
export function buildRealWorkUnitWorkspaceModel(input: {
    departmentId: string;
    deptName: string;
    mode: DepartmentJobsQueueMode;
    jobs: AdminJobListRow[];
}): WorkUnitWorkspaceModel {
    const { departmentId, deptName, mode, jobs } = input;
    const headline = MODE_HEADLINE[mode];

    const signals: SignalVm[] = [
        {
            id: "queue_depth",
            severity: jobs.length > 0 ? "info" : "warning",
            title: `${jobs.length} job${jobs.length === 1 ? "" : "s"} in this lane`,
            description: undefined,
            actions: [{ id: "nav_jobs", label: "All jobs" }],
        },
        {
            id: "scheduling",
            severity: "info",
            title: "Scheduling",
            description: "Open the org schedule board.",
            actions: [{ id: "nav_schedules", label: "Schedules" }],
        },
    ];

    const kpis: KPIVm[] = [
        { id: "k_shown", label: "Rows shown", value: String(jobs.length) },
        { id: "k_cap", label: "Sample cap", value: "200", unit: "rows / source" },
    ];

    const primaryQueue: QueueVm = {
        id: `lane-${mode}-${departmentId}`,
        title: headline,
        countBadge: jobs.length,
        items: jobs.map(jobToQueueItem),
        sortCaption: "Ordered by API default (typically newest activity first).",
        rollupSummary:
            mode === "unassigned"
                ? "Jobs with no vendor assigned yet — assign a vendor to clear this lane."
                : mode === "scheduled_today"
                  ? "Next visit falls on today’s local calendar date."
                  : "Overdue visit or outstanding receivable in the merged sample.",
    };

    const emptyContextRail: ContextBlockVm = { groups: [] };

    return {
        workspaceLevel: "work_unit",
        workUnitId: `${departmentId}:${mode}`,
        laneKey: mode,
        focusLabel: deptName.trim() || "Department",
        aiSummary: {
            headline,
            subline: `${deptName.trim() || "Department"} · live data`,
            bodyParagraphs: [
                "Same job records as the rest of Alloy — resolver-backed drawer opens from each row.",
                "Counts are limited to the current API sample (up to 200 rows per request).",
            ],
        },
        laneInterpretation: {
            laneStatusLine: `Department ${deptName.trim() || departmentId} — ${headline.toLowerCase()}.`,
            recommendedActionLine:
                mode === "unassigned"
                    ? "Open a job, assign a vendor in the snapshot — the job leaves this lane when saved; work unit is optional routing elsewhere."
                    : "Select a row to triage in the drawer, or jump to All jobs from the rail.",
        },
        signals,
        kpis,
        primaryQueue,
        workSummary: null,
        actionsRail: {
            primaries: [],
            systemActions: [
                { id: "back_department", label: "← Department overview", variant: "primary" },
                { id: "open_admin_jobs", label: "All jobs (admin table)", variant: "secondary" },
            ],
            quickOperations: [
                { id: "open_schedules", label: "Schedules calendar" },
                { id: "open_work_units", label: "Configure work units" },
            ],
            systemStatusLines: [
                "Open a row for the job modal · Back returns to the department surface.",
                `Sample ≤200 jobs · ${deptName.trim() || "this department"}.`,
            ],
        },
        contextRail: emptyContextRail,
    };
}
