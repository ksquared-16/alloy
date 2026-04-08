"use client";

import { useEffect, useState } from "react";
import {
    filterJobsNeedsAttention,
    filterJobsScheduledToday,
    mergeJobListsById,
    type JobRowForWorkspaceMetrics,
} from "@/lib/workspace/deriveDepartmentJobMetrics";

export type DepartmentJobsQueueMode = "unassigned" | "scheduled_today" | "needs_attention";

export type AdminJobListRow = JobRowForWorkspaceMetrics & {
    title?: string | null;
    created_at?: string;
    status_key?: string | null;
    _customer_name?: string | null;
    _status_display?: string | null;
    _job_label?: string | null;
    _price_display?: number | null;
};

export function useDepartmentQueueData(departmentId: string, mode: DepartmentJobsQueueMode) {
    const [jobs, setJobs] = useState<AdminJobListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                if (mode === "unassigned") {
                    const jRes = await fetch("/api/admin/jobs?unassigned_work_unit=true&limit=200");
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
                    const now = new Date();
                    const filtered =
                        mode === "scheduled_today"
                            ? filterJobsScheduledToday(merged, now)
                            : filterJobsNeedsAttention(merged);
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
    }, [departmentId, mode]);

    return { jobs, loading, error };
}
