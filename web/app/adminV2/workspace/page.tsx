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
} from "@/lib/workspace/viewModels/workspaceRootRollup";
import { resolveKpisForWorkspace } from "@/lib/kpi/resolver";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";

async function loadWorkspaceRollup(departments: WorkspaceRootDepartmentRow[]): Promise<{
    metrics: WorkspaceRootMetrics;
    deptTileStats: WorkspaceRootDeptTileStats;
    orgOpportunityKpis: KPIVm[];
    growthSnapshots: Array<{ id: string; key: string; payload: DepartmentLifecycleKpisPayload | null }>;
}> {
    const fetchInit = workspaceDataFetchInit();
    let workUnitsRes: Response | null = null;
    try {
        workUnitsRes = await fetch("/api/admin/work-units", fetchInit);
    } catch {
        workUnitsRes = null;
    }
    const wuJson = (await (workUnitsRes?.json().catch(() => ({})) ?? Promise.resolve({}))) as {
        items?: { department_id?: string }[];
        error?: string;
    };

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
            (async () => {
                let res: Response | null = null;
                try {
                    res = await fetch(
                        `/api/admin/departments/${encodeURIComponent(d.id)}/opportunity-lifecycle-kpis`,
                        fetchInit
                    );
                } catch {
                    return { id: d.id, key: d.key, payload: null as DepartmentLifecycleKpisPayload | null };
                }
                const json = (await (res?.json().catch(() => ({})) ?? Promise.resolve({}))) as DepartmentLifecycleKpisPayload;
                return { id: d.id, key: d.key, payload: res.ok && json.counts ? json : null };
            })()
        )
    );
    const growthSnapshots = growthDepts.map((d, i) => {
        const s = growthSettled[i];
        if (s?.status === "fulfilled") return s.value;
        return { id: d.id, key: d.key, payload: null };
    });

    const kpisByDeptId = new Map(growthSnapshots.map((s) => [s.id, s.payload]));

    for (const d of departments) {
        const wu = deptTileStats[d.id]?.workUnitCount ?? 0;
        const payload = kpisByDeptId.get(d.id) ?? null;
        deptTileStats[d.id] = {
            workUnitCount: wu,
            opportunityRollupLine: buildWorkspaceRootDepartmentTileRollupLine({
                departmentKey: d.key,
                workUnitCount: wu,
                kpis: payload,
            }),
        };
    }

    const orgOpportunityKpis = buildWorkspaceRootOrgOpportunityKpis(
        growthSnapshots.map((s) => ({ departmentKey: s.key, kpis: s.payload }))
    );

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
    const [metricsLoading, setMetricsLoading] = useState(true);

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
            try {
                const perfDebug =
                    typeof window !== "undefined" &&
                    (window as unknown as { __WS_PERF_DEBUG__?: boolean }).__WS_PERF_DEBUG__ === true;
                const t0 = perfDebug ? performance.now() : 0;

                const res = await fetch("/api/admin/departments", { signal: ac.signal });
                const json = (await res.json().catch(() => ({}))) as {
                    items?: WorkspaceRootDepartmentRow[];
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? "Failed to load departments");
                const items = json.items ?? [];
                const active = items.filter((d) => d.is_active !== false);
                if (applyResults) {
                    setDepartments(active);
                }

                // Rollup runs after departments resolve without blocking first paint of the shell.
                if (applyResults && active.length) {
                    setMetrics({ departments: null, workUnits: null });
                    setDeptTileStats({});
                    setOrgOpportunityKpis(null);
                    setWorkspaceKpiStrip(undefined);
                    setMetricsLoading(true);
                    void (async () => {
                        try {
                            const fetchInit = workspaceDataFetchInit();
                            type PlacementBody = {
                                items?: WorkspaceKpiPlacementRow[];
                                scope_has_placements?: boolean;
                            };
                            const [rollupResult, placementRes] = await Promise.all([
                                loadWorkspaceRollup(active),
                                fetch("/api/admin/workspace-kpi-placements?surface=workspace", {
                                    ...(fetchInit ?? {}),
                                    cache: "no-store",
                                }).catch(() => null as Response | null),
                            ]);
                            const { metrics: m, deptTileStats: stats, orgOpportunityKpis: roll, growthSnapshots } =
                                rollupResult;

                            let placementStrip: KPIVm[] | undefined = undefined;
                            try {
                                if (placementRes?.ok) {
                                    const body = (await placementRes.json().catch(() => ({}))) as PlacementBody;
                                    const metricsForResolve: WorkspaceRootMetrics = {
                                        ...m,
                                        departments: active.length,
                                    };
                                    placementStrip = resolveKpisForWorkspace({
                                        placementRows: body.items ?? [],
                                        scopeHasPlacementRows: body.scope_has_placements === true,
                                        metrics: metricsForResolve,
                                        growthSnapshots: growthSnapshots.map((s) => ({
                                            departmentKey: s.key,
                                            kpis: s.payload,
                                        })),
                                    }).items;
                                }
                            } catch {
                                placementStrip = undefined;
                            }
                            if (!applyResults) return;
                            setMetrics(m);
                            setDeptTileStats(stats);
                            setOrgOpportunityKpis(roll.length ? roll : null);
                            setWorkspaceKpiStrip(placementStrip);
                        } catch {
                            if (!applyResults) return;
                            setMetrics(null);
                            setDeptTileStats({});
                            setOrgOpportunityKpis(null);
                            setWorkspaceKpiStrip(undefined);
                        } finally {
                            if (applyResults) setMetricsLoading(false);
                        }
                    })();
                } else if (applyResults) {
                    setMetricsLoading(false);
                    setMetrics(null);
                    setDeptTileStats({});
                    setOrgOpportunityKpis(null);
                    setWorkspaceKpiStrip(undefined);
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

    // Rollup is now driven by the initial load effect to avoid staggered readiness waves.

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
                    <AdminV2RouteLoadingState variant="workspace" />
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
            metricsLoading={metricsLoading}
            orgOpportunityKpis={orgOpportunityKpis}
            workspaceKpiStrip={workspaceKpiStrip}
        />
    );
}
