"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { WorkspaceRootShell, type WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    type WorkspaceRootDepartmentRow,
    type WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";
import { WorkspacePageLoadingGate } from "@/app/adminV2/components/workspace/WorkspacePageLoadingGate";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import { buildWorkspaceRootDepartmentTileRollupLine } from "@/lib/workspace/viewModels/workspaceRootRollup";
import { resolveKpisForWorkspace } from "@/lib/kpi/resolver";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch, dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { loadWorkspaceGrowthRollup } from "@/lib/adminV2/runtime/loadWorkspaceGrowthRollup";
import {
    perfWorkspaceLoad,
    readWorkspaceRootCache,
    writeWorkspaceRootCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import {
    markRouteBootstrapReturned,
    markRouteFirstAboveFoldStable,
    markRouteShellVisible,
    registerRouteLoadingOwner,
    resetRouteShellTrace,
    unregisterRouteLoadingOwner,
} from "@/lib/adminV2/routeShellPipeline";
import {
    computeWorkspaceRevealGate,
    markWorkspaceRevealGatePhases,
    markWorkspaceRevealGateStart,
    resetWorkspaceRevealGatePerf,
    workspaceRevealActionsReady,
    workspaceRevealDepartmentTilesReady,
    workspaceRevealKpiRegionReady,
    workspaceRevealShellReady,
    workspaceRevealTileCountsReady,
} from "@/lib/adminV2/workspaceRevealGate";
import { prefetchVisibleDepartmentAboveFoldBundles } from "@/lib/adminV2/prefetchAdminV2AboveFold";
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

/**
 * Organization workspace — top of hierarchy: workspace → department → work unit → record/drawer.
 * Departments load from GET /api/admin/departments (real org rows; no redirect).
 */
export default function AdminV2WorkspaceIndexPage() {
    const { orgName: orgNameFromContext, orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();
    const hydratedCacheRef = useRef(false);
    const [workspaceCachePrimed, setWorkspaceCachePrimed] = useState(false);
    const [departments, setDepartments] = useState<WorkspaceRootDepartmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<WorkspaceRootMetrics | null>(null);
    const [deptTileStats, setDeptTileStats] = useState<WorkspaceRootDeptTileStats>({});
    const [orgOpportunityKpis, setOrgOpportunityKpis] = useState<KPIVm[] | null>(null);
    const [workspaceKpiStrip, setWorkspaceKpiStrip] = useState<KPIVm[] | undefined>(undefined);
    const [workspaceKpiPlacementPending, setWorkspaceKpiPlacementPending] = useState(false);
    const [workspaceRollupRefined, setWorkspaceRollupRefined] = useState(false);
    const [fetchSettledEmpty, setFetchSettledEmpty] = useState(false);

    useEffect(() => {
        resetRouteShellTrace("workspace");
        registerRouteLoadingOwner("workspace", "page");
        markRouteShellVisible("workspace");
        return () => unregisterRouteLoadingOwner("workspace", "page");
    }, []);

    useLayoutEffect(() => {
        resetWorkspaceRevealGatePerf();
        hydratedCacheRef.current = false;
        setWorkspaceCachePrimed(false);
        setFetchSettledEmpty(false);
        const hit = readWorkspaceRootCache(orgId, principalUserId, accessScopeFingerprint);
        if (!hit?.departments?.length) return;
        hydratedCacheRef.current = true;
        setWorkspaceCachePrimed(true);
        setDepartments(hit.departments);
        setFetchSettledEmpty(false);
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
    }, [orgId, principalUserId, accessScopeFingerprint]);

    useEffect(() => {
        const cachedShellPrimed = hydratedCacheRef.current;
        if (!cachedShellPrimed) {
            setLoading(true);
            setWorkspaceRollupRefined(false);
            setFetchSettledEmpty(false);
        }
        setError(null);

        let applyResults = true;
        let cancelGrowthRollupDefer: () => void = () => undefined;
        markWorkspaceRevealGateStart({ org_id: orgId });

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
                const placementUrl = "/api/admin/workspace-kpi-placements?surface=workspace";
                const placementP = dedupeAdminFetchWithTtl(
                    placementUrl,
                    { ...(fetchInit ?? {}), cache: "no-store" },
                    8000
                ).catch(() => null as Response | null);
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
                setFetchSettledEmpty(active.length === 0);

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
                        writeWorkspaceRootCache(orgId, principalUserId, accessScopeFingerprint, {
                            departments: active,
                            deptTileStats: quick.deptTileStats,
                            metrics: quick.metrics,
                            orgOpportunityKpis: null,
                            workspaceKpiStrip: undefined,
                            kpiPlacementPending: true,
                            rollupRefined: false,
                        });
                    } else {
                        const preserved = readWorkspaceRootCache(orgId, principalUserId, accessScopeFingerprint);
                        writeWorkspaceRootCache(orgId, principalUserId, accessScopeFingerprint, {
                            departments: active,
                            deptTileStats: quick.deptTileStats,
                            metrics: quick.metrics,
                            orgOpportunityKpis: preserved?.orgOpportunityKpis ?? null,
                            workspaceKpiStrip: preserved?.workspaceKpiStrip,
                            kpiPlacementPending: preserved?.kpiPlacementPending ?? false,
                            rollupRefined: preserved?.rollupRefined ?? true,
                        });
                    }
                    cancelGrowthRollupDefer = scheduleAdminV2BackgroundWork(
                        () => {
                            void (async () => {
                                try {
                                    type PlacementBody = {
                                        items?: WorkspaceKpiPlacementRow[];
                                        scope_has_placements?: boolean;
                                    };
                                    const [rollupResult, placementRes] = await Promise.all([
                                        loadWorkspaceGrowthRollup(active, wuRes, wuJson),
                                        placementP,
                                    ]);
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
                                    writeWorkspaceRootCache(orgId, principalUserId, accessScopeFingerprint, {
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

                                    let placementStrip: KPIVm[] | undefined = undefined;
                                    try {
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
                                    }
                                    if (applyResults) {
                                        setWorkspaceKpiStrip(placementStrip);
                                        setWorkspaceKpiPlacementPending(false);
                                        writeWorkspaceRootCache(orgId, principalUserId, accessScopeFingerprint, {
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
                                } catch {
                                    if (!applyResults) return;
                                    setOrgOpportunityKpis(null);
                                    setWorkspaceKpiStrip(undefined);
                                    setWorkspaceKpiPlacementPending(false);
                                    setWorkspaceRollupRefined(true);
                                }
                            })();
                        },
                        { idleTimeoutMs: 2500, fallbackMs: 400 }
                    );
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
                    markRouteBootstrapReturned("workspace", { departments: active.length });
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
                    setFetchSettledEmpty(true);
                }
            } finally {
                if (applyResults) setLoading(false);
            }
        })();

        return () => {
            applyResults = false;
            cancelGrowthRollupDefer();
        };
    }, [orgId, principalUserId, accessScopeFingerprint]);

    const workspaceRevealGate = useMemo(() => {
        const cachePrimed = workspaceCachePrimed;
        const departments_resolved = !loading || cachePrimed;
        const shell_ready = workspaceRevealShellReady({
            bootstrap_loading: loading && !cachePrimed,
            departments_resolved,
        });
        const department_tiles_ready = workspaceRevealDepartmentTilesReady({
            bootstrap_loading: loading && !cachePrimed,
            has_departments: departments.length > 0,
            fetch_settled_empty: fetchSettledEmpty,
        });
        const tile_counts_ready = workspaceRevealTileCountsReady({
            has_departments: departments.length > 0,
            quick_rollup_applied: metrics !== null || cachePrimed,
            fetch_settled_empty: fetchSettledEmpty,
        });
        return computeWorkspaceRevealGate({
            shell_ready,
            department_tiles_ready,
            tile_counts_ready,
            kpi_region_ready: workspaceRevealKpiRegionReady(),
            actions_ready: workspaceRevealActionsReady(),
        });
    }, [loading, departments.length, fetchSettledEmpty, metrics, workspaceCachePrimed]);

    const workspaceAboveFoldPageReady = workspaceRevealGate.above_fold_ready;

    useEffect(() => {
        markWorkspaceRevealGatePhases(workspaceRevealGate, { org_id: orgId });
    }, [workspaceRevealGate, orgId]);

    useEffect(() => {
        if (!workspaceAboveFoldPageReady) return;
        markRouteFirstAboveFoldStable("workspace", { org_id: orgId, source: "reveal_gate" });
    }, [workspaceAboveFoldPageReady, orgId]);

    useEffect(() => {
        if (!workspaceAboveFoldPageReady || !orgId || departments.length === 0) return;
        return scheduleAdminV2BackgroundWork(
            () => {
                prefetchVisibleDepartmentAboveFoldBundles(
                    departments.map((d) => d.id),
                    {
                        orgId,
                        principalUserId,
                        accessScopeFingerprint,
                        selectedSiteId: null,
                    }
                );
            },
            { idleTimeoutMs: 2000, fallbackMs: 400 }
        );
    }, [workspaceAboveFoldPageReady, orgId, departments, principalUserId, accessScopeFingerprint]);

    const metricsResolved = useMemo(() => {
        if (!metrics) return null;
        return {
            ...metrics,
            departments: departments.length,
        };
    }, [metrics, departments.length]);

    if (error && departments.length === 0 && !loading) {
        return (
            <div className="max-w-3xl">
                <p className="text-sm text-alloy-ember">{error}</p>
            </div>
        );
    }

    if (fetchSettledEmpty && !loading && departments.length === 0) {
        return (
            <div className="max-w-3xl space-y-2">
                <p className="text-sm text-alloy-midnight/80">No active departments found for your organization.</p>
                <p className="text-sm text-alloy-midnight/60">
                    Add departments under Organization, then return here.
                </p>
            </div>
        );
    }

    if (!workspaceAboveFoldPageReady) {
        return <WorkspacePageLoadingGate orgName={orgNameFromContext} />;
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
            kpiQuietReserveOnly={workspaceKpiPlacementPending}
            workspaceRollupRefined={workspaceRollupRefined}
            departmentsPending={false}
            deptTileStatsPending={false}
        />
    );
}
