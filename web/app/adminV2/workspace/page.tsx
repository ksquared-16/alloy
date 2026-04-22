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

const WORKSPACE_ROLLUP_FETCH_MS = 45_000;

function workspaceRollupFetchInit(): RequestInit | undefined {
    const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
    if (typeof timeout === "function") {
        return { signal: timeout(WORKSPACE_ROLLUP_FETCH_MS) };
    }
    return undefined;
}

async function loadWorkspaceRollup(departments: WorkspaceRootDepartmentRow[]): Promise<{
    metrics: WorkspaceRootMetrics;
    deptTileStats: WorkspaceRootDeptTileStats;
    orgOpportunityKpis: KPIVm[];
}> {
    const fetchInit = workspaceRollupFetchInit();
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
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/departments");
                const json = (await res.json().catch(() => ({}))) as {
                    items?: WorkspaceRootDepartmentRow[];
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? "Failed to load departments");
                const items = json.items ?? [];
                const active = items.filter((d) => d.is_active !== false);
                if (!cancelled) setDepartments(active);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (loading) return () => {
            cancelled = true;
        };
        if (departments.length === 0) {
            setMetricsLoading(false);
            setMetrics(null);
            setDeptTileStats({});
            setOrgOpportunityKpis(null);
            return () => {
                cancelled = true;
            };
        }
        (async () => {
            setMetricsLoading(true);
            try {
                const { metrics: m, deptTileStats: stats, orgOpportunityKpis: roll } = await loadWorkspaceRollup(departments);
                if (!cancelled) {
                    setMetrics(m);
                    setDeptTileStats(stats);
                    setOrgOpportunityKpis(roll.length ? roll : null);
                }
            } catch {
                if (!cancelled) {
                    setMetrics(null);
                    setDeptTileStats({});
                    setOrgOpportunityKpis(null);
                }
            } finally {
                if (!cancelled) setMetricsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departments, loading]);

    const metricsResolved = useMemo(() => {
        if (!metrics) return null;
        return {
            ...metrics,
            departments: departments.length,
        };
    }, [metrics, departments.length]);

    if (loading) {
        return <p className="text-sm text-alloy-midnight/60">Loading workspace…</p>;
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
