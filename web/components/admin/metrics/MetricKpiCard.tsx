"use client";

import { normalizeOipHealthStatus, oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import { oipDomainVisualTokens } from "@/lib/metrics/oipKpiCardVisualSystem";

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
    accent?: string;
};

function normalizeStatus(status: MetricHealthState | string): MetricHealthState {
    return normalizeOipHealthStatus(status);
}

export function MetricKpiCard({ label, value, status = "unknown", loading = false, accent = "enrollment" }: Props) {
    const accentKey = accent === "ops" ? "operational" : accent;
    const known = ["enrollment", "operational", "forms", "communications"] as const;
    const domain =
        known.includes(accentKey as (typeof known)[number])
            ? oipDomainVisualTokens(accentKey as (typeof known)[number])
            : accentKey === "amber"
              ? { sectionLabel: "text-amber-700" }
              : accentKey === "critical"
                ? { sectionLabel: "text-alloy-ember" }
                : accentKey === "neutral"
                  ? { sectionLabel: "text-alloy-midnight/55" }
                  : oipDomainVisualTokens("enrollment");
    const healthClass = oipHealthStatusChipClass(normalizeStatus(status));

    return (
        <div
            className="rounded-lg border border-alloy-stone/15 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            data-metric-visual="kpi_card"
        >
            <div className="flex items-start justify-between gap-2">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${domain.sectionLabel}`}>{label}</p>
                <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${healthClass}`}>
                    {oipHealthStatusLabel(normalizeStatus(status))}
                </span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums text-alloy-midnight">
                {loading ? "…" : value}
            </p>
        </div>
    );
}
