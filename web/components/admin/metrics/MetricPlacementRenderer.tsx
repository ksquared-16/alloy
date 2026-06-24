"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { MetricVisualRenderer } from "@/components/admin/metrics/MetricVisualRenderer";
import { placementRenderToEvaluation } from "@/lib/metrics/platform/renderMetricPlacements";
import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";
import { fetchMetricRenderBundle } from "@/lib/metrics/platform/fetchMetricRender";

type Props = {
    surface: string;
    surfaceKey?: string;
    placementZone?: string;
    contextType?: string;
    contextId?: string | null;
    layout?: "grid" | "row" | "inline";
    className?: string;
    emptyFallback?: ReactNode;
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
}: Props) {
    const [items, setItems] = useState<MetricPlacementRenderItem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const bundle = await fetchMetricRenderBundle({
            surface,
            surfaceKey,
            placementZone,
            contextType,
            contextId,
        });
        setItems(bundle.items);
        setLoading(false);
    }, [surface, surfaceKey, placementZone, contextType, contextId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!loading && !items.length) return emptyFallback ?? null;

    const layoutClass =
        layout === "row" ? "flex flex-wrap gap-2"
        : layout === "inline" ? "flex flex-wrap items-center gap-2"
        : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";

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

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void fetchMetricRenderBundle({
            surface: params.surface,
            surfaceKey: params.surfaceKey,
            contextType: params.contextType,
            contextId: params.contextId,
        }).then((bundle) => {
            if (!cancelled) {
                setZones(bundle.zones ?? {});
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [params.surface, params.surfaceKey, params.contextType, params.contextId]);

    return { zones, loading, reload: () => {} };
}
