import type {
    ContextBlockVm,
    KPIVm,
    QueueItemVm,
    QueueVm,
    SignalVm,
    WorkUnitWorkspaceModel,
} from "@/lib/ui-v2/workspace-types";
import type {
    AdminJobListRow,
    AdminScheduleListRow,
    DepartmentJobsQueueMode,
} from "@/hooks/useDepartmentQueueData";
import { formatDateTime, formatMoneyFromDollars } from "@/lib/adminFormatters";
import { NEEDS_ATTENTION_EXCEPTIONS, type NeedsAttentionExceptionType } from "@/lib/workspace/exceptionTypes";

const MODE_HEADLINE: Record<DepartmentJobsQueueMode, string> = {
    unassigned: "Unassigned jobs",
    scheduled_today: "Today’s Schedule",
    needs_attention: "Needs attention",
};

function formatScheduleLocalTime(iso: string, tz: string | null | undefined): string {
    try {
        return new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: tz && tz.trim() ? tz : "UTC",
        }).format(new Date(iso));
    } catch {
        return new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "UTC",
        }).format(new Date(iso));
    }
}

function scheduleJobLabel(s: AdminScheduleListRow): string {
    const t = (s._job_title ?? "").trim();
    if (t) return t;
    const sk = (s._service_key ?? "").trim();
    if (sk) return sk;
    return s.job_id ? s.job_id.slice(-6) : "Visit";
}

function scheduleToQueueItem(s: AdminScheduleListRow): QueueItemVm {
    const timeLabel = formatScheduleLocalTime(s.start_at, s.timezone);
    const jobLbl = scheduleJobLabel(s);
    const title = `${timeLabel} · ${jobLbl}`;
    const subtitle = [s._customer_name?.trim(), s._status_display?.trim()].filter(Boolean).join(" · ");
    const vendorLabel = (s._assigned_vendor_name ?? "").trim();

    const metaLines: { label: string; value: string }[] = [];
    const loc = (s._location_label ?? "").trim();
    if (loc) {
        metaLines.push({ label: "Location", value: loc });
    }
    if (vendorLabel) {
        metaLines.push({ label: "Vendor", value: vendorLabel });
    }
    const sn = String(s.schedule_number ?? "").trim();
    if (sn) {
        metaLines.push({ label: "Schedule #", value: sn });
    }

    const startMs = new Date(s.start_at).getTime();
    const overdue = !Number.isNaN(startMs) && startMs < Date.now();
    let urgencyTier: QueueItemVm["urgencyTier"] = "standard";
    if (overdue) urgencyTier = "warning";

    return {
        id: s.id,
        title,
        subtitle: subtitle || undefined,
        quickActions: [{ id: "open", label: "Open" }],
        metaLines: metaLines.length > 0 ? metaLines : undefined,
        urgencyTier,
    };
}

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
 * Maps live job rows (or schedule rows for “today”) into the Admin V2 `WorkUnitWorkspace` view model.
 */
export function buildRealWorkUnitWorkspaceModel(input: {
    departmentId: string;
    deptName: string;
    /** When known, aligns lane shell with department visual identity (see `@/lib/visualContext`). */
    departmentKey?: string | null;
    mode: DepartmentJobsQueueMode;
    /** Needs Attention: when set, queue is filtered to this exception lane (`?exception=`). */
    exceptionFocus?: NeedsAttentionExceptionType | null;
    jobs: AdminJobListRow[];
    schedules?: AdminScheduleListRow[];
}): WorkUnitWorkspaceModel {
    const { departmentId, deptName, mode, jobs } = input;
    const exceptionFocus = input.exceptionFocus ?? null;
    const schedules = input.schedules ?? [];
    const useSchedules = mode === "scheduled_today";
    const rowCount = useSchedules ? schedules.length : jobs.length;
    const headline =
        mode === "needs_attention" && exceptionFocus
            ? NEEDS_ATTENTION_EXCEPTIONS[exceptionFocus].label
            : MODE_HEADLINE[mode];

    const laneNoun = useSchedules ? (rowCount === 1 ? "visit" : "visits") : rowCount === 1 ? "job" : "jobs";

    const signals: SignalVm[] = [
        {
            id: "queue_depth",
            severity: rowCount > 0 ? "info" : "warning",
            title: `${rowCount} ${laneNoun} in this lane`,
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
        { id: "k_shown", label: "Rows shown", value: String(rowCount) },
        { id: "k_cap", label: "Sample cap", value: "200", unit: "rows / source" },
    ];

    const primaryQueue: QueueVm = {
        id: `lane-${mode}-${departmentId}${exceptionFocus ? `-${exceptionFocus}` : ""}`,
        title: headline,
        countBadge: rowCount,
        items: useSchedules ? schedules.map(scheduleToQueueItem) : jobs.map(jobToQueueItem),
        sortCaption:
            mode === "scheduled_today"
                ? "Ordered by visit start time on the org’s local calendar day."
                : mode === "needs_attention" && exceptionFocus
                  ? "Filtered to this exception type in the merged job sample (≤200 rows per source)."
                  : "Ordered by API default (typically newest activity first).",
        rollupSummary:
            mode === "unassigned"
                ? "Jobs with no vendor assigned yet — assign a vendor to clear this lane."
                : mode === "scheduled_today"
                  ? "Non-canceled visits starting on the org’s local “today” (timezone from org settings) — one row per schedule."
                  : mode === "needs_attention" && exceptionFocus
                    ? NEEDS_ATTENTION_EXCEPTIONS[exceptionFocus].description
                    : "Exception work unit — overdue visit, payment issue, high-value unassigned, or ready for assignment (union in merged sample).",
    };

    const emptyContextRail: ContextBlockVm = { groups: [] };

    const openRowHint =
        mode === "scheduled_today"
            ? "Open a row for the schedule drawer · Back returns to the department surface."
            : "Open a row for the job modal · Back returns to the department surface.";

    return {
        workspaceLevel: "work_unit",
        workUnitId: `${departmentId}:${mode}${exceptionFocus ? `:${exceptionFocus}` : ""}`,
        departmentKey: input.departmentKey ?? undefined,
        laneKey: mode,
        focusLabel: deptName.trim() || "Department",
        aiSummary: {
            headline,
            subline: `${deptName.trim() || "Department"} · live data`,
            bodyParagraphs: [
                useSchedules
                    ? "Each row is one schedule occurrence; the drawer opens that visit for cancel/reschedule/assign."
                    : "Same job records as the rest of Alloy — resolver-backed drawer opens from each row.",
                "Counts are limited to the current API sample (up to 200 rows per request).",
            ],
        },
        laneInterpretation: {
            laneStatusLine: `Department ${deptName.trim() || departmentId} — ${headline.toLowerCase()}.`,
            recommendedActionLine:
                mode === "unassigned"
                    ? "Open a job, assign a vendor in the snapshot — the job leaves this lane when saved; work unit is optional routing elsewhere."
                    : mode === "scheduled_today"
                      ? "Select a row to open the schedule in the drawer, or jump to All jobs from the rail."
                      : mode === "needs_attention" && exceptionFocus
                        ? "Triage each row in the job drawer — exception cards on the department surface include shortcuts when you need Schedules or work-unit setup."
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
                openRowHint,
                `Sample ≤200 ${useSchedules ? "schedules" : "jobs"} · ${deptName.trim() || "this department"}.`,
            ],
        },
        contextRail: emptyContextRail,
    };
}
