"use client";

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { MetricPlacementRenderer } from "@/components/admin/metrics/MetricPlacementRenderer";

function InlinePulseMetric({
    label,
    value,
    loading = false,
}: {
    label: string;
    value: string;
    loading?: boolean;
}) {
    return (
        <div
            className="inline-flex min-w-0 items-baseline gap-2"
            data-workspace-pulse-metric="true"
        >
            <span className="text-[11px] font-medium text-alloy-midnight/55">{label}</span>
            <span className="text-sm font-semibold tabular-nums leading-none text-alloy-midnight">
                {loading ? (
                    // Layout-reserving skeleton — never a placeholder value ("—") that morphs into the
                    // real number. The KPI region reserves its placement and reveals the complete value
                    // set atomically once placements + OIP resolve (no piecewise value morph).
                    <span
                        className="inline-block h-[0.7em] w-10 animate-pulse rounded bg-alloy-midnight/10 align-middle"
                        data-workspace-pulse-skeleton="true"
                        aria-hidden="true"
                    />
                ) : (
                    value
                )}
            </span>
        </div>
    );
}

type Props = {
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
};

/** Stable "—" reserve that holds the pulse row's final placement during a cold load (never empty). */
function PulseSlotReserve() {
    return (
        <div
            className="flex flex-wrap items-baseline gap-x-6 gap-y-2"
            data-workspace-pulse-reserve="true"
            aria-hidden="true"
        >
            {[0, 1, 2].map((i) => (
                <InlinePulseMetric key={i} label="" value="" loading />
            ))}
        </div>
    );
}

/** Compact horizontal operational pulse — attention signals, not dashboard tiles. */
export function WorkspaceOperationalPulseStrip({ kpis: _kpis, oipResolved: _oipResolved, loading: _loading = false }: Props) {
    return (
        <div
            className="min-w-0 space-y-1.5"
            data-workspace-operational-pulse-strip="true"
        >
            <MetricPlacementRenderer
                surface="workspace_header"
                surfaceKey="default"
                placementZone="primary_metrics"
                layout="operational-answer"
                loadingReserve={<PulseSlotReserve />}
            />
            <MetricPlacementRenderer
                surface="workspace_header"
                surfaceKey="default"
                placementZone="secondary_metrics"
                layout="operational-answer"
                loadingReserve={<PulseSlotReserve />}
            />
        </div>
    );
}
