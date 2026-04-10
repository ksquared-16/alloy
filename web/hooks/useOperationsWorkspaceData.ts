"use client";

import { useEffect, useMemo, useState } from "react";
import {
    computeAttentionCategoryRuntime,
    computeOperationsSignalCounts,
    mergeJobListsById,
    type JobRowForWorkspaceMetrics,
} from "@/lib/workspace/deriveDepartmentJobMetrics";
import type { WorkspaceAttentionCategoryKey, WorkspaceRuntimeData } from "@/lib/workspace/types";

type Dept = { id: string; name: string | null; key?: string | null };
type WU = { id: string; name: string | null; department_id: string; key?: string | null };

export function useOperationsWorkspaceData(departmentId: string) {
    const [loading, setLoading] = useState(true);
    const [dept, setDept] = useState<Dept | null>(null);
    const [workUnits, setWorkUnits] = useState<WU[]>([]);
    const [unassignedTotal, setUnassignedTotal] = useState<number | null>(null);
    const [derivedError, setDerivedError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [scheduledTodayCount, setScheduledTodayCount] = useState<number | null>(null);
    const [needsAttentionCount, setNeedsAttentionCount] = useState<number | null>(null);
    const [highTouchCount, setHighTouchCount] = useState<number | null>(null);
    const [attention, setAttention] = useState<
        Partial<Record<WorkspaceAttentionCategoryKey, { count: number; previews: { id: string; label: string }[] }>>
    >({});

    const title = useMemo(() => dept?.name?.trim() || "Department", [dept]);

    const runtime: WorkspaceRuntimeData = useMemo(
        () => ({
            metrics: {
                "jobs.unassigned_count": unassignedTotal,
                "schedules.scheduled_today_count": scheduledTodayCount,
                "jobs.needs_attention_count": needsAttentionCount,
                "jobs.high_value_attention_count": highTouchCount,
            },
            workUnits,
            attention,
        }),
        [unassignedTotal, scheduledTodayCount, needsAttentionCount, highTouchCount, workUnits, attention]
    );

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setDerivedError(null);
                const [dRes, wRes, uRes, stRes, deptJobsRes, unassignedJobsRes] = await Promise.all([
                    fetch("/api/admin/departments"),
                    fetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`),
                    fetch("/api/admin/jobs?assigned_vendor_unassigned=true&limit=1"),
                    fetch("/api/admin/schedules?scheduled_on=today&limit=1"),
                    fetch(`/api/admin/jobs?department_id=${encodeURIComponent(departmentId)}&limit=200`),
                    fetch("/api/admin/jobs?assigned_vendor_unassigned=true&limit=200"),
                ]);
                const dj = (await dRes.json().catch(() => ({}))) as { items?: Dept[]; error?: string };
                const wj = (await wRes.json().catch(() => ({}))) as { items?: WU[]; error?: string };
                const uj = (await uRes.json().catch(() => ({}))) as { total?: number; error?: string };
                const stj = (await stRes.json().catch(() => ({}))) as { total?: number; schedules?: unknown[]; error?: string };
                const djJobs = (await deptJobsRes.json().catch(() => ({}))) as {
                    jobs?: JobRowForWorkspaceMetrics[];
                    error?: string;
                };
                const ujJobs = (await unassignedJobsRes.json().catch(() => ({}))) as {
                    jobs?: JobRowForWorkspaceMetrics[];
                    error?: string;
                };

                if (!dRes.ok) throw new Error(dj.error ?? "Departments request failed");
                if (!wRes.ok) throw new Error(wj.error ?? "Work units request failed");
                if (uRes.ok && typeof uj.total === "number" && !cancelled) setUnassignedTotal(uj.total);
                else if (!uRes.ok) setUnassignedTotal(null);
                if (stRes.ok && typeof stj.total === "number" && !cancelled) setScheduledTodayCount(stj.total);
                else if (!stRes.ok) setScheduledTodayCount(null);

                let mergeErr: string | null = null;
                const deptRows = deptJobsRes.ok ? (djJobs.jobs ?? []) : [];
                if (!deptJobsRes.ok) mergeErr = djJobs.error ?? "Department jobs unavailable";
                const unRows = unassignedJobsRes.ok ? (ujJobs.jobs ?? []) : [];
                if (!unassignedJobsRes.ok) mergeErr = mergeErr ?? (ujJobs.error ?? "Unassigned jobs unavailable");
                if (!cancelled) setDerivedError(mergeErr);

                const mergedRows = mergeJobListsById(deptRows, unRows);
                const now = new Date();
                const counts = computeOperationsSignalCounts(mergedRows, now);
                const att = computeAttentionCategoryRuntime(mergedRows, now);
                if (!cancelled) {
                    setNeedsAttentionCount(counts.needsAttention);
                    setHighTouchCount(counts.highTouch);
                    setAttention(att);
                }

                const depts = dj.items ?? [];
                const wus = wj.items ?? [];
                const d = depts.find((x) => x.id === departmentId) ?? null;
                if (!cancelled) {
                    setDept(d);
                    setWorkUnits(wus);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    return { dept, workUnits, title, runtime, error: error ?? derivedError, loading };
}
