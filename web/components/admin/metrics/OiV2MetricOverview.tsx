"use client";

import type { ReactNode } from "react";
import { OipSectionCard } from "@/app/adminV2/analytics/oipWorkspaceUi";
import { MetricVisualRenderer } from "@/components/admin/metrics/MetricVisualRenderer";
import { placementRenderToEvaluation } from "@/lib/metrics/platform/renderMetricPlacements";
import { useMetricRenderZones } from "@/components/admin/metrics/MetricPlacementRenderer";

type Props = {
    surfaceKey?: string;
    contextType?: string;
    contextId?: string | null;
};

function ZoneSection({
    title,
    items,
    loading,
}: {
    title: string;
    items: ReturnType<typeof useMetricRenderZones>["zones"][string];
    loading: boolean;
}) {
    if (!items?.length) return null;
    return (
        <OipSectionCard title={title}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
        </OipSectionCard>
    );
}

export function OiV2MetricOverview({ surfaceKey = "default", contextType = "org", contextId = null }: Props) {
    const { zones, loading } = useMetricRenderZones({
        surface: "operational_intelligence",
        surfaceKey,
        contextType,
        contextId,
    });

    return (
        <div data-oip-v2-metric-overview="true" className="space-y-4">
            <ZoneSection title="Overview" items={zones.overview} loading={loading} />
            <ZoneSection title="Health" items={zones.health} loading={loading} />
            <ZoneSection title="Trends" items={zones.trends} loading={loading} />
            <ZoneSection title="Comparisons" items={zones.comparisons} loading={loading} />
        </div>
    );
}
