"use client";

import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { oipSummaryLabel } from "@/lib/metrics/oipOperatorCopy";
import { oipKpiObjectStatusTextClass } from "@/lib/metrics/oipKpiObjectPresentation";
import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import { OPERATIONAL_PULSE_METRIC_KEYS } from "@/lib/kpi/workspaceKpiPresentation";

type Props = {
    resolved: ResolvedMetricMap;
    loading?: boolean;
};

/** Lightweight headline metrics for O.I. Overview — not full KPI cards. */
export function OipOverviewPulseRow({ resolved, loading = false }: Props) {
    if (loading) {
        return (
            <div className="flex flex-wrap gap-2" data-oip-overview-pulse="true" aria-busy="true">
                {OPERATIONAL_PULSE_METRIC_KEYS.map((key) => (
                    <div
                        key={key}
                        className="h-8 min-w-[6.5rem] animate-pulse rounded-md border border-alloy-midnight/10 bg-alloy-stone/10"
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-1.5" data-oip-overview-pulse="true">
            {OPERATIONAL_PULSE_METRIC_KEYS.map((key: OipMetricKey) => {
                const metric = resolved[key];
                const status = normalizeOipHealthStatus(metric?.kpi?.status);
                return (
                    <div
                        key={key}
                        className="inline-flex min-w-0 items-baseline gap-1 rounded-md border border-alloy-midnight/10 bg-white px-2 py-1"
                        data-oip-overview-metric={key}
                    >
                        <span className="truncate text-[10px] font-medium text-alloy-midnight/55">
                            {oipSummaryLabel(key)}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-alloy-midnight">
                            {metric?.formatted_value ?? "—"}
                        </span>
                        {status !== "unknown" ?
                            <span
                                className={`shrink-0 text-[9px] font-medium ${oipKpiObjectStatusTextClass(status)}`}
                                aria-hidden
                            >
                                ●
                            </span>
                        :   null}
                    </div>
                );
            })}
        </div>
    );
}
