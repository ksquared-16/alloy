import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";
import type { DepartmentLifecycleKpisPayload, PipelineExactSnapshot } from "@/lib/workspace/viewModels/workspaceRootRollup";
import type { DeptWorkUnitRow } from "@/lib/kpi/baseline";

/** KPI / placement: growth dept row with optional exact pipeline lane (replaces lifecycle row-count semantics). */
export type WorkspaceKpiGrowthSnapshot = {
    departmentKey: string;
    kpis: DepartmentLifecycleKpisPayload | null;
    pipelineExact?: PipelineExactSnapshot;
};

/** Sum exact primary-lane inquiries across growth departments (matches row lists). */
export function workspacePipelineExactTotalInScope(snapshots: WorkspaceKpiGrowthSnapshot[]): number | null {
    let sum = 0;
    let saw = false;
    for (const { departmentKey, pipelineExact } of snapshots) {
        if (!isGrowthSliceDepartmentKey(departmentKey)) continue;
        if (pipelineExact?.total != null) {
            saw = true;
            sum += Math.max(0, pipelineExact.total);
        }
    }
    return saw ? sum : null;
}

/** @deprecated Prefer workspacePipelineExactTotalInScope ; lifecycle row totals are not pipeline lane counts. */
export function workspaceLifecycleTotalInScope(
    growthSnapshots: Array<{ departmentKey: string; kpis: DepartmentLifecycleKpisPayload | null }>
): number | null {
    let sum = 0;
    let saw = false;
    for (const { departmentKey, kpis } of growthSnapshots) {
        if (!isGrowthSliceDepartmentKey(departmentKey) || !kpis?.counts) continue;
        saw = true;
        sum += Math.max(0, kpis.counts.total ?? 0);
    }
    return saw ? sum : null;
}

export function departmentSumWorkUnitTotals(params: {
    deptWorkUnits: DeptWorkUnitRow[];
    deptWorkUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    deptQueueSummariesLoading: boolean;
    deptQueueSummariesError: string | null;
}): number | null {
    if (params.deptQueueSummariesLoading || params.deptQueueSummariesError) return null;
    const list = params.deptWorkUnits;
    if (!list.length) return 0;
    let sum = 0;
    for (const wu of list) {
        const s = params.deptWorkUnitSummaries[wu.id];
        if (!s) return null;
        sum += s.total;
    }
    return sum;
}

/** Sum needs_attention only when every work unit reports a number (matches “safe” aggregate). */
export function departmentNeedsAttentionSumSafe(params: {
    deptWorkUnits: DeptWorkUnitRow[];
    deptWorkUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    deptQueueSummariesLoading: boolean;
    deptQueueSummariesError: string | null;
}): number | null {
    if (params.deptQueueSummariesLoading || params.deptQueueSummariesError) return null;
    const list = params.deptWorkUnits;
    if (!list.length) return 0;
    let sum = 0;
    for (const wu of list) {
        const n = params.deptWorkUnitSummaries[wu.id]?.needs_attention;
        if (n == null) return null;
        sum += n;
    }
    return sum;
}

export type WuQueueSummaryForKpi = {
    key: string;
    label?: string;
    count: number;
    counts_deferred?: boolean;
    grain?: import("@/lib/config/queueDefinitionV2Runtime").QueueGrain;
    domain?: string;
    overlay?: boolean;
};

export type WuQueueItemsForKpi = {
    queue: { key: string };
    total: number;
    total_omitted?: boolean;
    offset: number;
    items: unknown[];
} | null;

export function workUnitSummedQueueHeads(summaries: WuQueueSummaryForKpi[] | null): number | null {
    if (!summaries?.length) return null;
    let sum = 0;
    for (const q of summaries) {
        if (q.counts_deferred === true) return null;
        if (typeof q.count !== "number" || Number.isNaN(q.count)) return null;
        sum += q.count;
    }
    return sum;
}

export function workUnitNeedsAttentionCount(summaries: WuQueueSummaryForKpi[] | null): number | null {
    if (!summaries?.length) return null;
    const row = summaries.find((q) => (q.key ?? "").trim().toLowerCase() === "needs_attention");
    if (!row) return null;
    if (row.counts_deferred === true) return null;
    if (typeof row.count !== "number") return null;
    return row.count;
}

export function workUnitPrimaryLaneTotal(summaries: WuQueueSummaryForKpi[] | null): number | null {
    if (!summaries?.length) return null;
    const first = summaries[0];
    if (first.counts_deferred === true) return null;
    if (typeof first.count !== "number") return null;
    return first.count;
}

function filterVmItemIds(items: unknown[]): number {
    let n = 0;
    for (const r of items) {
        if (typeof r === "object" && r != null && typeof (r as { id?: unknown }).id === "string" && String((r as { id: string }).id).trim()) {
            n++;
        }
    }
    return n;
}

/** Mirrors work-unit page `effectiveRowTotal` for the active queue tab. */
export function workUnitSelectedTabCount(params: {
    summaries: WuQueueSummaryForKpi[] | null;
    selectedQueueKey: string | null;
    queueItems: WuQueueItemsForKpi;
    queueItemsLoading: boolean;
    queueItemsError: string | null;
}): number | null {
    const { summaries, selectedQueueKey, queueItems, queueItemsLoading, queueItemsError } = params;
    if (queueItemsError) return null;
    if (!summaries?.length) return null;

    const activeQueue = selectedQueueKey
        ? summaries.find((q) => q.key === selectedQueueKey) ?? summaries[0]
        : summaries[0];
    if (!activeQueue) return null;

    const tabCount =
        activeQueue.counts_deferred === true ? undefined : typeof activeQueue.count === "number" ? activeQueue.count : undefined;

    if (queueItems && queueItems.queue.key !== activeQueue.key) {
        return null;
    }

    if (queueItems == null) {
        if (typeof tabCount === "number") return tabCount;
        return queueItemsLoading ? null : null;
    }

    const vmLen = filterVmItemIds(queueItems.items ?? []);
    const reconcileListEmptyVsTab =
        !queueItemsLoading &&
        queueItems.queue.key === activeQueue.key &&
        (queueItems.offset ?? 0) === 0 &&
        vmLen === 0 &&
        queueItems.total_omitted === true &&
        typeof tabCount === "number" &&
        tabCount > 0;

    if (reconcileListEmptyVsTab) return 0;
    if (queueItems.total_omitted === true && typeof tabCount === "number") return tabCount;
    if (typeof queueItems.total === "number") return queueItems.total;
    if (typeof tabCount === "number") return tabCount;
    return null;
}

export function workUnitTotalInQueueFromContext(params: {
    queueSummaries: WuQueueSummaryForKpi[] | null;
    legacyOpportunityListTotal: number | null;
}): number | null {
    const fromQueues = workUnitSummedQueueHeads(params.queueSummaries);
    if (fromQueues != null) return fromQueues;
    if (params.legacyOpportunityListTotal != null) return params.legacyOpportunityListTotal;
    return null;
}

export function workUnitSelectedTabFromContext(ctx: {
    queueSummaries: WuQueueSummaryForKpi[] | null;
    selectedQueueKey: string | null;
    queueItems: WuQueueItemsForKpi;
    queueItemsLoading: boolean;
    queueItemsError: string | null;
    legacyOpportunityListTotal: number | null;
}): number | null {
    const n = workUnitSelectedTabCount({
        summaries: ctx.queueSummaries,
        selectedQueueKey: ctx.selectedQueueKey,
        queueItems: ctx.queueItems,
        queueItemsLoading: ctx.queueItemsLoading,
        queueItemsError: ctx.queueItemsError,
    });
    if (n != null) return n;
    if (!ctx.queueSummaries?.length && ctx.legacyOpportunityListTotal != null) return ctx.legacyOpportunityListTotal;
    return null;
}
