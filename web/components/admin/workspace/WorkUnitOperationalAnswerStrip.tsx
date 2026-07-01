"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MetricPlacementRenderItem } from "@/lib/metrics/platform/renderMetricPlacements";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import { fetchMetricRenderBundle } from "@/lib/metrics/platform/fetchMetricRender";
import {
    metricRenderItemsHaveValues,
    readMetricRenderBundleCache,
    writeMetricRenderBundleCache,
} from "@/lib/metrics/platform/metricRenderBundleCache";
import { resolveMetricDisplayLabel } from "@/lib/metrics/platform/metricSourceRegistry";
import { ANALYTICS_V2_SNAPSHOTS_UPDATED } from "@/app/adminV2/settings/analytics/platformBuilderEvents";
import type { OperationalAnswer, AnswerState } from "@/lib/ui-v2/workspace-types";
import OperationalAnswerStrip from "@/app/adminV2/components/workspace/blocks/OperationalAnswerStrip";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";

type Props = {
    workUnitId?: string | null;
    surfaceKey?: string;
};

function healthStateToAnswerState(h: MetricHealthState): AnswerState {
    switch (h) {
        case "healthy":  return "healthy";
        case "warning":  return "caution";
        case "critical": return "critical";
        default:         return "empty";
    }
}

function healthStateToAnswer(h: MetricHealthState): string {
    switch (h) {
        case "healthy":  return "On track";
        case "warning":  return "Needs attention";
        case "critical": return "Action required";
        default:         return "No data";
    }
}

function itemToOperationalAnswer(item: MetricPlacementRenderItem): OperationalAnswer {
    const viz = item.visualization;
    const def = item.definition;
    const label = resolveMetricDisplayLabel(
        (viz.display_config as { labelOverride?: string }).labelOverride ?? viz.label,
        def.label,
        def.source_key,
    );
    return {
        key: def.key,
        label,
        primaryValue: item.formattedValue,
        state: healthStateToAnswerState(item.healthState),
        answer: healthStateToAnswer(item.healthState),
        freshness: { isLive: false },
        emptyState: { message: `No data for ${label}` },
        lane: "operational",
        sourceCalculationKey: def.key,
    };
}

/**
 * Work Unit header metric strip — same data path as MetricPlacementRenderer
 * (surface="work_unit_header", zone="header_metrics") but rendered as compact
 * OperationalAnswerStrip cells instead of individual KPI cards.
 */
export function WorkUnitOperationalAnswerStrip({ workUnitId = null, surfaceKey = "default" }: Props) {
    const buildCacheKey = useCallback(
        () => ({
            surface: "work_unit_header",
            surfaceKey,
            placementZone: "header_metrics",
            contextType: "work_unit",
            contextId: workUnitId,
        }),
        [surfaceKey, workUnitId],
    );

    const [items, setItems] = useState<MetricPlacementRenderItem[]>(
        () => readMetricRenderBundleCache(buildCacheKey()) ?? [],
    );
    const [loading, setLoading] = useState(
        () => readMetricRenderBundleCache(buildCacheKey()) == null,
    );
    const itemsRef = useRef(items);
    itemsRef.current = items;

    const load = useCallback(async () => {
        const key = buildCacheKey();
        const seeded = readMetricRenderBundleCache(key);
        if (seeded) {
            setItems(seeded);
            setLoading(false);
        } else {
            setItems([]);
            setLoading(true);
        }
        const bundle = await fetchMetricRenderBundle(key);
        const freshHasValues = metricRenderItemsHaveValues(bundle.items);
        const currentHasValues = metricRenderItemsHaveValues(itemsRef.current);
        if (freshHasValues || !currentHasValues) {
            writeMetricRenderBundleCache(key, bundle.items);
            setItems(bundle.items);
        }
        setLoading(false);
    }, [buildCacheKey]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        const onUpdate = () => void load();
        window.addEventListener(ANALYTICS_V2_SNAPSHOTS_UPDATED, onUpdate);
        return () => window.removeEventListener(ANALYTICS_V2_SNAPSHOTS_UPDATED, onUpdate);
    }, [load]);

    if (!items.length) {
        return loading ? <WorkspaceQuietKpiReserve id="wu-oa-quiet-reserve" /> : null;
    }

    return <OperationalAnswerStrip answers={items.map(itemToOperationalAnswer)} maxVisible={5} />;
}
