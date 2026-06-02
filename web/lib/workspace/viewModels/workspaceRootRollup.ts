import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import { formatWorkspaceUsdGrouped } from "@/lib/ui-v2/formatWorkspaceCurrency";
import type { OpportunityLifecycleKpiCounts } from "@/lib/workspace/computeOpportunityLifecycleKpis";
import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";

/** JSON shape from GET `/api/admin/departments/:departmentId/opportunity-lifecycle-kpis`. */
export type DepartmentLifecycleKpisPayload = {
    counts?: OpportunityLifecycleKpiCounts;
    values?: { openPipeline?: number; pricedInMotion?: number };
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

/**
 * Org KPI strip — inquiry pipeline counts from exact Queue Service lane; lifecycle only for USD/closed analytics.
 */
export function buildWorkspaceRootOrgOpportunityKpis(snapshots: WorkspaceGrowthDeptSnapshot[]): KPIVm[] {
    let inquiriesInLane = 0;
    let sawInquiries = false;
    let closed = 0;
    let pipeline = 0;
    for (const { key, pipelineExact, lifecycleAnalytics } of snapshots) {
        if (!isGrowthSliceDepartmentKey(key)) continue;
        if (pipelineExact?.total != null) {
            sawInquiries = true;
            inquiriesInLane += Math.max(0, pipelineExact.total);
        }
        const kpis = lifecycleAnalytics;
        if (kpis?.counts) {
            closed += closedCountFromLifecycleCounts(kpis.counts);
            pipeline += Number(kpis.values?.openPipeline ?? 0);
        }
    }
    return [
        {
            id: "org_in_motion",
            label: "Inquiries (pipeline lane)",
            value: sawInquiries ? String(Math.max(0, inquiriesInLane)) : "—",
            lane: "business",
        },
        {
            id: "org_pipeline_value",
            label: "Pipeline value (lifecycle)",
            value: pipeline > 0 ? formatWorkspaceUsdGrouped(pipeline) : "—",
            lane: "business",
        },
        { id: "org_closed", label: "Closed (lifecycle)", value: String(Math.max(0, closed)), lane: "business" },
    ];
}

/**
 * Department tile subline — exact pipeline lane total for Growth-slice; otherwise work unit count.
 */
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
