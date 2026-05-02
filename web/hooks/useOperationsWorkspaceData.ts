"use client";

import { useEffect, useMemo, useState } from "react";
import {
    computeAttentionCategoryRuntime,
    computeOperationsSignalCounts,
    mergeJobListsById,
    type JobRowForWorkspaceMetrics,
} from "@/lib/workspace/deriveDepartmentJobMetrics";
import type {
    OpportunityLifecycleKpisRuntime,
    WorkspaceAttentionCategoryKey,
    WorkspaceOpportunityQueueRuntime,
    WorkspaceRuntimeData,
} from "@/lib/workspace/types";
import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";
import type { OpportunityLifecycleKpiSnapshot } from "@/lib/workspace/computeOpportunityLifecycleKpis";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";

type Dept = { id: string; name: string | null; key?: string | null };
type WU = {
    id: string;
    name: string | null;
    department_id: string;
    key?: string | null;
    queue_definition?: unknown;
};

async function fetchOpportunityQueueRuntime(wu: WU | undefined): Promise<WorkspaceOpportunityQueueRuntime> {
    if (!wu?.id) {
        return { total: 0, error: "Work unit not found", items: [] };
    }
    const workUnitKey = (wu.key ?? "").trim().toLowerCase();
    const endpoint =
        workUnitKey === "needs_attention"
            ? `/api/admin/work-units/${encodeURIComponent(wu.id)}/opportunity-attention-queue`
            : `/api/admin/work-units/${encodeURIComponent(wu.id)}/opportunity-queue`;
    try {
        const res = await fetch(endpoint, workspaceDataFetchInit());
        const j = (await res.json().catch(() => ({}))) as {
            total?: number;
            items?: WorkspaceOpportunityQueueRuntime["items"];
            error?: string;
        };
        if (!res.ok) {
            return { total: 0, error: j.error ?? "Failed to load queue", items: [] };
        }
        return {
            total: typeof j.total === "number" ? j.total : 0,
            error: null,
            items: j.items ?? [],
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Queue request failed";
        return { total: 0, error: msg, items: [] };
    }
}

async function fetchJsonSafe(
    url: string,
    init?: RequestInit
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    try {
        const r = await fetch(url, init);
        const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: r.ok, json };
    } catch {
        return { ok: false, json: {} };
    }
}

async function fetchNeedsAttentionPreviewRuntime(
    departmentId: string
): Promise<[string, WorkspaceOpportunityQueueRuntime]> {
    const k = "needs_attention";
    const emptyItems: WorkspaceOpportunityQueueRuntime["items"] = [];
    try {
        const res = await fetch(
            `/api/admin/departments/${encodeURIComponent(departmentId)}/opportunity-attention-preview`,
            workspaceDataFetchInit()
        );
        const j = (await res.json().catch(() => ({}))) as {
            total?: number;
            items?: WorkspaceOpportunityQueueRuntime["items"];
            error?: string;
        };
        if (!res.ok) {
            return [
                k,
                {
                    total: 0,
                    error: j.error ?? "Failed to load attention preview",
                    items: emptyItems,
                },
            ];
        }
        return [
            k,
            {
                total: typeof j.total === "number" ? j.total : 0,
                error: null,
                items: j.items ?? emptyItems,
            },
        ];
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Attention preview request failed";
        return [k, { total: 0, error: msg, items: emptyItems }];
    }
}

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
    const [opportunityQueues, setOpportunityQueues] = useState<WorkspaceRuntimeData["opportunityQueues"]>(undefined);
    const [lifecycleKpis, setLifecycleKpis] = useState<OpportunityLifecycleKpisRuntime | undefined>(undefined);

    const title = useMemo(() => dept?.name?.trim() || "Department", [dept]);

    const runtime: WorkspaceRuntimeData = useMemo(
        () => ({
            opportunityQueueQuickActions: opportunityQueues != null,
            metrics: {
                "jobs.unassigned_count": unassignedTotal,
                "schedules.scheduled_today_count": scheduledTodayCount,
                "jobs.needs_attention_count": needsAttentionCount,
                "jobs.high_value_attention_count": highTouchCount,
                ...(opportunityQueues?.new_leads != null
                    ? { "growth.new_leads_count": opportunityQueues.new_leads.total }
                    : {}),
                ...(opportunityQueues?.unbooked_quotes != null
                    ? { "growth.unbooked_quotes_count": opportunityQueues.unbooked_quotes.total }
                    : {}),
                ...(opportunityQueues?.pipeline_overview != null
                    ? { "enrollment.pipeline_overview_count": opportunityQueues.pipeline_overview.total }
                    : {}),
                ...(opportunityQueues?.early_inquiries != null
                    ? { "enrollment.early_inquiries_count": opportunityQueues.early_inquiries.total }
                    : {}),
                ...(opportunityQueues?.quoting != null ? { "enrollment.quoting_count": opportunityQueues.quoting.total } : {}),
                ...(opportunityQueues?.priced_followup != null
                    ? { "enrollment.priced_followup_count": opportunityQueues.priced_followup.total }
                    : {}),
                ...(opportunityQueues?.needs_attention != null
                    ? { "enrollment.needs_attention_count": opportunityQueues.needs_attention.total }
                    : {}),
            },
            workUnits,
            attention,
            opportunityQueues,
            opportunityLifecycleKpis: lifecycleKpis,
        }),
        [
            unassignedTotal,
            scheduledTodayCount,
            needsAttentionCount,
            highTouchCount,
            workUnits,
            attention,
            opportunityQueues,
            lifecycleKpis,
        ]
    );

    useEffect(() => {
        const deptId = typeof departmentId === "string" ? departmentId.trim() : "";
        if (!deptId) {
            setLoading(false);
            setDept(null);
            setWorkUnits([]);
            setOpportunityQueues(undefined);
            setLifecycleKpis(undefined);
            setUnassignedTotal(null);
            setScheduledTodayCount(null);
            setNeedsAttentionCount(null);
            setHighTouchCount(null);
            setAttention({});
            setError(null);
            setDerivedError(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const perfDebug =
                    typeof window !== "undefined" &&
                    (window as unknown as { __WS_PERF_DEBUG__?: boolean }).__WS_PERF_DEBUG__ === true;
                const t0 = perfDebug ? performance.now() : 0;
                setLoading(true);
                setDerivedError(null);
                setError(null);
                const fetchInit = workspaceDataFetchInit();
                const [dRes, wRes] = await Promise.all([
                    dedupeAdminFetch("/api/admin/departments", fetchInit),
                    dedupeAdminFetch(`/api/admin/work-units?department_id=${encodeURIComponent(deptId)}`, fetchInit),
                ]);
                const [dj, wj] = await Promise.all([
                    (async () => (await dRes.json().catch(() => ({}))) as { items?: Dept[]; error?: string })(),
                    (async () => (await wRes.json().catch(() => ({}))) as { items?: WU[]; error?: string })(),
                ]);

                if (!dRes.ok) throw new Error(dj.error ?? "Departments request failed");

                const depts = dj.items ?? [];
                const d = depts.find((x) => x.id === deptId) ?? null;
                if (!d) {
                    throw new Error("Department not found for this organization");
                }

                let wus: WU[] = [];
                if (wRes.ok) {
                    wus = wj.items ?? [];
                }

                if (!cancelled) {
                    setDept(d);
                    setWorkUnits(wus);
                    /**
                     * Base surface readiness: allow the page to mount its real geometry immediately.
                     * The runtime blocks (queues / KPIs / counts) will hydrate right after.
                     */
                    setLoading(false);
                }

                const deptKey = (d.key ?? "").trim().toLowerCase();
                const workUnitsListError: string | null = wRes.ok ? null : (wj.error ?? "Work units unavailable");

                if (isGrowthSliceDepartmentKey(deptKey)) {
                    setUnassignedTotal(null);
                    setScheduledTodayCount(null);
                    setNeedsAttentionCount(null);
                    setHighTouchCount(null);
                    setAttention({});
                    setDerivedError(workUnitsListError);
                    if (!cancelled) setLifecycleKpis({ status: "loading" });

                    const keyToWu = new Map<string, WU>();
                    for (const wu of wus) {
                        const k = (wu.key ?? "").trim().toLowerCase();
                        if (k) keyToWu.set(k, wu);
                    }

                    // Canonical pipeline work units (childcare Enrollment + generic Growth).
                    const queueKeys = [
                        "pipeline_overview",
                        "early_inquiries",
                        "quoting",
                        "priced_followup",
                        "needs_attention",
                        "new_leads",
                        "unbooked_quotes",
                    ];

                    const queuePromises = queueKeys.map(async (k) => {
                        if (k === "needs_attention") {
                            const naWu = keyToWu.get(k);
                            if (naWu?.id) {
                                return [k, await fetchOpportunityQueueRuntime(naWu)] as const;
                            }
                            return fetchNeedsAttentionPreviewRuntime(deptId);
                        }
                        return [k, await fetchOpportunityQueueRuntime(keyToWu.get(k))] as const;
                    });

                    const lifecycleKpisPromise = (async () => {
                        let kpRes: Response | null = null;
                        try {
                            kpRes = await fetch(
                                `/api/admin/departments/${encodeURIComponent(deptId)}/opportunity-lifecycle-kpis`,
                                fetchInit
                            );
                        } catch {
                            kpRes = null;
                        }
                        const kpj = (await (kpRes?.json().catch(() => ({})) ?? Promise.resolve({}))) as {
                            error?: string;
                            counts?: OpportunityLifecycleKpiSnapshot["counts"];
                            values?: OpportunityLifecycleKpiSnapshot["values"];
                            positiveQuoteSumByNonTerminalStatus?: OpportunityLifecycleKpiSnapshot["positiveQuoteSumByNonTerminalStatus"];
                            statusBreakdown?: OpportunityLifecycleKpiSnapshot["statusBreakdown"];
                        };
                        return { kpResOk: kpRes?.ok === true, kpj };
                    })();

                    const queueSettled = await Promise.allSettled(queuePromises);
                    const queuePairs = queueSettled.map((result, i) => {
                        const key = queueKeys[i]!;
                        if (result.status === "fulfilled") {
                            return result.value;
                        }
                        const msg =
                            result.reason instanceof Error ? result.reason.message : "Queue request failed";
                        const empty: WorkspaceOpportunityQueueRuntime["items"] = [];
                        return [key, { total: 0, error: msg, items: empty }] as [string, WorkspaceOpportunityQueueRuntime];
                    });

                    const { kpResOk, kpj } = await lifecycleKpisPromise;
                    if (!cancelled) {
                        const oqMap: NonNullable<WorkspaceRuntimeData["opportunityQueues"]> = {};
                        for (const [k, v] of queuePairs) oqMap[k] = v;
                        setOpportunityQueues(oqMap);
                        if (kpResOk && kpj.counts && kpj.values) {
                            setLifecycleKpis({
                                status: "ready",
                                counts: kpj.counts,
                                values: kpj.values,
                                positiveQuoteSumByNonTerminalStatus: kpj.positiveQuoteSumByNonTerminalStatus ?? {},
                                statusBreakdown: kpj.statusBreakdown,
                            });
                        } else {
                            setLifecycleKpis({
                                status: "error",
                                message: (kpj as { error?: string })?.error ?? "Pipeline KPIs unavailable",
                            });
                        }
                    }
                    if (perfDebug) {
                        const t1 = performance.now();
                        console.debug(
                            `[ws.dept] base+growth runtime ready in ${Math.round(t1 - t0)}ms`,
                            { deptKey, queues: queueKeys.length }
                        );
                    }
                    return;
                }

                setOpportunityQueues(undefined);
                if (!cancelled) setLifecycleKpis(undefined);

                const jobFetchInit = workspaceDataFetchInit();
                const [uMeta, stMeta, deptJobsMeta, unassignedJobsMeta] = await Promise.all([
                    fetchJsonSafe("/api/admin/jobs?assigned_vendor_unassigned=true&limit=1", jobFetchInit),
                    fetchJsonSafe("/api/admin/schedules?scheduled_on=today&limit=1", jobFetchInit),
                    fetchJsonSafe(`/api/admin/jobs?department_id=${encodeURIComponent(deptId)}&limit=200`, jobFetchInit),
                    fetchJsonSafe("/api/admin/jobs?assigned_vendor_unassigned=true&limit=200", jobFetchInit),
                ]);
                const uj = uMeta.json as { total?: number; error?: string };
                const stj = stMeta.json as { total?: number; schedules?: unknown[]; error?: string };
                const djJobs = deptJobsMeta.json as {
                    jobs?: JobRowForWorkspaceMetrics[];
                    error?: string;
                };
                const ujJobs = unassignedJobsMeta.json as {
                    jobs?: JobRowForWorkspaceMetrics[];
                    error?: string;
                };

                if (uMeta.ok && typeof uj.total === "number" && !cancelled) setUnassignedTotal(uj.total);
                else if (!uMeta.ok) setUnassignedTotal(null);
                if (stMeta.ok && typeof stj.total === "number" && !cancelled) setScheduledTodayCount(stj.total);
                else if (!stMeta.ok) setScheduledTodayCount(null);

                let mergeErr: string | null = workUnitsListError;
                const deptRows = deptJobsMeta.ok ? (djJobs.jobs ?? []) : [];
                if (!deptJobsMeta.ok) {
                    mergeErr = mergeErr
                        ? `${mergeErr}; ${djJobs.error ?? "Department jobs unavailable"}`
                        : djJobs.error ?? "Department jobs unavailable";
                }
                const unRows = unassignedJobsMeta.ok ? (ujJobs.jobs ?? []) : [];
                if (!unassignedJobsMeta.ok) {
                    const uem = ujJobs.error ?? "Unassigned jobs unavailable";
                    mergeErr = mergeErr ? `${mergeErr}; ${uem}` : uem;
                }
                if (!cancelled) setDerivedError(mergeErr);

                const mergedRows = mergeJobListsById(deptRows, unRows);
                const now = new Date();
                const scheduledTodayOperational =
                    stMeta.ok && typeof stj.total === "number" ? stj.total : undefined;
                const counts = computeOperationsSignalCounts(mergedRows, now, {
                    operationalDayScheduledCount: scheduledTodayOperational,
                });
                const att = computeAttentionCategoryRuntime(mergedRows, now);
                if (!cancelled) {
                    setNeedsAttentionCount(counts.needsAttention);
                    setHighTouchCount(counts.highTouch);
                    setAttention(att);
                }

                if (!cancelled) {
                    if (perfDebug) {
                        const t1 = performance.now();
                        console.debug(`[ws.dept] base+ops runtime ready in ${Math.round(t1 - t0)}ms`, {
                            deptKey,
                            workUnits: wus.length,
                        });
                    }
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                // `loading` is flipped to false as soon as base dept/WUs are available.
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    return { dept, workUnits, title, runtime, error: error ?? derivedError, loading };
}
