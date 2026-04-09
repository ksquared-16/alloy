"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { WorkspaceRootShell, type WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    type WorkspaceRootDepartmentRow,
    type WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";

function startEndLocalDay(): { from: string; to: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
}

async function loadWorkspaceRollup(): Promise<{
    metrics: WorkspaceRootMetrics;
    deptTileStats: WorkspaceRootDeptTileStats;
}> {
    const { from, to } = startEndLocalDay();
    const qs = new URLSearchParams({ from, to, limit: "1" });

    const [
        unassignedRes,
        activeJobsRes,
        schedulesRes,
        workUnitsRes,
        jobsSampleRes,
    ] = await Promise.all([
        fetch("/api/admin/jobs?assigned_vendor_unassigned=true&limit=1"),
        fetch("/api/admin/jobs?limit=1"),
        fetch(`/api/admin/schedules?${qs.toString()}`),
        fetch("/api/admin/work-units"),
        fetch("/api/admin/jobs?limit=200"),
    ]);

    const unassignedJson = (await unassignedRes.json().catch(() => ({}))) as { total?: number };
    const activeJson = (await activeJobsRes.json().catch(() => ({}))) as { total?: number };
    const schedJson = (await schedulesRes.json().catch(() => ({}))) as { total?: number };
    const wuJson = (await workUnitsRes.json().catch(() => ({}))) as { items?: { department_id?: string }[]; error?: string };
    const jobsSampleJson = (await jobsSampleRes.json().catch(() => ({}))) as {
        jobs?: { receivable_outstanding_cents?: number | null }[];
        total?: number;
    };

    const unassignedJobs = unassignedRes.ok ? (typeof unassignedJson.total === "number" ? unassignedJson.total : null) : null;
    const activeJobs = activeJobsRes.ok ? (typeof activeJson.total === "number" ? activeJson.total : null) : null;
    const visitsToday = schedulesRes.ok ? (typeof schedJson.total === "number" ? schedJson.total : null) : null;

    const deptTileStats: WorkspaceRootDeptTileStats = {};
    if (workUnitsRes.ok && Array.isArray(wuJson.items)) {
        for (const row of wuJson.items) {
            const did = typeof row.department_id === "string" ? row.department_id : "";
            if (!did) continue;
            const cur = deptTileStats[did]?.workUnitCount ?? 0;
            deptTileStats[did] = { workUnitCount: cur + 1 };
        }
    }

    let unpaidJobsSample: WorkspaceRootMetrics["unpaidJobsSample"] = null;
    if (jobsSampleRes.ok && Array.isArray(jobsSampleJson.jobs)) {
        const jobs = jobsSampleJson.jobs;
        let c = 0;
        for (const j of jobs) {
            const o = j.receivable_outstanding_cents;
            if (typeof o === "number" && o > 0) c += 1;
        }
        const capped = jobs.length >= 200;
        unpaidJobsSample = { count: c, capped };
    }

    const metrics: WorkspaceRootMetrics = {
        unassignedJobs,
        activeJobs,
        visitsToday,
        departments: null,
        workUnits: workUnitsRes.ok && Array.isArray(wuJson.items) ? wuJson.items.length : null,
        unpaidJobsSample,
    };

    return { metrics, deptTileStats };
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
        (async () => {
            setMetricsLoading(true);
            try {
                const { metrics: m, deptTileStats: stats } = await loadWorkspaceRollup();
                if (!cancelled) {
                    setMetrics(m);
                    setDeptTileStats(stats);
                }
            } catch {
                if (!cancelled) {
                    setMetrics(null);
                    setDeptTileStats({});
                }
            } finally {
                if (!cancelled) setMetricsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
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
        />
    );
}
