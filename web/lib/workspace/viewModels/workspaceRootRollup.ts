import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { OpportunityLifecycleKpiCounts } from "@/lib/workspace/computeOpportunityLifecycleKpis";
import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";

/** JSON shape from GET `/api/admin/departments/:id/opportunity-lifecycle-kpis`. */
export type DepartmentLifecycleKpisPayload = {
    counts?: OpportunityLifecycleKpiCounts;
    values?: { openPipeline?: number; pricedInMotion?: number };
    error?: string;
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
 * Org-level orientation KPIs — derived only from lifecycle KPI snapshots (same semantics as /dept).
 * No queue execution lists; no per-row logic.
 */
export function buildWorkspaceRootOrgOpportunityKpis(
    deptSnapshots: Array<{ departmentKey: string; kpis: DepartmentLifecycleKpisPayload | null }>
): KPIVm[] {
    let inMotion = 0;
    let closed = 0;
    let pipeline = 0;
    for (const { departmentKey, kpis } of deptSnapshots) {
        if (!isGrowthSliceDepartmentKey(departmentKey) || !kpis?.counts) continue;
        inMotion += inMotionCountFromLifecycleCounts(kpis.counts);
        closed += closedCountFromLifecycleCounts(kpis.counts);
        pipeline += Number(kpis.values?.openPipeline ?? 0);
    }
    return [
        { id: "org_in_motion", label: "Active pipeline", value: String(Math.max(0, inMotion)), lane: "business" },
        {
            id: "org_pipeline_value",
            label: "Pipeline value",
            value: pipeline > 0 ? `$${Math.round(pipeline)}` : "—",
            lane: "business",
        },
        { id: "org_closed", label: "Closed outcomes", value: String(Math.max(0, closed)), lane: "business" },
    ];
}

/**
 * One orientation line per department tile — opportunity semantics for Growth-slice departments,
 * otherwise structure-only (work unit count).
 */
export function buildWorkspaceRootDepartmentTileRollupLine(params: {
    departmentKey: string;
    workUnitCount: number;
    kpis: DepartmentLifecycleKpisPayload | null;
}): string | null {
    if (isGrowthSliceDepartmentKey(params.departmentKey) && params.kpis?.counts) {
        const motion = inMotionCountFromLifecycleCounts(params.kpis.counts);
        const pipe = params.kpis.values?.openPipeline;
        const pipeLabel = pipe != null && pipe > 0 ? ` · $${Math.round(Number(pipe))} open` : "";
        return `${motion} active in pipeline${pipeLabel}`;
    }
    if (params.workUnitCount >= 0) {
        return `${params.workUnitCount} work unit${params.workUnitCount === 1 ? "" : "s"}`;
    }
    return null;
}
