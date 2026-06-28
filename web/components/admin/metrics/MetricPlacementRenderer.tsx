"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_V2_SNAPSHOTS_UPDATED } from "@/app/adminV2/settings/analytics/platformBuilderEvents";
import { MetricVisualRenderer } from "@/components/admin/metrics/MetricVisualRenderer";
import { placementRenderToEvaluation } from "@/lib/metrics/platform/renderMetricPlacements";
import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";
import { fetchMetricRenderBundle } from "@/lib/metrics/platform/fetchMetricRender";
import {
    metricRenderItemsHaveValues,
    readMetricRenderBundleCache,
    writeMetricRenderBundleCache,
} from "@/lib/metrics/platform/metricRenderBundleCache";

type Props = {
    surface: string;
    surfaceKey?: string;
    placementZone?: string;
    contextType?: string;
    contextId?: string | null;
    layout?: "grid" | "row" | "inline";
    className?: string;
    /** Owner when the slot has resolved with no configured placements (e.g. OIP fallback). */
    emptyFallback?: ReactNode;
    /**
     * Stable reserve shown ONLY while the bundle is still loading and nothing is seeded — holds the
     * slot's final placement (e.g. "—") so a cold paint is never empty and resolved values patch in
     * place. Distinct from `emptyFallback` so a resolved-empty slot does not show a reserve forever.
     */
    loadingReserve?: ReactNode;
};

export function MetricPlacementRenderer({
    surface,
    surfaceKey = "default",
    placementZone,
    contextType = "org",
    contextId = null,
    layout = "grid",
    className = "",
    emptyFallback = null,
    loadingReserve = null,
}: Props) {
    // Seed from the warm snapshot so the slot paints its final placement immediately on a warm
    // navigation/return; the cold first paint has no snapshot and falls back to `emptyFallback`.
    const [items, setItems] = useState<MetricPlacementRenderItem[]>(
        () => readMetricRenderBundleCache({ surface, surfaceKey, placementZone, contextType, contextId }) ?? [],
    );
    const [loading, setLoading] = useState(
        () => readMetricRenderBundleCache({ surface, surfaceKey, placementZone, contextType, contextId }) == null,
    );
    const itemsRef = useRef(items);
    itemsRef.current = items;

    const load = useCallback(async () => {
        const cacheKey = { surface, surfaceKey, placementZone, contextType, contextId };
        // Re-seed from this key's snapshot so an in-place param change (e.g. contextId) paints the
        // matching cached placement immediately and never shows the prior key's stale items. Cold
        // for this key → show the section's reserve fallback, not stale content.
        const seeded = readMetricRenderBundleCache(cacheKey);
        if (seeded) {
            setItems(seeded);
            setLoading(false);
        } else {
            setItems([]);
            setLoading(true);
        }
        const bundle = await fetchMetricRenderBundle(cacheKey);
        // Single-owner guard: never replace a populated (value-bearing) slot with value-less fresh
        // items — that would flash resolved values back to "—". Adopt the fresh bundle only when it
        // carries values, or when the current slot has nothing populated to protect. Otherwise keep
        // the displayed values and leave the snapshot cache intact.
        const freshHasValues = metricRenderItemsHaveValues(bundle.items);
        const currentHasValues = metricRenderItemsHaveValues(itemsRef.current);
        if (freshHasValues || !currentHasValues) {
            writeMetricRenderBundleCache(cacheKey, bundle.items);
            setItems(bundle.items);
        }
        setLoading(false);
    }, [surface, surfaceKey, placementZone, contextType, contextId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const onSnapshotsUpdated = () => void load();
        window.addEventListener(ANALYTICS_V2_SNAPSHOTS_UPDATED, onSnapshotsUpdated);
        return () => window.removeEventListener(ANALYTICS_V2_SNAPSHOTS_UPDATED, onSnapshotsUpdated);
    }, [load]);

    // KPI snapshot law: occupy final placement immediately and keep a single visible owner.
    // - items present  → platform placements own the slot (warm seed or resolved).
    // - loading + empty → stable reserve (holds final placement; never an empty cold paint).
    // - resolved empty  → `emptyFallback` owner (e.g. OIP strip) only when no placements exist.
    if (!items.length) return loading ? (loadingReserve ?? emptyFallback ?? null) : (emptyFallback ?? null);

    const layoutClass =
        layout === "row" ? "flex flex-wrap gap-2"
        : layout === "inline" ? "flex flex-wrap items-center gap-2"
        : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";

    // Header / tile strips (inline, row) stay compact so the re-chromed cards keep a
    // light footprint in the Workspace / Focus Panel chrome; dashboards (grid) get the
    // standard treatment. Visual only — does not affect readiness/ownership.
    const density = layout === "grid" ? "standard" : "compact";

    return (
        <div className={`${layoutClass} ${className}`} data-metric-placement-renderer={surface}>
            {items.map((item) => (
                <MetricVisualRenderer
                    key={item.id}
                    placement={item}
                    evaluation={placementRenderToEvaluation(item)}
                    loading={loading}
                    sparklinePoints={item.sparklinePoints}
                    trendComparison={item.comparison}
                    density={density}
                />
            ))}
        </div>
    );
}

export function useMetricRenderZones(params: {
    surface: string;
    surfaceKey?: string;
    contextType?: string;
    contextId?: string | null;
}) {
    const [zones, setZones] = useState<Record<string, MetricPlacementRenderItem[]>>({});
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const bundle = await fetchMetricRenderBundle({
            surface: params.surface,
            surfaceKey: params.surfaceKey,
            contextType: params.contextType,
            contextId: params.contextId,
        });
        setZones(bundle.zones ?? {});
        setLoading(false);
    }, [params.surface, params.surfaceKey, params.contextType, params.contextId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const onSnapshotsUpdated = () => void load();
        window.addEventListener(ANALYTICS_V2_SNAPSHOTS_UPDATED, onSnapshotsUpdated);
        return () => window.removeEventListener(ANALYTICS_V2_SNAPSHOTS_UPDATED, onSnapshotsUpdated);
    }, [load]);

    return { zones, loading, reload: load };
}
