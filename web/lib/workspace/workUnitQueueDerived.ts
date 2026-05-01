import type { QueueDefinitionV1, QueueConfig } from "@/lib/config/queueDefinitionSchema";
import type { QueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { getQueueUiConfig, partitionQueueUiSections } from "@/lib/ui-v2/queueUiConfig";

export const WORK_UNIT_OTHER_PILL_KEY = "__derived_other__" as const;

export function queueHasStatusFilters(queue: QueueConfig): boolean {
    return (queue.filters ?? []).some((f) => (f as { type?: string }).type === "status");
}

/**
 * "All records" lane: the broadest work-unit scope — prefer `ui.primary_total_queue`, else first non–needs_attention
 * queue with no status filters (still subject to any non-status filters on that lane).
 */
export function findAllRecordsQueueKey(def: QueueDefinitionV1, ui: QueueUiConfig | null): string | null {
    const needsKey = (k: string) => k.trim().toLowerCase() === "needs_attention";

    const primary = (ui?.primary_total_queue ?? "").trim();
    if (primary && def.queues.some((q) => q.key === primary)) {
        return primary;
    }

    for (const q of def.queues) {
        if (needsKey(q.key)) continue;
        if (!queueHasStatusFilters(q)) return q.key;
    }
    const first = def.queues.find((q) => !needsKey(q.key));
    return first?.key ?? null;
}

/** Status keys explicitly assigned to throughput lanes (not all-lane, not needs_attention). */
export function statusKeysCoveredByThroughputQueues(def: QueueDefinitionV1, allRecordsQueueKey: string | null): Set<string> {
    const covered = new Set<string>();
    for (const q of def.queues) {
        if (!allRecordsQueueKey || q.key === allRecordsQueueKey) continue;
        if (q.key.trim().toLowerCase() === "needs_attention") continue;
        for (const f of q.filters ?? []) {
            if (f.type !== "status" || f.operator !== "in") continue;
            for (const v of f.values ?? []) {
                const t = String(v ?? "").trim().toLowerCase();
                if (t) covered.add(t);
            }
        }
    }
    return covered;
}

export type QueueSummaryLike = { key: string; count: number; counts_deferred?: boolean };

/**
 * Single source of truth for department cards + work-unit "All" — count of the primary / all-records lane only
 * (not the sum of every queue tab, which double-counts overlapping lanes).
 */
export function workUnitScopeTotalFromSummaries(
    def: QueueDefinitionV1,
    summaries: QueueSummaryLike[]
): { queueKey: string | null; total: number | null } {
    const ui = getQueueUiConfig(def);
    const queueKey = findAllRecordsQueueKey(def, ui);
    if (!queueKey) return { queueKey: null, total: null };
    const row = summaries.find((s) => s.key === queueKey);
    if (!row || row.counts_deferred === true || typeof row.count !== "number") {
        return { queueKey, total: null };
    }
    return { queueKey, total: Math.max(0, Math.floor(row.count)) };
}

/**
 * When the all-records lane count exceeds the sum of **lifecycle/status** throughput lanes (all-lane and
 * needs_attention excluded), the remainder is unmapped for stage pills. Non-status lanes (e.g. date slices)
 * are not part of the reconciliation `All = Σ(stage buckets) + Other`. Needs Attention is a separate overlay.
 */
export function computeUnmappedOverflowCount(params: {
    summaries: QueueSummaryLike[] | null;
    def: QueueDefinitionV1;
    allRecordsQueueKey: string | null;
}): number | null {
    const { summaries, def, allRecordsQueueKey } = params;
    if (!summaries?.length || !allRecordsQueueKey) return null;

    const allRow = summaries.find((s) => s.key === allRecordsQueueKey);
    if (!allRow || allRow.counts_deferred === true || typeof allRow.count !== "number") return null;

    const allCount = Math.max(0, Math.floor(allRow.count));

    let sumStatusLanes = 0;
    for (const q of def.queues) {
        if (q.key === allRecordsQueueKey || q.key.trim().toLowerCase() === "needs_attention") continue;
        if (!queueHasStatusFilters(q)) continue;
        const row = summaries.find((s) => s.key === q.key);
        if (!row || row.counts_deferred === true || typeof row.count !== "number") return null;
        sumStatusLanes += Math.max(0, Math.floor(row.count));
    }

    return Math.max(0, allCount - sumStatusLanes);
}

/**
 * Suppress generic KPI strip when pills already summarize the work-unit (pipeline layout or multi-section throughput).
 */
export function shouldSuppressWorkUnitKpiStrip(params: {
    def: QueueDefinitionV1 | null;
    ui: QueueUiConfig | null;
}): boolean {
    const { def, ui } = params;
    if (!def || !ui) return false;
    if (ui.layout === "pipeline_with_attention") return true;
    const { throughput } = partitionQueueUiSections(ui);
    const allKey = findAllRecordsQueueKey(def, ui);
    if (!allKey) return false;
    const statusLanes = def.queues.filter(
        (q) => q.key !== allKey && q.key.trim().toLowerCase() !== "needs_attention" && queueHasStatusFilters(q)
    );
    return throughput.length > 1 && statusLanes.length >= 1;
}

/** Reorder queues inside throughput sections so the all-records lane appears first. */
export function reorderSectionsWithAllRecordsFirst<T extends { queues: Array<{ key: string }> }>(
    sections: T[],
    allRecordsQueueKey: string | null
): T[] {
    if (!allRecordsQueueKey) return sections;
    return sections.map((sec) => {
        const qs = [...sec.queues];
        const ix = qs.findIndex((q) => q.key === allRecordsQueueKey);
        if (ix <= 0) return sec;
        const [row] = qs.splice(ix, 1);
        return { ...sec, queues: [row, ...qs] } as T;
    });
}

export function rowStatusKeyNormalized(row: unknown): string | null {
    if (typeof row !== "object" || row == null) return null;
    const sk = (row as { status_key?: unknown }).status_key;
    if (typeof sk !== "string") return null;
    const t = sk.trim().toLowerCase();
    return t || null;
}

/** Client-side filter: records on the all-lane whose status is not covered by any throughput status lane. */
export function isRowUnmappedForThroughput(row: unknown, covered: Set<string>): boolean {
    const sk = rowStatusKeyNormalized(row);
    if (!sk) return true;
    return !covered.has(sk);
}

export type WorkUnitLifecycleCoverage = {
    /** All-records / primary lane exact count when available. */
    allRecordsCount: number | null;
    /** Sum of status-filter lane counts (excludes all-lane, needs_attention, non-status lanes). */
    statusLaneCountSum: number | null;
    /** Same as `computeUnmappedOverflowCount` — lifecycle/status unmapped remainder only. */
    unmappedCount: number | null;
    needsAttentionCount: number | null;
    /** False when any involved summary row is deferred or missing. */
    isComplete: boolean;
};

/**
 * Coverage guardrail inputs for lifecycle work units. Needs Attention is reported separately and may overlap;
 * it does not change `unmappedCount` (Other is status-coverage only).
 */
export function computeWorkUnitLifecycleCoverage(params: {
    summaries: QueueSummaryLike[] | null;
    def: QueueDefinitionV1;
    allRecordsQueueKey: string | null;
}): WorkUnitLifecycleCoverage {
    const { summaries, def, allRecordsQueueKey } = params;
    const unmappedCount = computeUnmappedOverflowCount(params);

    if (!summaries?.length || !allRecordsQueueKey) {
        return {
            allRecordsCount: null,
            statusLaneCountSum: null,
            unmappedCount,
            needsAttentionCount: null,
            isComplete: false,
        };
    }

    const allRow = summaries.find((s) => s.key === allRecordsQueueKey);
    const allRecordsCount =
        allRow && allRow.counts_deferred !== true && typeof allRow.count === "number"
            ? Math.max(0, Math.floor(allRow.count))
            : null;
    const allComplete = Boolean(
        allRow && allRow.counts_deferred !== true && typeof allRow.count === "number"
    );

    let statusLaneCountSum = 0;
    let statusLanesComplete = true;
    for (const q of def.queues) {
        if (q.key === allRecordsQueueKey || q.key.trim().toLowerCase() === "needs_attention") continue;
        if (!queueHasStatusFilters(q)) continue;
        const row = summaries.find((s) => s.key === q.key);
        if (!row || row.counts_deferred === true || typeof row.count !== "number") {
            statusLanesComplete = false;
            break;
        }
        statusLaneCountSum += Math.max(0, Math.floor(row.count));
    }

    const needsAttentionLaneDefined = def.queues.some((q) => q.key.trim().toLowerCase() === "needs_attention");
    const naRow = needsAttentionLaneDefined ? summaries.find((s) => s.key.trim().toLowerCase() === "needs_attention") : undefined;
    const needsAttentionCount =
        !needsAttentionLaneDefined
            ? null
            : naRow && naRow.counts_deferred !== true && typeof naRow.count === "number"
              ? Math.max(0, Math.floor(naRow.count))
              : null;

    let needsAttentionComplete = true;
    if (needsAttentionLaneDefined) {
        if (!naRow || naRow.counts_deferred === true || typeof naRow.count !== "number") {
            needsAttentionComplete = false;
        }
    }

    const unmappedComplete = unmappedCount != null;
    const isComplete = allComplete && statusLanesComplete && unmappedComplete && needsAttentionComplete;

    return {
        allRecordsCount,
        statusLaneCountSum: statusLanesComplete ? statusLaneCountSum : null,
        unmappedCount,
        needsAttentionCount: naRow ? needsAttentionCount : null,
        isComplete,
    };
}

export type UnmappedRowDiagnostic = {
    id: string;
    label: string;
    statusKey: string | null;
};

/** Build admin table + status histogram from already-loaded queue rows (typically one page). */
export function summarizeUnmappedRowsForDiagnostics(
    rows: unknown[],
    covered: Set<string>,
    limit = 50
): {
    samples: UnmappedRowDiagnostic[];
    truncated: boolean;
    statusKeyCounts: Record<string, number>;
    missingStatusKeyCount: number;
} {
    const unmapped = rows.filter((r) => isRowUnmappedForThroughput(r, covered));
    const statusKeyCounts: Record<string, number> = {};
    let missingStatusKeyCount = 0;

    for (const r of unmapped) {
        const sk = rowStatusKeyNormalized(r);
        if (sk == null) missingStatusKeyCount += 1;
        const k = sk ?? "";
        statusKeyCounts[k] = (statusKeyCounts[k] ?? 0) + 1;
    }

    const samples: UnmappedRowDiagnostic[] = [];
    let i = 0;
    for (const r of unmapped) {
        if (i >= limit) break;
        if (typeof r !== "object" || r == null) continue;
        const o = r as Record<string, unknown>;
        const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
        if (!id) continue;
        const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "";
        const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "";
        const label = name || title || id;
        const statusKey = rowStatusKeyNormalized(r);
        samples.push({ id, label, statusKey });
        i += 1;
    }

    return {
        samples,
        truncated: unmapped.length > limit,
        statusKeyCounts,
        missingStatusKeyCount,
    };
}
