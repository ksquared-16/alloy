"use client";

import { useCallback, useEffect, useState } from "react";
import { filterJobsNeedsAttention, mergeJobListsById, type JobRowForWorkspaceMetrics } from "@/lib/workspace/deriveDepartmentJobMetrics";

export type DepartmentJobsQueueMode = "unassigned" | "scheduled_today" | "needs_attention";

export type AdminJobListRow = JobRowForWorkspaceMetrics & {
    title?: string | null;
    created_at?: string;
    status_key?: string | null;
    _customer_name?: string | null;
    _status_display?: string | null;
    _job_label?: string | null;
    _price_display?: number | null;
    _location_label?: string | null;
    _vendor_name?: string | null;
    _assigned_vendor_name?: string | null;
    receivable_outstanding_cents?: number | null;
};

export function useDepartmentQueueData(departmentId: string, mode: DepartmentJobsQueueMode) {
    const [jobs, setJobs] = useState<AdminJobListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** Bumps to force reload (e.g. after closing job drawer). */
    const [reloadToken, setReloadToken] = useState(0);

    const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                if (mode === "unassigned") {
                    const jRes = await fetch("/api/admin/jobs?assigned_vendor_unassigned=true&limit=200");
                    const jj = (await jRes.json().catch(() => ({}))) as { jobs?: AdminJobListRow[]; error?: string };
                    if (!jRes.ok) throw new Error(jj.error ?? "Failed to load jobs");
                    if (!cancelled) setJobs(jj.jobs ?? []);
                } else if (mode === "scheduled_today") {
                    const jRes = await fetch("/api/admin/jobs?scheduled_on=today&limit=200");
                    const jj = (await jRes.json().catch(() => ({}))) as { jobs?: AdminJobListRow[]; error?: string };
                    if (!jRes.ok) throw new Error(jj.error ?? "Failed to load jobs");
                    if (!cancelled) setJobs(jj.jobs ?? []);
                } else {
                    const [deptJobsRes, unassignedJobsRes] = await Promise.all([
                        fetch(`/api/admin/jobs?department_id=${encodeURIComponent(departmentId)}&limit=200`),
                        fetch("/api/admin/jobs?unassigned_work_unit=true&limit=200"),
                    ]);
                    const dj = (await deptJobsRes.json().catch(() => ({}))) as {
                        jobs?: AdminJobListRow[];
                        error?: string;
                    };
                    const uj = (await unassignedJobsRes.json().catch(() => ({}))) as {
                        jobs?: AdminJobListRow[];
                        error?: string;
                    };
                    if (!deptJobsRes.ok) throw new Error(dj.error ?? "Department jobs request failed");
                    if (!unassignedJobsRes.ok) throw new Error(uj.error ?? "Unassigned jobs request failed");
                    const merged = mergeJobListsById(dj.jobs ?? [], uj.jobs ?? []);
                    const filtered = filterJobsNeedsAttention(merged);
                    if (!cancelled) setJobs(filtered);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load jobs");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, mode, reloadToken]);

    return { jobs, loading, error, refetch };
}
