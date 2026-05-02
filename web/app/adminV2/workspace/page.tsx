"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { WorkspaceRootShell, type WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    type WorkspaceRootDepartmentRow,
    type WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";
import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import {
    buildWorkspaceRootDepartmentTileRollupLine,
    buildWorkspaceRootOrgOpportunityKpis,
    type DepartmentLifecycleKpisPayload,
    type PipelineExactSnapshot,
    type WorkspaceGrowthDeptSnapshot,
} from "@/lib/workspace/viewModels/workspaceRootRollup";
import { resolveKpisForWorkspace } from "@/lib/kpi/resolver";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";

async function loadWorkspaceRollup(
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
        for (const row of wuJson.items) {
            const did = typeof row.department_id === "string" ? row.department_id : "";
            if (!did) continue;
            const cur = deptTileStats[did]?.workUnitCount ?? 0;
            deptTileStats[did] = { workUnitCount: cur + 1 };
        }
    }

    for (const d of departments) {
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        if (!deptTileStats[d.id]) deptTileStats[d.id] = { workUnitCount: wu };
        else deptTileStats[d.id] = { ...deptTileStats[d.id], workUnitCount: wu };
    }

    const growthDepts = departments.filter((d) => isGrowthSliceDepartmentKey(d.key));
    const growthSettled = await Promise.allSettled(
        growthDepts.map((d) =>
            (async (): Promise<WorkspaceGrowthDeptSnapshot> => {
                let lifecycleRes: Response | null = null;
                let pipelineRes: Response | null = null;
                try {
                    [lifecycleRes, pipelineRes] = await Promise.all([
                        fetch(`/api/admin/departments/${encodeURIComponent(d.id)}/opportunity-lifecycle-kpis`, fetchInit),
                        fetch(`/api/admin/departments/${encodeURIComponent(d.id)}/pipeline-exact-count`, fetchInit),
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
            })()
        )
    );
    const growthSnapshots: WorkspaceGrowthDeptSnapshot[] = growthDepts.map((d, i) => {
        const s = growthSettled[i];
        if (s?.status === "fulfilled") return s.value;
        return { id: d.id, key: d.key, pipelineExact: null, lifecycleAnalytics: null };
    });

    const pipelineByDeptId = new Map(growthSnapshots.map((s) => [s.id, s]));

    for (const d of departments) {
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        const growthSnap = isGrowthSliceDepartmentKey(d.key) ? pipelineByDeptId.get(d.id) : undefined;
        deptTileStats[d.id] = {
            workUnitCount: wu,
            opportunityRollupLine: buildWorkspaceRootDepartmentTileRollupLine({
                departmentKey: d.key,
                workUnitCount: wu,
                pipelineExact: growthSnap?.pipelineExact ?? null,
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

/**
 * Organization workspace — top of hierarchy: workspace → department → work unit → record/drawer.
 * Departments load from GET /api/admin/departments (real org rows; no redirect).
 */
export default function AdminV2WorkspaceIndexPage() {
    const { orgName: orgNameFromContext } = useWorkspaceOrg();
    const [departments, setDepartments] = useState<WorkspaceRootDepartmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<WorkspaceRootMetrics | null>(null);
    const [deptTileStats, setDeptTileStats] = useState<WorkspaceRootDeptTileStats>({});
    const [orgOpportunityKpis, setOrgOpportunityKpis] = useState<KPIVm[] | null>(null);
    /** `undefined` = use shell legacy merge; otherwise full strip from placement resolver (after successful placement fetch). */
    const [workspaceKpiStrip, setWorkspaceKpiStrip] = useState<KPIVm[] | undefined>(undefined);
    /** KPI placements load after first paint — skeleton until settled (no baseline→placement number swap). */
    const [workspaceKpiPlacementPending, setWorkspaceKpiPlacementPending] = useState(false);

    useEffect(() => {
        /** Synchronous: avoids a Strict Mode window where `loading` is still default `true` but the async body has not run yet (same class of bug as deferred `setLoading(true)`). */
        setLoading(true);
        setError(null);

        const ac = new AbortController();
        /** Hard cap so a hung `/api/admin/departments` cannot block the UI forever when `AbortSignal.timeout` is unavailable. */
        const hardStopMs = 50_000;
        const hardStop = setTimeout(() => ac.abort(), hardStopMs);
        let applyResults = true;

        void (async () => {
            const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
            try {
                const perfDebug =
                    typeof window !== "undefined" &&
                    (window as unknown as { __WS_PERF_DEBUG__?: boolean }).__WS_PERF_DEBUG__ === true;
                const t0 = perfDebug ? performance.now() : 0;

                const fetchInit = workspaceDataFetchInit();
                const [res, wuRes] = await Promise.all([
                    fetch("/api/admin/departments", { signal: ac.signal }),
                    fetch("/api/admin/work-units", { ...(fetchInit ?? {}), signal: ac.signal }).catch(() => null as Response | null),
                ]);
                const json = (await res.json().catch(() => ({}))) as {
                    items?: WorkspaceRootDepartmentRow[];
                    error?: string;
                };
                const wuJson = (await (wuRes?.json().catch(() => ({})) ?? Promise.resolve({}))) as {
                    items?: { department_id?: string }[];
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? "Failed to load departments");
                const items = json.items ?? [];
                const active = items.filter((d) => d.is_active !== false);
                if (applyResults) {
                    setDepartments(active);
                }

                /** Blocking: departments + work-units + pipeline-exact rollup only (placements deferred). */
                if (applyResults && active.length) {
                    setMetrics({ departments: null, workUnits: null });
                    setDeptTileStats({});
                    setOrgOpportunityKpis(null);
                    setWorkspaceKpiStrip(undefined);
                    setWorkspaceKpiPlacementPending(true);
                    try {
                        const rollupResult = await loadWorkspaceRollup(active, wuRes, wuJson);
                        const { metrics: m, deptTileStats: stats, orgOpportunityKpis: roll, growthSnapshots } =
                            rollupResult;
                        if (!applyResults) return;
                        setMetrics(m);
                        setDeptTileStats(stats);
                        setOrgOpportunityKpis(roll.length ? roll : null);

                        const growthSnapshotsRef = growthSnapshots;
                        const metricsForPlacement: WorkspaceRootMetrics = {
                            ...m,
                            departments: active.length,
                        };
                        void (async () => {
                            const tPlace0 = typeof performance !== "undefined" ? performance.now() : 0;
                            type PlacementBody = {
                                items?: WorkspaceKpiPlacementRow[];
                                scope_has_placements?: boolean;
                            };
                            let placementStrip: KPIVm[] | undefined = undefined;
                            try {
                                const placementRes = await fetch("/api/admin/workspace-kpi-placements?surface=workspace", {
                                    ...(workspaceDataFetchInit() ?? {}),
                                    cache: "no-store",
                                }).catch(() => null as Response | null);
                                if (placementRes?.ok) {
                                    const body = (await placementRes.json().catch(() => ({}))) as PlacementBody;
                                    placementStrip = resolveKpisForWorkspace({
                                        placementRows: body.items ?? [],
                                        scopeHasPlacementRows: body.scope_has_placements === true,
                                        metrics: metricsForPlacement,
                                        growthSnapshots: growthSnapshotsRef,
                                    }).items;
                                }
                            } catch {
                                placementStrip = undefined;
                            } finally {
                                if (applyResults) {
                                    setWorkspaceKpiStrip(placementStrip);
                                    setWorkspaceKpiPlacementPending(false);
                                }
                                if (typeof performance !== "undefined" && typeof window !== "undefined") {
                                    console.log("[page-timing]", {
                                        route: "workspace",
                                        phase: "kpi_placement",
                                        duration_ms: Math.round(performance.now() - tPlace0),
                                    });
                                }
                            }
                        })();
                    } catch {
                        if (!applyResults) return;
                        setMetrics(null);
                        setDeptTileStats({});
                        setOrgOpportunityKpis(null);
                        setWorkspaceKpiStrip(undefined);
                        setWorkspaceKpiPlacementPending(false);
                    }
                } else if (applyResults) {
                    setMetrics(null);
                    setDeptTileStats({});
                    setOrgOpportunityKpis(null);
                    setWorkspaceKpiStrip(undefined);
                    setWorkspaceKpiPlacementPending(false);
                }

                if (typeof performance !== "undefined" && typeof window !== "undefined") {
                    console.log("[page-timing]", {
                        route: "workspace",
                        phase: "first_paint",
                        duration_ms: Math.round(performance.now() - routeStart),
                    });
                }

                if (perfDebug) {
                    const t1 = performance.now();
                    console.debug(`[ws.root] departments+rollup ready in ${Math.round(t1 - t0)}ms`, {
                        departments: active.length,
                    });
                }
            } catch (e) {
                const aborted =
                    (e instanceof DOMException && e.name === "AbortError") ||
                    (e instanceof Error && e.name === "AbortError");
                if (aborted) {
                    if (applyResults) {
                        setError(
                            "Loading departments timed out or was interrupted. Check your connection and try again."
                        );
                    }
                } else if (applyResults) {
                    setError((e as Error).message);
                }
            } finally {
                clearTimeout(hardStop);
                if (applyResults) setLoading(false);
            }
        })();

        return () => {
            applyResults = false;
            clearTimeout(hardStop);
            ac.abort();
        };
    }, []);

    const metricsResolved = useMemo(() => {
        if (!metrics) return null;
        return {
            ...metrics,
            departments: departments.length,
        };
    }, [metrics, departments.length]);

    if (loading) {
        return (
            <div data-ws-surface="company" className="adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2">
                <div className="adminv2-ws-dept-v2-contain">
                    <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2" aria-label="Breadcrumb">
                        <span className="text-alloy-midnight/80 font-medium">Workspace</span>
                    </nav>
                    <AdminV2RouteLoadingState variant="workspace" showRibbon={false} />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl">
                <p className="text-sm text-alloy-ember">{error}</p>
            </div>
        );
    }

    if (departments.length === 0) {
        return (
            <div className="max-w-3xl space-y-2">
                <p className="text-sm text-alloy-midnight/80">No active departments found for your organization.</p>
                <p className="text-sm text-alloy-midnight/60">
                    Add departments under Organization, then return here.
                </p>
            </div>
        );
    }

    return (
        <WorkspaceRootShell
            orgName={orgNameFromContext}
            departments={departments}
            deptTileStats={deptTileStats}
            metrics={metricsResolved}
            metricsLoading={false}
            orgOpportunityKpis={orgOpportunityKpis}
            workspaceKpiStrip={workspaceKpiStrip}
            kpiStripPlaceholder={workspaceKpiPlacementPending}
        />
    );
}
