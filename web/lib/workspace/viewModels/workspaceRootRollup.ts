import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { OpportunityLifecycleKpiCounts } from "@/lib/workspace/computeOpportunityLifecycleKpis";
import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";
import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { WorkspaceRootDeptTileStats } from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";

export type DepartmentLifecycleStatusBreakdownRow = {
    status_key: string;
    status_label?: string;
    lifecycle_stage?: string | null;
    count: number;
};

/** JSON shape from GET `/api/admin/departments/:departmentId/opportunity-lifecycle-kpis`. */
export type DepartmentLifecycleKpisPayload = {
    counts?: OpportunityLifecycleKpiCounts;
    values?: { openPipeline?: number; pricedInMotion?: number };
    statusBreakdown?: DepartmentLifecycleStatusBreakdownRow[];
    error?: string;
};

/** Exact primary-lane count from QueueService (same filters as row list for that queue). */
export type PipelineExactSnapshot =
    | {
          work_unit_id: string;
          queue_key: string | null;
          total: number | null;
      }
    | null;

/** Growth / enrollment: exact pipeline work unit + optional lifecycle analytics (not for pipeline row counts). */
export type WorkspaceGrowthDeptSnapshot = {
    id: string;
    key: string;
    pipelineExact: PipelineExactSnapshot;
    lifecycleAnalytics: DepartmentLifecycleKpisPayload | null;
};

export function inMotionCountFromLifecycleCounts(c: OpportunityLifecycleKpiCounts | undefined): number {
    if (!c) return 0;
    return (c.intake ?? 0) + (c.qualification ?? 0) + (c.execution ?? 0) + (c.decision ?? 0);
}

export function closedCountFromLifecycleCounts(c: OpportunityLifecycleKpiCounts | undefined): number {
    if (!c) return 0;
    return (c.success ?? 0) + (c.failure ?? 0);
}

function breakdownCountByKey(
    breakdown: DepartmentLifecycleStatusBreakdownRow[] | undefined,
    statusKey: string,
): number {
    const target = statusKey.trim().toLowerCase();
    let sum = 0;
    for (const row of breakdown ?? []) {
        if (String(row.status_key ?? "").trim().toLowerCase() === target) {
            sum += Math.max(0, Number(row.count) || 0);
        }
    }
    return sum;
}

export type WorkspaceEnrollmentKpiRollup = {
    activeLeads: number;
    scheduledTours: number;
    enrollmentOpportunities: number;
    waitlistedFamilies: number;
    sawLifecycleAnalytics: boolean;
};

/** Sum enrollment-facing KPIs from growth-slice lifecycle analytics already fetched for workspace rollup. */
export function aggregateWorkspaceEnrollmentKpiRollup(
    snapshots: WorkspaceGrowthDeptSnapshot[],
): WorkspaceEnrollmentKpiRollup {
    let activeLeads = 0;
    let scheduledTours = 0;
    let enrollmentOpportunities = 0;
    let waitlistedFamilies = 0;
    let sawLifecycleAnalytics = false;

    for (const { key, lifecycleAnalytics } of snapshots) {
        if (!isGrowthSliceDepartmentKey(key)) continue;
        const kpis = lifecycleAnalytics;
        if (!kpis?.counts) continue;
        sawLifecycleAnalytics = true;

        const enrolled = breakdownCountByKey(kpis.statusBreakdown, "enrolled");
        const lost = breakdownCountByKey(kpis.statusBreakdown, "lost");
        const total = Math.max(0, kpis.counts.total ?? 0);
        activeLeads += Math.max(0, total - enrolled - lost);

        scheduledTours += breakdownCountByKey(kpis.statusBreakdown, "tour_scheduled");
        enrollmentOpportunities += inMotionCountFromLifecycleCounts(kpis.counts);
        waitlistedFamilies += breakdownCountByKey(kpis.statusBreakdown, "waitlisted");
    }

    return {
        activeLeads,
        scheduledTours,
        enrollmentOpportunities,
        waitlistedFamilies,
        sawLifecycleAnalytics,
    };
}

function formatEnrollmentWorkspaceKpiValue(n: number, sawLifecycleAnalytics: boolean): string {
    if (!sawLifecycleAnalytics) return "—";
    return String(Math.max(0, Math.floor(n)));
}

/**
 * Org workspace KPI strip — childcare enrollment metrics from lifecycle analytics (no new API).
 */
export function buildWorkspaceRootOrgOpportunityKpis(snapshots: WorkspaceGrowthDeptSnapshot[]): KPIVm[] {
    const roll = aggregateWorkspaceEnrollmentKpiRollup(snapshots);
    const saw = roll.sawLifecycleAnalytics;
    return [
        {
            id: "org_enrollment_active_leads",
            label: "Active Leads",
            value: formatEnrollmentWorkspaceKpiValue(roll.activeLeads, saw),
            lane: "business",
        },
        {
            id: "org_enrollment_scheduled_tours",
            label: "Scheduled Tours",
            value: formatEnrollmentWorkspaceKpiValue(roll.scheduledTours, saw),
            lane: "business",
        },
        {
            id: "org_enrollment_in_motion",
            label: "Enrollment Opportunities",
            value: formatEnrollmentWorkspaceKpiValue(roll.enrollmentOpportunities, saw),
            lane: "business",
        },
        {
            id: "org_enrollment_waitlisted_families",
            label: "Waitlisted Families",
            value: formatEnrollmentWorkspaceKpiValue(roll.waitlistedFamilies, saw),
            lane: "business",
        },
    ];
}

/**
 * Department tile subline — exact pipeline lane total for Growth-slice; otherwise work unit count.
 */
export type WorkspaceWorkUnitRowForTileCount = {
    department_id?: string | null;
    key?: string | null;
    name?: string | null;
    is_active?: boolean | null;
};

/**
 * Workspace department tile work-unit counts — active rows only.
 * Builder-owned lifecycle departments count only `lifecycle_wu_*` (not inactive enrollment_pipeline).
 */
export function accumulateWorkspaceDeptWorkUnitTileStats(
    items: readonly WorkspaceWorkUnitRowForTileCount[]
): WorkspaceRootDeptTileStats {
    const deptTileStats: WorkspaceRootDeptTileStats = {};
    const namesByDept = new Map<string, string[]>();
    const lifecycleCountByDept = new Map<string, number>();
    const deptHasLifecycle = new Set<string>();

    for (const row of items) {
        if (row.is_active === false) continue;
        const did = typeof row.department_id === "string" ? row.department_id.trim() : "";
        if (!did) continue;
        const key = typeof row.key === "string" ? row.key.trim() : "";
        if (isLifecycleStageWorkUnitKey(key)) deptHasLifecycle.add(did);
    }

    for (const row of items) {
        if (row.is_active === false) continue;
        const did = typeof row.department_id === "string" ? row.department_id.trim() : "";
        if (!did) continue;
        const key = typeof row.key === "string" ? row.key.trim() : "";
        const name = typeof row.name === "string" ? row.name.trim() : "";

        if (isLifecycleStageWorkUnitKey(key)) {
            lifecycleCountByDept.set(did, (lifecycleCountByDept.get(did) ?? 0) + 1);
            if (name) {
                const list = namesByDept.get(did) ?? [];
                list.push(name);
                namesByDept.set(did, list);
            }
            continue;
        }
        if (key.toLowerCase() === "needs_attention") continue;
        if (deptHasLifecycle.has(did)) continue;
        const cur = deptTileStats[did]?.workUnitCount ?? 0;
        deptTileStats[did] = { workUnitCount: cur + 1 };
    }

    for (const [did, count] of lifecycleCountByDept) {
        deptTileStats[did] = {
            workUnitCount: count,
            workUnitNames: namesByDept.get(did) ?? [],
        };
    }

    return deptTileStats;
}

export function buildWorkspaceRootDepartmentTileRollupLine(params: {
    departmentKey: string;
    workUnitCount: number;
    pipelineExact: PipelineExactSnapshot;
    workUnitNames?: string[];
}): string | null {
    if (isGrowthSliceDepartmentKey(params.departmentKey) && params.pipelineExact?.total != null) {
        return `${params.pipelineExact.total} in pipeline`;
    }
    const names = (params.workUnitNames ?? []).map((n) => n.trim()).filter(Boolean);
    if (names.length) {
        return `Work units: ${names.join(", ")}`;
    }
    if (params.workUnitCount >= 0) {
        return `${params.workUnitCount} work unit${params.workUnitCount === 1 ? "" : "s"}`;
    }
    return null;
}
