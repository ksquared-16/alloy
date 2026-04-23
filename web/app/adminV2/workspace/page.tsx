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
import {
    buildWorkspaceRootDepartmentTileRollupLine,
    buildWorkspaceRootOrgOpportunityKpis,
    type DepartmentLifecycleKpisPayload,
} from "@/lib/workspace/viewModels/workspaceRootRollup";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

async function loadWorkspaceRollup(departments: WorkspaceRootDepartmentRow[]): Promise<{
    metrics: WorkspaceRootMetrics;
    deptTileStats: WorkspaceRootDeptTileStats;
    orgOpportunityKpis: KPIVm[];
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

    return { metrics, deptTileStats, orgOpportunityKpis };
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

                // Cohesive readiness: rollup starts immediately after departments resolve (same async turn).
                if (applyResults && active.length) {
                    setMetricsLoading(true);
                    try {
                        const { metrics: m, deptTileStats: stats, orgOpportunityKpis: roll } =
                            await loadWorkspaceRollup(active);
                        setMetrics(m);
                        setDeptTileStats(stats);
                        setOrgOpportunityKpis(roll.length ? roll : null);
                    } catch {
                        setMetrics(null);
                        setDeptTileStats({});
                        setOrgOpportunityKpis(null);
                    } finally {
                        setMetricsLoading(false);
                    }
                } else if (applyResults) {
                    setMetricsLoading(false);
                    setMetrics(null);
                    setDeptTileStats({});
                    setOrgOpportunityKpis(null);
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

    if (loading || metricsLoading) {
        // Cohesive skeleton: keep the surface intentional until KPI band + tiles are ready.
        return (
            <div data-ws-surface="company" className="adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2">
                <div className="adminv2-ws-dept-v2-contain">
                    <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2" aria-label="Breadcrumb">
                        <span className="text-alloy-midnight/80 font-medium">Workspace</span>
                    </nav>

                    <div className="adminv2-ws-dept-v2-page-split">
                        <div className="adminv2-ws-dept-v2-primary-column">
                            <div className="adminv2-ws-dept-v2-control-deck">
                                <div className="adminv2-ws-dept-v2-top-stack">
                                    <div className="adminv2-ws-dept-v2-brief">
                                        <div className="adminv2-ws-dept-v2-brief-focus-label">Organization workspace</div>
                                        <div className="adminv2-ws-dept-v2-brief-head-row">
                                            <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                                                Loading organization
                                            </h2>
                                        </div>
                                        <div className="mt-3 space-y-2 max-w-3xl" aria-hidden>
                                            <div className="h-3 w-full skeleton-pulse rounded bg-alloy-stone/15" />
                                            <div
                                                className="h-3 w-4/5 skeleton-pulse rounded bg-alloy-stone/15"
                                                style={{ animationDelay: "70ms" }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="adminv2-ws-kpi-root-band" role="status" aria-label="Loading KPIs">
                                    <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--single-band" role="list" aria-hidden>
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--single-band adminv2-ws-kpi-cell--placeholder"
                                            >
                                                <span className="adminv2-ws-kpi-label"> </span>
                                                <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">—</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <section className="mt-4" aria-label="Departments">
                                <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                                    <div className="space-y-2">
                                        <div className="h-3 w-24 skeleton-pulse rounded bg-alloy-stone/15" />
                                        <div
                                            className="h-3 w-72 skeleton-pulse rounded bg-alloy-stone/10"
                                            style={{ animationDelay: "80ms" }}
                                        />
                                    </div>
                                </div>
                                <div className="adminv2-ws-company-v2-main" data-production-workspace-root="true">
                                    <div
                                        className="adminv2-ws-company-v2-dept-grid adminv2-ws-company-v2-dept-grid--workspace-root"
                                        aria-hidden
                                    >
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className="adminv2-ws-company-dept-tile adminv2-ws-company-dept-tile--workspace-root rounded-xl border border-admin-border bg-white/70 p-4"
                                            >
                                                <div className="adminv2-ws-company-dept-tile-head">
                                                    <div className="h-4 w-40 skeleton-pulse rounded bg-alloy-stone/25" />
                                                </div>
                                                <div className="mt-2 space-y-2">
                                                    <div
                                                        className="h-3 w-full skeleton-pulse rounded bg-alloy-stone/15"
                                                        style={{ animationDelay: "40ms" }}
                                                    />
                                                    <div
                                                        className="h-3 w-5/6 skeleton-pulse rounded bg-alloy-stone/15"
                                                        style={{ animationDelay: "90ms" }}
                                                    />
                                                </div>
                                                <div className="mt-4 space-y-2">
                                                    <div
                                                        className="h-3 w-28 skeleton-pulse rounded bg-alloy-stone/15"
                                                        style={{ animationDelay: "120ms" }}
                                                    />
                                                    <div
                                                        className="h-3 w-24 skeleton-pulse rounded bg-alloy-stone/10"
                                                        style={{ animationDelay: "160ms" }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
                            <aside
                                className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
                                data-adminv2-workspace-command-rail
                                aria-label="Workspace orientation"
                            >
                                <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-actions-rail--orientation px-3 pb-3 pt-3">
                                    <div className="h-4 w-28 skeleton-pulse rounded bg-alloy-stone/15" aria-hidden />
                                    <div className="mt-3 space-y-2" aria-hidden>
                                        <div className="h-3 w-full skeleton-pulse rounded bg-alloy-stone/10" />
                                        <div
                                            className="h-3 w-5/6 skeleton-pulse rounded bg-alloy-stone/10"
                                            style={{ animationDelay: "55ms" }}
                                        />
                                        <div
                                            className="h-3 w-2/3 skeleton-pulse rounded bg-alloy-stone/10"
                                            style={{ animationDelay: "110ms" }}
                                        />
                                    </div>
                                    <div className="mt-4 space-y-2" aria-hidden>
                                        <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" />
                                        <div
                                            className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10"
                                            style={{ animationDelay: "80ms" }}
                                        />
                                    </div>
                                </section>
                            </aside>
                        </div>
                    </div>
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
        />
    );
}
