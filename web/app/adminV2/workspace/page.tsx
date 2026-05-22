"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { WorkspaceRootShell, type WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    type WorkspaceRootDepartmentRow,
    type WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";
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
import { WorkspaceRootColdShell } from "@/components/admin/workspace/WorkspaceRootColdShell";
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
        const hit = readWorkspaceRootCache(orgId, principalUserId, accessScopeFingerprint);
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
    }, [orgId, principalUserId, accessScopeFingerprint]);

    useEffect(() => {
        /** Network revalidation always runs — only show full skeleton when nothing was seeded from cache. */
        const cachedShellPrimed = hydratedCacheRef.current;
        if (!cachedShellPrimed) {
            setLoading(true);
            setWorkspaceRollupRefined(false);
        }
        setError(null);

        let applyResults = true;
        let cancelGrowthRollupDefer: () => void = () => undefined;
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
                        /** Silent revalidate — keep KPI cells stable until refined rollup + placements finish. */
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
            cancelGrowthRollupDefer();
        };
    }, [orgId, principalUserId, accessScopeFingerprint]);

    const metricsResolved = useMemo(() => {
        if (!metrics) return null;
        return {
            ...metrics,
            departments: departments.length,
        };
    }, [metrics, departments.length]);

    if (loading) {
        return <WorkspaceRootColdShell />;
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
