import type { QueueDefinitionV1, QueueConfig } from "@/lib/config/queueDefinitionSchema";
import type { QueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { partitionQueueUiSections } from "@/lib/ui-v2/queueUiConfig";

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
 * When the all-records lane count exceeds the sum of throughput lane heads (excluding all + needs_attention),
 * the remainder is treated as unmapped / not covered by stage pills — still in scope for the work unit.
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
    const partKeys = new Set(
        def.queues
            .map((q) => q.key)
            .filter((k) => k !== allRecordsQueueKey && k.trim().toLowerCase() !== "needs_attention")
    );

    let sumParts = 0;
    for (const k of partKeys) {
        const row = summaries.find((s) => s.key === k);
        if (!row || row.counts_deferred === true || typeof row.count !== "number") return null;
        sumParts += Math.max(0, Math.floor(row.count));
    }

    return Math.max(0, allCount - sumParts);
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
