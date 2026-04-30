import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    buildWorkspaceRootOrgOpportunityKpis,
    type DepartmentLifecycleKpisPayload,
} from "@/lib/workspace/viewModels/workspaceRootRollup";

function formatInt(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}

/** Baseline org workspace strip — matches pre-config `WorkspaceRootShell` merge order. */
export function buildDefaultWorkspaceKpis(
    metrics: WorkspaceRootMetrics | null,
    growthSnapshots: Array<{ departmentKey: string; kpis: DepartmentLifecycleKpisPayload | null }>
): KPIVm[] {
    const structure: KPIVm[] = [
        { id: "depts", label: "Departments", value: formatInt(metrics?.departments), lane: "business" },
        { id: "wu", label: "Work units", value: formatInt(metrics?.workUnits), lane: "business" },
    ];
    const roll = buildWorkspaceRootOrgOpportunityKpis(growthSnapshots);
    return [...structure, ...roll];
}

export type DeptWorkUnitRow = { id: string; name: string | null; key: string | null };

/** Baseline department bridge strip — matches `AdminV2WorkspaceDepartmentPage` KPI useMemo. */
export function buildDefaultDepartmentKpis(params: {
    deptWorkUnits: DeptWorkUnitRow[];
    deptWorkUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    deptQueueSummariesLoading: boolean;
    deptQueueSummariesError: string | null;
}): KPIVm[] {
    const list = params.deptWorkUnits;
    if (!list.length) return [];
    return list.map((wu) => {
        const summary = params.deptWorkUnitSummaries[wu.id];
        const value =
            params.deptQueueSummariesLoading || params.deptQueueSummariesError
                ? "—"
                : summary
                  ? String(summary.total)
                  : "—";
        const key = (wu.key ?? "").trim().toLowerCase();
        const label =
            key === "enrollment_pipeline" || key === "pipeline_overview" ? "Active inquiries" : wu.name?.trim() || "Work unit";
        return { id: `wu_${wu.id}`, label, value, lane: "business" as const };
    });
}
