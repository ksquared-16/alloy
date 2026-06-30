"use client";

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { oipMetricKeyForStripKey } from "@/lib/kpi/oipBridge";
import type { MetricKey } from "@/lib/kpi/types";
import { filterOperationalPulseKpis } from "@/lib/kpi/workspaceKpiPresentation";
import { oipSummaryLabel } from "@/lib/metrics/oipOperatorCopy";
import { MetricPlacementRenderer } from "@/components/admin/metrics/MetricPlacementRenderer";
import { ALLOY_OS_RUNTIME_ENABLED } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";

function metricKeyFromKpiId(id: string): string | null {
    if (!id.startsWith("oip.")) return null;
    return oipMetricKeyForStripKey(id as MetricKey);
}

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

function KpiPulseFallback({
    kpis,
    oipResolved: _oipResolved,
    loading = false,
}: {
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
}) {
    const pulseKpis = filterOperationalPulseKpis(kpis);
    if (!pulseKpis.length) return null;

    return (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {pulseKpis.map((kpi) => {
                const metricKey = metricKeyFromKpiId(kpi.id);
                const label = metricKey ? oipSummaryLabel(metricKey) : kpi.label;
                return (
                    <InlinePulseMetric
                        key={kpi.id}
                        label={label}
                        value={kpi.value}
                        loading={loading}
                    />
                );
            })}
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
export function WorkspaceOperationalPulseStrip({ kpis, oipResolved, loading = false }: Props) {
    // Legacy-only: OIP pulse fallback when platform resolves with no configured placements.
    const legacyOipFallback =
        !ALLOY_OS_RUNTIME_ENABLED && kpis.length ?
            <KpiPulseFallback kpis={kpis} oipResolved={oipResolved} loading={loading} />
        :   null;

    return (
        <div
            className="min-w-0 space-y-1.5"
            data-workspace-operational-pulse-strip="true"
        >
            <MetricPlacementRenderer
                surface="workspace_header"
                surfaceKey="default"
                placementZone="primary_metrics"
                layout="inline"
                className="gap-x-6 gap-y-2"
                loadingReserve={<PulseSlotReserve />}
            />
            <MetricPlacementRenderer
                surface="workspace_header"
                surfaceKey="default"
                placementZone="secondary_metrics"
                layout="inline"
                className="gap-x-6 gap-y-2"
                loadingReserve={<PulseSlotReserve />}
                emptyFallback={legacyOipFallback}
            />
        </div>
    );
}
