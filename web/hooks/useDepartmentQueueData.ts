"use client";

import { useCallback, useEffect, useState } from "react";
import {
    mergeJobListsById,
    type JobRowForWorkspaceMetrics,
} from "@/lib/workspace/deriveDepartmentJobMetrics";
import {
    filterJobsForNeedsAttentionWorkUnit,
    jobMatchesExceptionType,
    type NeedsAttentionExceptionType,
} from "@/lib/workspace/exceptionTypes";

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

/** Enriched row from `GET /api/admin/schedules` (schedule-first lane). */
export type AdminScheduleListRow = {
    id: string;
    job_id: string;
    org_id?: string;
    start_at: string;
    end_at?: string | null;
    timezone?: string | null;
    /** API/DB may return numeric or string. */
    schedule_number?: string | number | null;
    status_key?: string | null;
    canceled_at?: string | null;
    duration_minutes?: number | null;
    _job_title?: string | null;
    _service_key?: string | null;
    _customer_name?: string | null;
    _status_display?: string | null;
    _location_label?: string | null;
    _assigned_vendor_name?: string | null;
};

export function useDepartmentQueueData(
    departmentId: string,
    mode: DepartmentJobsQueueMode,
    options?: { exceptionFilter?: NeedsAttentionExceptionType | null }
) {
    const [jobs, setJobs] = useState<AdminJobListRow[]>([]);
    const [schedules, setSchedules] = useState<AdminScheduleListRow[]>([]);
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
                    if (!cancelled) {
                        setJobs(jj.jobs ?? []);
                        setSchedules([]);
                    }
                } else if (mode === "scheduled_today") {
                    const sRes = await fetch("/api/admin/schedules?scheduled_on=today&limit=200");
                    const sj = (await sRes.json().catch(() => ({}))) as {
                        schedules?: AdminScheduleListRow[];
                        error?: string;
                    };
                    if (!sRes.ok) throw new Error(sj.error ?? "Failed to load schedules");
                    if (!cancelled) {
                        setSchedules(sj.schedules ?? []);
                        setJobs([]);
                    }
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
                    const nowMs = Date.now();
                    const ex = options?.exceptionFilter ?? null;
                    const filtered = ex
                        ? merged.filter((j) => jobMatchesExceptionType(j, ex, nowMs))
                        : filterJobsForNeedsAttentionWorkUnit(merged, nowMs);
                    if (!cancelled) {
                        setJobs(filtered);
                        setSchedules([]);
                    }
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
    }, [departmentId, mode, reloadToken, options?.exceptionFilter]);

    return { jobs, schedules, loading, error, refetch };
}
