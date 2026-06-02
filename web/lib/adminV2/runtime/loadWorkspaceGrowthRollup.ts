import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";
import { mapWithConcurrency } from "@/lib/workspace/mapWithConcurrency";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import {
    buildWorkspaceRootDepartmentTileRollupLine,
    buildWorkspaceRootOrgOpportunityKpis,
    type DepartmentLifecycleKpisPayload,
    type PipelineExactSnapshot,
    type WorkspaceGrowthDeptSnapshot,
} from "@/lib/workspace/viewModels/workspaceRootRollup";
import type {
    WorkspaceRootDepartmentRow,
    WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";
import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";

/**
 * Per–growth-slice department lifecycle + pipeline fetches (2×N).
 * Intended for idle/deferred execution after workspace quick rollup (Card 5).
 */
export async function loadWorkspaceGrowthRollup(
    departments: WorkspaceRootDepartmentRow[],
    workUnitsRes: Response | null,
    wuJson: { items?: { department_id?: string }[]; error?: string }
): Promise<{
    metrics: WorkspaceRootMetrics;
    deptTileStats: WorkspaceRootDeptTileStats;
    orgOpportunityKpis: KPIVm[];
    growthSnapshots: WorkspaceGrowthDeptSnapshot[];
}> {
    const fetchInit = workspaceDataFetchInit();

    const deptTileStats: WorkspaceRootDeptTileStats = {};
    if (workUnitsRes?.ok && Array.isArray(wuJson.items)) {
        const namesByDept = new Map<string, string[]>();
        const lifecycleCountByDept = new Map<string, number>();
        for (const row of wuJson.items) {
            const did = typeof row.department_id === "string" ? row.department_id : "";
            if (!did) continue;
            const key = typeof (row as { key?: string }).key === "string" ? (row as { key: string }).key : "";
            const name =
                typeof (row as { name?: string }).name === "string"
                    ? (row as { name: string }).name.trim()
                    : "";
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
            const cur = deptTileStats[did]?.workUnitCount ?? 0;
            deptTileStats[did] = { workUnitCount: cur + 1 };
        }
        for (const [did, count] of lifecycleCountByDept) {
            deptTileStats[did] = {
                workUnitCount: count,
                workUnitNames: namesByDept.get(did) ?? [],
            };
        }
    }

    for (const d of departments) {
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        if (!deptTileStats[d.id]) deptTileStats[d.id] = { workUnitCount: wu };
        else deptTileStats[d.id] = { ...deptTileStats[d.id], workUnitCount: wu };
    }

    const growthDepts = departments.filter((d) => isGrowthSliceDepartmentKey(d.key));
    const growthSnapshotsFromFetch = await mapWithConcurrency(growthDepts, 3, async (d): Promise<WorkspaceGrowthDeptSnapshot> => {
        let lifecycleRes: Response | null = null;
        let pipelineRes: Response | null = null;
        try {
            [lifecycleRes, pipelineRes] = await Promise.all([
                dedupeAdminFetch(
                    `/api/admin/departments/${encodeURIComponent(d.id)}/opportunity-lifecycle-kpis`,
                    fetchInit
                ),
                dedupeAdminFetch(
                    `/api/admin/departments/${encodeURIComponent(d.id)}/pipeline-exact-count`,
                    fetchInit
                ),
            ]);
        } catch {
            return { id: d.id, key: d.key, pipelineExact: null, lifecycleAnalytics: null };
        }
        const lifecycleJson = (await (lifecycleRes?.json().catch(() => ({})) ?? Promise.resolve({}))) as DepartmentLifecycleKpisPayload;
        const pipelineJson = (await (pipelineRes?.json().catch(() => ({})) ?? Promise.resolve({}))) as {
            work_unit_id?: string | null;
            queue_key?: string | null;
            total?: number | null;
            code?: string;
        };
        const lifecycleAnalytics = lifecycleRes?.ok && lifecycleJson.counts ? lifecycleJson : null;
        let pipelineExact: PipelineExactSnapshot = null;
        if (pipelineRes?.ok) {
            if (
                typeof pipelineJson.work_unit_id === "string" &&
                String(pipelineJson.work_unit_id).trim() &&
                typeof pipelineJson.total === "number" &&
                Number.isFinite(pipelineJson.total)
            ) {
                pipelineExact = {
                    work_unit_id: pipelineJson.work_unit_id,
                    queue_key: typeof pipelineJson.queue_key === "string" ? pipelineJson.queue_key : null,
                    total: pipelineJson.total,
                };
            } else {
                pipelineExact = null;
            }
        }
        if (typeof window !== "undefined") {
            console.warn("[pipeline-count-unify]", {
                source: "workspace",
                department_id: d.id,
                work_unit_id: pipelineExact?.work_unit_id ?? null,
                queue_key: pipelineExact?.queue_key ?? null,
                count: pipelineExact?.total ?? null,
            });
        }
        return { id: d.id, key: d.key, pipelineExact, lifecycleAnalytics };
    });
    const growthSnapshots: WorkspaceGrowthDeptSnapshot[] = growthSnapshotsFromFetch;

    const pipelineByDeptId = new Map(growthSnapshots.map((s) => [s.id, s]));

    for (const d of departments) {
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        const growthSnap = isGrowthSliceDepartmentKey(d.key) ? pipelineByDeptId.get(d.id) : undefined;
        deptTileStats[d.id] = {
            workUnitCount: wu,
            workUnitNames: deptTileStats[d.id]?.workUnitNames,
            opportunityRollupLine: buildWorkspaceRootDepartmentTileRollupLine({
                departmentKey: d.key,
                workUnitCount: wu,
                pipelineExact: growthSnap?.pipelineExact ?? null,
                workUnitNames: deptTileStats[d.id]?.workUnitNames,
            }),
        };
    }

    const orgOpportunityKpis = buildWorkspaceRootOrgOpportunityKpis(growthSnapshots);

    const metrics: WorkspaceRootMetrics = {
        departments: null,
        workUnits: workUnitsRes?.ok && Array.isArray(wuJson.items) ? wuJson.items.length : null,
    };

    return { metrics, deptTileStats, orgOpportunityKpis, growthSnapshots };
}
