import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";

/**
 * Warm snapshot cache for metric render bundles.
 *
 * `MetricPlacementRenderer` fetches its placement bundle client-side on every mount. With no
 * snapshot the first paint has zero items, so the slot renders empty and the resolved metrics
 * pop in late (Workspace WS-04/WS-06, Work Unit WU-02) — which also reflows neighboring sections
 * (e.g. the WU-03 work-view pills shift down). Caching the last-resolved bundle (keyed by the
 * exact fetch params) lets the renderer paint the prior placement immediately on a warm
 * navigation/return and patch values in place, with no shape change and no layout shift. The
 * cold first paint still falls back to the section's reserve, and a background revalidate keeps
 * the snapshot fresh (also wired to the analytics snapshot-updated event).
 *
 * This is an in-memory memo of an existing fetch — not a new data path. It is intentionally
 * unbounded-per-session but tiny (a handful of surface/zone/context combinations).
 */
export type MetricRenderBundleCacheKey = {
    surface: string;
    surfaceKey?: string;
    placementZone?: string;
    contextType?: string;
    contextId?: string | null;
};

const store = new Map<string, MetricPlacementRenderItem[]>();

function keyOf(input: MetricRenderBundleCacheKey): string {
    return [
        input.surface,
        input.surfaceKey ?? "default",
        input.placementZone ?? "",
        input.contextType ?? "org",
        input.contextId ?? "",
    ].join("|");
}

export function readMetricRenderBundleCache(
    input: MetricRenderBundleCacheKey,
): MetricPlacementRenderItem[] | null {
    return store.get(keyOf(input)) ?? null;
}

export function writeMetricRenderBundleCache(
    input: MetricRenderBundleCacheKey,
    items: MetricPlacementRenderItem[],
): void {
    store.set(keyOf(input), items);
}

export function clearMetricRenderBundleCache(): void {
    store.clear();
}

/**
 * A metric render item is "value-bearing" when it has a resolved snapshot. A fresh bundle whose
 * items are all snapshot-less (value-less) must never replace a populated cached bundle — doing so
 * would flash resolved values back to "—". Empty bundles count as not value-bearing.
 */
export function metricRenderItemsHaveValues(
    items: MetricPlacementRenderItem[] | null | undefined,
): boolean {
    return Boolean(items && items.length > 0 && items.some((item) => item.snapshot != null));
}
