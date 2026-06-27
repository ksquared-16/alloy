"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { WorkspaceRootShell, type WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    type WorkspaceRootDepartmentRow,
    type WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";
import { WorkspacePageLoadingGate } from "@/app/adminV2/components/workspace/WorkspacePageLoadingGate";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import {
    accumulateWorkspaceDeptWorkUnitTileStats,
    buildWorkspaceRootDepartmentTileRollupLine,
} from "@/lib/workspace/viewModels/workspaceRootRollup";
import { resolveKpisForWorkspace } from "@/lib/kpi/resolver";
import {
    buildOipWarmScopeKey,
    getOipWarmSnapshot,
    prefetchOipMetricsWarm,
    subscribeOipWarmCache,
} from "@/lib/metrics/oipWorkspaceWarmCache";
import type { OipMetricStripValues } from "@/lib/kpi/oipBridge";
import {
    appendWorkspaceOipKpis,
    enrichLifecycleCardsWithOipMetrics,
    resolveWorkspaceOipMetricKeys,
    resolvedMetricsToStripValues,
} from "@/lib/kpi/workspaceOipExposure";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { WorkspaceGrowthDeptSnapshot } from "@/lib/workspace/viewModels/workspaceRootRollup";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    bustWorkspaceDepartmentsFetchDedupe,
    dedupeAdminFetch,
    dedupeAdminFetchWithTtl,
} from "@/lib/workspace/workspaceAdminFetchDedupe";
import {
    invalidateAdminV2WorkspaceSessionCache,
    readWorkspaceRootCache,
    writeWorkspaceRootCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import {
    traceWorkspaceRootDepartmentTiles,
    transformWorkspaceApiDepartmentsToTiles,
    type WorkspaceTilePipelineTrace,
} from "@/lib/workspace/workspaceRootTilePipeline";
import { WorkspaceTileDebugPanel } from "@/components/admin/workspace/WorkspaceTileDebugPanel";
import AdminAccessScopeDebugPanel from "@/components/adminV2/settings/lifecycle/AdminAccessScopeDebugPanel";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import { readLifecycleDebugSelection } from "@/lib/lifecycle/lifecycleDebugSelection";
import type { LifecycleDepartmentIdAudit } from "@/lib/lifecycle/lifecycleDepartmentIdAudit";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { loadWorkspaceGrowthRollup } from "@/lib/adminV2/runtime/loadWorkspaceGrowthRollup";
import { perfWorkspaceLoad } from "@/lib/workspace/adminV2WorkspaceSessionCache";
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
import { composeWorkspaceSurfaceViewModel } from "@/lib/adminV2/runtime/surface/workspaceSurfaceViewModel";
import { prefetchVisibleDepartmentAboveFoldBundles } from "@/lib/adminV2/prefetchAdminV2AboveFold";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import { loadOperatorLifecycleLandingCards, invalidateOperatorLifecycleLandingCache } from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { warmDefaultOperatorLifecycleEntries } from "@/lib/admin/operatorWorkUnitEntryWarm";
import {
    mergeLifecycleCardsStableOrder,
    peekWorkspaceLifecycleCardsForRestore,
    writeWorkspaceLifecycleCardsCache,
} from "@/lib/workspace/workspaceContinuityPrefetch";
import { peekOperatorLifecycleLandingCards } from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { ResumeWhereYouLeftOffChip } from "@/components/admin/workspace/ResumeWhereYouLeftOffChip";
import { useAlloyOsRuntimeMarkOnce } from "@/lib/perf/useAlloyOsRuntimeMark";

/** First paint: work-unit counts + rollup lines without per-dept growth KPI / pipeline calls. */
function buildWorkspaceQuickRollup(
    departments: WorkspaceRootDepartmentRow[],
    workUnitsRes: Response | null,
    wuJson: { items?: { department_id?: string }[]; error?: string }
): { metrics: WorkspaceRootMetrics; deptTileStats: WorkspaceRootDeptTileStats } {
    const deptTileStats: WorkspaceRootDeptTileStats =
        workUnitsRes?.ok && Array.isArray(wuJson.items)
            ? accumulateWorkspaceDeptWorkUnitTileStats(wuJson.items)
            : {};

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
 * Operator workspace landing — lifecycle-first entry (/workspace).
 * Department fetches may still run for KPI background rollup; tiles are lifecycle catalog driven.
 */
export default function AdminV2WorkspaceIndexPage() {
    const { orgName: orgNameFromContext, orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;
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
    const [workspacePlacementRows, setWorkspacePlacementRows] = useState<WorkspaceKpiPlacementRow[]>([]);
    const [workspaceScopeHasPlacements, setWorkspaceScopeHasPlacements] = useState(false);
    const [workspaceGrowthSnapshots, setWorkspaceGrowthSnapshots] = useState<WorkspaceGrowthDeptSnapshot[]>([]);
    const [oipMetricValues, setOipMetricValues] = useState<OipMetricStripValues | undefined>(undefined);
    const [oipResolved, setOipResolved] = useState<ResolvedMetricMap>({});
    const [oipFetchPending, setOipFetchPending] = useState(false);
    const [workspaceRollupRefined, setWorkspaceRollupRefined] = useState(false);
    const [fetchSettledEmpty, setFetchSettledEmpty] = useState(false);
    const [deptRefreshNonce, setDeptRefreshNonce] = useState(0);
    const [tilePipelineTrace, setTilePipelineTrace] = useState<WorkspaceTilePipelineTrace | null>(null);
    const [workspaceIdAudit, setWorkspaceIdAudit] = useState<LifecycleDepartmentIdAudit | null>(null);
    const [lifecycleCards, setLifecycleCards] = useState<OperatorLifecycleLandingCard[]>(() => {
        if (typeof window === "undefined") return [];
        return peekOperatorLifecycleLandingCards() ?? [];
    });
    const [lifecycleCardsPending, setLifecycleCardsPending] = useState(() => {
        if (typeof window === "undefined") return true;
        return !peekOperatorLifecycleLandingCards()?.length;
    });
    const lifecycleCacheHydratedRef = useRef(false);

    useLayoutEffect(() => {
        if (!orgId || lifecycleCacheHydratedRef.current) return;
        const restored = peekWorkspaceLifecycleCardsForRestore({
            orgId,
            principalUserId,
            accessScopeFingerprint,
        });
        if (!restored?.length) return;
        lifecycleCacheHydratedRef.current = true;
        setLifecycleCards(restored);
        setLifecycleCardsPending(false);
    }, [orgId, principalUserId, accessScopeFingerprint]);

    useEffect(() => {
        let cancelled = false;
        const hasRestoredCards = lifecycleCacheHydratedRef.current || Boolean(peekOperatorLifecycleLandingCards()?.length);
        if (!hasRestoredCards) {
            setLifecycleCardsPending(true);
        }
        void loadOperatorLifecycleLandingCards()
            .then((cards) => {
                if (!cancelled) {
                    setLifecycleCards((prev) => mergeLifecycleCardsStableOrder(prev, cards));
                    if (orgId && cards.length) {
                        writeWorkspaceLifecycleCardsCache(
                            { orgId, principalUserId, accessScopeFingerprint },
                            cards,
                        );
                    }
                }
            })
            .finally(() => {
                if (!cancelled) setLifecycleCardsPending(false);
            });
        return () => {
            cancelled = true;
        };
    }, [orgId, principalUserId, accessScopeFingerprint, deptRefreshNonce]);

    useEffect(() => {
        if (lifecycleCardsPending || lifecycleCards.length === 0) return;
        return scheduleAdminV2BackgroundWork(
            () => {
                warmDefaultOperatorLifecycleEntries(lifecycleCards, null);
            },
            { idleTimeoutMs: 1400, fallbackMs: 500 },
        );
    }, [lifecycleCards, lifecycleCardsPending]);

    useEffect(() => {
        resetRouteShellTrace("workspace");
        registerRouteLoadingOwner("workspace", "page");
        markRouteShellVisible("workspace");
        return () => unregisterRouteLoadingOwner("workspace", "page");
    }, []);

    useEffect(() => {
        const onDepartmentsChanged = () => {
            hydratedCacheRef.current = false;
            setWorkspaceCachePrimed(false);
            invalidateAdminV2WorkspaceSessionCache(orgId, principalUserId, accessScopeFingerprint);
            invalidateOperatorLifecycleLandingCache();
            bustWorkspaceDepartmentsFetchDedupe();
            setDeptRefreshNonce((n) => n + 1);
        };
        window.addEventListener("alloy:workspace-departments-changed", onDepartmentsChanged);
        return () => window.removeEventListener("alloy:workspace-departments-changed", onDepartmentsChanged);
    }, [orgId, principalUserId, accessScopeFingerprint]);

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
                const deptFetchInit = { ...fetchInit, cache: "no-store" as RequestCache };
                const placementUrl = "/api/admin/workspace-kpi-placements?surface=workspace";
                const placementP = dedupeAdminFetchWithTtl(
                    placementUrl,
                    { ...(fetchInit ?? {}), cache: "no-store" },
                    8000
                ).catch(() => null as Response | null);
                const [res, wuRes] = await Promise.all([
                    dedupeAdminFetch("/api/admin/departments", deptFetchInit),
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
                const trace = traceWorkspaceRootDepartmentTiles(items);
                const active = transformWorkspaceApiDepartmentsToTiles(items);
                if (!applyResults) return;

                setTilePipelineTrace(trace);
                const debugSel = readLifecycleDebugSelection();
                if (debugSel) {
                    const sel = debugSel.department_id;
                    setWorkspaceIdAudit({
                        selected_department_id: sel,
                        selected_lifecycle_name: debugSel.lifecycle_name,
                        selected_process_id: debugSel.process_id,
                        expected_workspace_tile_name: debugSel.expected_tile_name,
                        sources: {
                            validate_route_department_id: sel,
                            catalog_row_department_id: null,
                            activation_metadata_department_id: sel,
                            view_link_department_id: sel,
                            backing_department_query_id: trace.apiDepartmentIds.includes(sel) ? sel : null,
                        },
                        presence: {
                            in_builder_catalog: false,
                            catalog_id_matches_selected: false,
                            in_backing_department_row: trace.apiDepartmentIds.includes(sel),
                            in_get_workspace_api: trace.apiDepartmentIds.includes(sel),
                            in_workspace_rendered_tiles: trace.renderedTileIds.includes(sel),
                        },
                        workspace_api_department_ids: [...trace.apiDepartmentIds],
                        workspace_rendered_tile_ids: [...trace.renderedTileIds],
                        mismatch_hints: trace.apiDepartmentIds.includes(sel)
                            ? []
                            : [
                                  "not_in_workspace_api: Selected lifecycle department ID is not in this page's GET /api/admin/departments response.",
                              ],
                    });
                } else {
                    setWorkspaceIdAudit(null);
                }
                if (process.env.NODE_ENV === "development") {
                    console.debug("[ws.root] tile pipeline", trace, debugSel);
                }

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
                                    setWorkspaceGrowthSnapshots(growthSnapshotsRef);
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
                                            const placementRows = body.items ?? [];
                                            setWorkspacePlacementRows(placementRows);
                                            setWorkspaceScopeHasPlacements(body.scope_has_placements === true);
                                            placementStrip = resolveKpisForWorkspace({
                                                placementRows,
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
    }, [orgId, principalUserId, accessScopeFingerprint, deptRefreshNonce]);

    const workspaceRevealGate = useMemo(() => {
        const cachePrimed = workspaceCachePrimed;
        const departments_resolved = !loading || cachePrimed;
        const shell_ready = workspaceRevealShellReady({
            bootstrap_loading: loading && !cachePrimed,
            departments_resolved,
            // Warm-return atomic commit: lifecycle landing tiles restore synchronously from the
            // module/session snapshot, so a committed surface reveals immediately without a cold
            // loading-gate flash. Empty (true cold) → falls through to bootstrap readiness.
            surface_snapshot_committed: lifecycleCards.length > 0,
        });
        const department_tiles_ready = workspaceRevealDepartmentTilesReady({
            bootstrap_loading: loading && !cachePrimed,
            has_departments: departments.length > 0,
            fetch_settled_empty: fetchSettledEmpty,
            operator_lifecycle_landing: true,
        });
        const tile_counts_ready = workspaceRevealTileCountsReady({
            has_departments: departments.length > 0,
            quick_rollup_applied: metrics !== null || cachePrimed,
            fetch_settled_empty: fetchSettledEmpty,
            operator_lifecycle_landing: true,
        });
        return computeWorkspaceRevealGate({
            shell_ready,
            department_tiles_ready,
            tile_counts_ready,
            kpi_region_ready: workspaceRevealKpiRegionReady(),
            actions_ready: workspaceRevealActionsReady(),
        });
    }, [loading, departments.length, fetchSettledEmpty, metrics, workspaceCachePrimed, lifecycleCards.length]);

    // Surface ViewModel ownership: /workspace composes ONE above-fold WorkspaceSurfaceViewModel
    // (WS-02 header, WS-03 health, WS-04 pulse, WS-05 tiles, WS-06 tile KPIs, WS-01 resume, WS-07
    // rail) from the existing loader/cache outputs. The VM owns surface readiness; components present
    // its sections. `reveal.canCommit` IS the authoritative reveal gate (`above_fold_ready`) — no
    // second gate is introduced — and KPI/count values patch quietly after commit.
    const workspaceSurfaceVm = useMemo(
        () =>
            composeWorkspaceSurfaceViewModel({
                gate: workspaceRevealGate,
                orgName: orgNameFromContext,
                // WS-03/04/06 always occupy their final snapshot/default slot (KPI snapshot law).
                healthSnapshotAvailable: true,
                operationalPulseSnapshotAvailable: true,
                tileKpiSnapshotAvailable: true,
                processTileCount: lifecycleCards.length,
                resumeAvailable: true,
                rightRailAvailable: true,
                warmFromCache: workspaceCachePrimed,
                warmFromSession: lifecycleCards.length > 0,
            }),
        [workspaceRevealGate, orgNameFromContext, lifecycleCards.length, workspaceCachePrimed],
    );
    const workspaceSurfaceReady = workspaceSurfaceVm.reveal.canCommit;
    const workspaceAboveFoldPageReady = workspaceSurfaceReady;

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

    useEffect(() => {
        if (!workspaceRollupRefined) return;
        const keys = resolveWorkspaceOipMetricKeys(workspacePlacementRows, workspaceScopeHasPlacements);
        if (!keys.length) {
            setOipResolved({});
            setOipMetricValues(undefined);
            setOipFetchPending(false);
            return;
        }
        const scopeKey = buildOipWarmScopeKey({ siteId: selectedSiteId, keys });
        const cached = getOipWarmSnapshot(scopeKey);
        if (cached) {
            setOipResolved(cached);
            setOipMetricValues(resolvedMetricsToStripValues(cached));
            setOipFetchPending(false);
        } else {
            setOipFetchPending(true);
        }

        let cancelled = false;
        void prefetchOipMetricsWarm({ siteId: selectedSiteId, keys })
            .then((data) => {
                if (!cancelled) {
                    setOipResolved(data);
                    setOipMetricValues(resolvedMetricsToStripValues(data));
                }
            })
            .finally(() => {
                if (!cancelled) setOipFetchPending(false);
            });
        return () => {
            cancelled = true;
        };
    }, [workspaceRollupRefined, workspacePlacementRows, workspaceScopeHasPlacements, selectedSiteId]);

    useEffect(() => {
        if (!workspaceRollupRefined) return;
        const keys = resolveWorkspaceOipMetricKeys(workspacePlacementRows, workspaceScopeHasPlacements);
        if (!keys.length) return;
        const scopeKey = buildOipWarmScopeKey({ siteId: selectedSiteId, keys });
        return subscribeOipWarmCache(() => {
            const snap = getOipWarmSnapshot(scopeKey);
            if (snap) {
                setOipResolved(snap);
                setOipMetricValues(resolvedMetricsToStripValues(snap));
                setOipFetchPending(false);
            }
        });
    }, [workspaceRollupRefined, workspacePlacementRows, workspaceScopeHasPlacements, selectedSiteId]);

    const workspaceKpiStripWithOip = useMemo(() => {
        if (!workspaceRollupRefined) return undefined;
        const base = resolveKpisForWorkspace({
            placementRows: workspacePlacementRows,
            scopeHasPlacementRows: workspaceScopeHasPlacements,
            metrics: metricsResolved,
            growthSnapshots: workspaceGrowthSnapshots,
            oipMetricValues,
        }).items;
        return appendWorkspaceOipKpis(base, oipResolved);
    }, [
        workspaceRollupRefined,
        workspacePlacementRows,
        workspaceScopeHasPlacements,
        metricsResolved,
        workspaceGrowthSnapshots,
        oipMetricValues,
        oipResolved,
    ]);

    const lifecycleCardsWithOip = useMemo(
        () => enrichLifecycleCardsWithOipMetrics(lifecycleCards, oipResolved),
        [lifecycleCards, oipResolved]
    );

    useAlloyOsRuntimeMarkOnce("workspace_ready", workspaceAboveFoldPageReady, {
        surface: "workspace_root",
    });

    if (error && !loading && !workspaceCachePrimed) {
        return (
            <div className="max-w-3xl">
                <p className="text-sm text-alloy-ember">{error}</p>
            </div>
        );
    }

    if (!workspaceSurfaceReady) {
        return <WorkspacePageLoadingGate orgName={orgNameFromContext} />;
    }

    return (
        <>
            <ResumeWhereYouLeftOffChip />
            <WorkspaceRootShell
                orgName={orgNameFromContext}
                departments={departments}
                deptTileStats={deptTileStats}
                metrics={metricsResolved}
                metricsLoading={false}
                orgOpportunityKpis={orgOpportunityKpis}
                workspaceKpiStrip={workspaceKpiStripWithOip}
                kpiStripPlaceholder={workspaceKpiPlacementPending || oipFetchPending}
                kpiQuietReserveOnly={workspaceKpiPlacementPending}
                departmentsPending={false}
                deptTileStatsPending={false}
                lifecycleCards={lifecycleCardsWithOip}
                lifecycleCardsPending={lifecycleCardsPending}
                oipResolved={oipResolved}
            />
            {isLifecycleDebugUiEnabled() ? (
                <>
                    <AdminAccessScopeDebugPanel surface="workspace" />
                    <WorkspaceTileDebugPanel
                        trace={tilePipelineTrace}
                        renderedDepartmentsCount={departments.length}
                        reactStateDepartmentIds={departments.map((d) => d.id)}
                        idAudit={workspaceIdAudit}
                    />
                </>
            ) : null}
        </>
    );
}
