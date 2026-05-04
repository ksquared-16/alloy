"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { dedupeAdminFetch, dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import {
    perfWorkspaceLoad,
    readWorkspaceRootCache,
    writeWorkspaceRootCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

/** First paint: work-unit counts + rollup lines without per-dept growth KPI / pipeline calls. */
function buildWorkspaceQuickRollup(
    departments: WorkspaceRootDepartmentRow[],
    workUnitsRes: Response | null,
    wuJson: { items?: { department_id?: string }[]; error?: string }
): { metrics: WorkspaceRootMetrics; deptTileStats: WorkspaceRootDeptTileStats } {
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

    for (const d of departments) {
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        deptTileStats[d.id] = {
            workUnitCount: wu,
            opportunityRollupLine: buildWorkspaceRootDepartmentTileRollupLine({
                departmentKey: d.key,
                workUnitCount: wu,
                pipelineExact: null,
            }),
        };
    }

    const metrics: WorkspaceRootMetrics = {
        departments: null,
        workUnits: workUnitsRes?.ok && Array.isArray(wuJson.items) ? wuJson.items.length : null,
    };

    return { metrics, deptTileStats };
}

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
    const { orgName: orgNameFromContext, orgId, principalUserId } = useWorkspaceOrg();
    const hydratedCacheRef = useRef(false);
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
    /** After per-dept rollup finishes — soft opacity lift on department cards (quick → refined stats). */
    const [workspaceRollupRefined, setWorkspaceRollupRefined] = useState(false);

    /** Session cache hydrate before paint — avoids revisit blank shell when SSR showed the route loader momentarily. */
    useLayoutEffect(() => {
        hydratedCacheRef.current = false;
        const hit = readWorkspaceRootCache(orgId, principalUserId);
        if (!hit?.departments?.length) return;
        hydratedCacheRef.current = true;
        setDepartments(hit.departments);
        setDeptTileStats(hit.deptTileStats);
        setMetrics(hit.metrics);
        setOrgOpportunityKpis(hit.orgOpportunityKpis ?? null);
        setWorkspaceKpiStrip(hit.workspaceKpiStrip);
        setWorkspaceKpiPlacementPending(hit.kpiPlacementPending);
        setWorkspaceRollupRefined(hit.rollupRefined);
        setLoading(false);
        setError(null);
        perfWorkspaceLoad({
            phase: "shell_seed",
            ms: 0,
            source: "cache",
            org_id: orgId,
            client_cache_hit: true,
        });
    }, [orgId, principalUserId]);

    useEffect(() => {
        /** Network revalidation always runs — only show full skeleton when nothing was seeded from cache. */
        const cachedShellPrimed = hydratedCacheRef.current;
        if (!cachedShellPrimed) {
            setLoading(true);
            setWorkspaceRollupRefined(false);
        }
        setError(null);

        let applyResults = true;
        void (async () => {
            const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
            const tCritical0 =
                typeof performance !== "undefined" && typeof window !== "undefined" ? performance.now() : 0;
            if (typeof performance !== "undefined" && typeof window !== "undefined") {
                alloyPerfSet("workspace_start", routeStart);
            }
            try {
                const perfDebug =
                    typeof window !== "undefined" &&
                    (window as unknown as { __WS_PERF_DEBUG__?: boolean }).__WS_PERF_DEBUG__ === true;
                const t0 = perfDebug ? performance.now() : 0;

                const fetchInit = workspaceDataFetchInit() ?? {};
                const [res, wuRes] = await Promise.all([
                    dedupeAdminFetch("/api/admin/departments", fetchInit),
                    dedupeAdminFetch("/api/admin/work-units", fetchInit).catch(() => null as Response | null),
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
                if (!applyResults) return;

                if (typeof performance !== "undefined" && typeof window !== "undefined") {
                    perfWorkspaceLoad({
                        phase: "critical_deps",
                        ms: Math.round(performance.now() - tCritical0),
                        source: "network",
                        org_id: orgId,
                    });
                }

                setDepartments(active);

                /** First paint after departments + work units only; growth slice KPIs load in background. */
                if (active.length) {
                    const quick = buildWorkspaceQuickRollup(active, wuRes, wuJson);
                    const seedsFromSession = cachedShellPrimed;
                    setMetrics(quick.metrics);
                    setDeptTileStats(quick.deptTileStats);
                    if (!seedsFromSession) {
                        setOrgOpportunityKpis(null);
                        setWorkspaceKpiStrip(undefined);
                        setWorkspaceKpiPlacementPending(true);
                        setWorkspaceRollupRefined(false);
                        writeWorkspaceRootCache(orgId, principalUserId, {
                            departments: active,
                            deptTileStats: quick.deptTileStats,
                            metrics: quick.metrics,
                            orgOpportunityKpis: null,
                            workspaceKpiStrip: undefined,
                            kpiPlacementPending: true,
                            rollupRefined: false,
                        });
                    } else {
                        /** Silent revalidate — keep KPI cells stable until refined rollup + placements finish. */
                        const preserved = readWorkspaceRootCache(orgId, principalUserId);
                        writeWorkspaceRootCache(orgId, principalUserId, {
                            departments: active,
                            deptTileStats: quick.deptTileStats,
                            metrics: quick.metrics,
                            orgOpportunityKpis: preserved?.orgOpportunityKpis ?? null,
                            workspaceKpiStrip: preserved?.workspaceKpiStrip,
                            kpiPlacementPending: preserved?.kpiPlacementPending ?? false,
                            rollupRefined: preserved?.rollupRefined ?? true,
                        });
                    }
                    void (async () => {
                        try {
                            const rollupResult = await loadWorkspaceRollup(active, wuRes, wuJson);
                            const {
                                metrics: m,
                                deptTileStats: stats,
                                orgOpportunityKpis: roll,
                                growthSnapshots,
                            } = rollupResult;
                            if (!applyResults) return;
                            setMetrics(m);
                            setDeptTileStats(stats);
                            setOrgOpportunityKpis(roll.length ? roll : null);
                            setWorkspaceRollupRefined(true);

                            const growthSnapshotsRef = growthSnapshots;
                            const metricsForPlacement: WorkspaceRootMetrics = {
                                ...m,
                                departments: active.length,
                            };
                            writeWorkspaceRootCache(orgId, principalUserId, {
                                departments: active,
                                deptTileStats: stats,
                                metrics: m,
                                orgOpportunityKpis: roll.length ? roll : null,
                                workspaceKpiStrip: undefined,
                                kpiPlacementPending: true,
                                rollupRefined: true,
                            });
                            if (typeof performance !== "undefined" && typeof window !== "undefined") {
                                perfWorkspaceLoad({
                                    phase: "rollup_refined",
                                    ms: Math.round(performance.now() - tCritical0),
                                    source: "background",
                                    org_id: orgId,
                                });
                            }
                            void (async () => {
                                type PlacementBody = {
                                    items?: WorkspaceKpiPlacementRow[];
                                    scope_has_placements?: boolean;
                                };
                                let placementStrip: KPIVm[] | undefined = undefined;
                                try {
                                    const placementUrl = "/api/admin/workspace-kpi-placements?surface=workspace";
                                    const placementRes = await dedupeAdminFetchWithTtl(
                                        placementUrl,
                                        { ...(workspaceDataFetchInit() ?? {}), cache: "no-store" },
                                        8000
                                    ).catch(() => null as Response | null);
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
                                        writeWorkspaceRootCache(orgId, principalUserId, {
                                            departments: active,
                                            deptTileStats: stats,
                                            metrics: metricsForPlacement,
                                            orgOpportunityKpis: roll.length ? roll : null,
                                            workspaceKpiStrip: placementStrip,
                                            kpiPlacementPending: false,
                                            rollupRefined: true,
                                        });
                                        if (typeof performance !== "undefined" && typeof window !== "undefined") {
                                            perfWorkspaceLoad({
                                                phase: "kpi_placements_ready",
                                                ms: Math.round(performance.now() - tCritical0),
                                                source: "background",
                                                org_id: orgId,
                                            });
                                        }
                                    }
                                }
                            })();
                        } catch {
                            if (!applyResults) return;
                            setOrgOpportunityKpis(null);
                            setWorkspaceKpiStrip(undefined);
                            setWorkspaceKpiPlacementPending(false);
                            setWorkspaceRollupRefined(true);
                        }
                    })();
                } else {
                    setMetrics(null);
                    setDeptTileStats({});
                    setOrgOpportunityKpis(null);
                    setWorkspaceKpiStrip(undefined);
                    setWorkspaceKpiPlacementPending(false);
                    setWorkspaceRollupRefined(true);
                }

                if (typeof performance !== "undefined" && typeof window !== "undefined") {
                    alloyPerfSet("workspace_ready", performance.now());
                }

                if (perfDebug) {
                    const t1 = performance.now();
                    console.debug(`[ws.root] departments+quick rollup ready in ${Math.round(t1 - t0)}ms`, {
                        departments: active.length,
                    });
                }
            } catch (e) {
                if (applyResults) {
                    setError((e as Error).message);
                }
            } finally {
                if (applyResults) setLoading(false);
            }
        })();

        return () => {
            applyResults = false;
        };
    }, [orgId, principalUserId]);

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
            workspaceRollupRefined={workspaceRollupRefined}
        />
    );
}
