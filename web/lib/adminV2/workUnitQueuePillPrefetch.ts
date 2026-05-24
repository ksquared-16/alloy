/**
 * Pick adjacent work-unit queue filter pill keys for background row prefetch.
 * Caps breadth so we do not warm entire queue catalogs.
 */
export function adjacentWorkUnitQueuePillKeys(
    summaries: ReadonlyArray<{ key: string }>,
    selectedKey: string | null,
    cap = 3
): string[] {
    if (!summaries.length || cap <= 0) return [];
    const keys = summaries.map((s) => String(s.key ?? "").trim()).filter(Boolean);
    if (!keys.length) return [];

    const active = selectedKey?.trim() || keys[0];
    const idx = keys.indexOf(active);
    if (idx < 0) {
        return keys.slice(0, cap);
    }

    const out: string[] = [];
    const add = (key: string) => {
        if (!key || key === active || out.includes(key)) return;
        out.push(key);
    };

    for (let d = 1; d < keys.length && out.length < cap; d++) {
        if (idx - d >= 0) add(keys[idx - d]!);
        if (out.length >= cap) break;
        if (idx + d < keys.length) add(keys[idx + d]!);
    }

    return out.slice(0, cap);
}

/** Flatten visible header pill keys (pipeline + expanded needs-attention bucket pills). */
export function flattenWorkUnitVisibleQueuePillKeys(
    sections: ReadonlyArray<{ queues: ReadonlyArray<{ key: string }> }> | null | undefined
): string[] {
    if (!sections?.length) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const sec of sections) {
        for (const q of sec.queues) {
            const k = String(q.key ?? "").trim();
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(k);
        }
    }
    return out;
}

/** Neighbor/visible pill keys to warm after above-fold reveal (not including the active pill). */
export function workUnitQueuePillPrefetchTargets(
    visiblePillKeys: readonly string[],
    selectedPillKey: string | null,
    cap = 6
): string[] {
    if (!visiblePillKeys.length || cap <= 0) return [];
    return adjacentWorkUnitQueuePillKeys(
        visiblePillKeys.map((key) => ({ key })),
        selectedPillKey,
        cap
    );
}

/** Max concurrent background row prefetches per scheduling tick. */
export const WORK_UNIT_QUEUE_PILL_PREFETCH_CONCURRENCY = 2;
