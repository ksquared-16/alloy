"use client";

import { useAnalyticsContext } from "@/lib/analytics/runtime/AnalyticsContextProvider";
import { metricWindowFromPeriod, ANALYTICS_WINDOW_OPTIONS } from "@/lib/analytics/runtime/metricWindow";

/**
 * Analytics Context Filter Bar (production) — URL-safe, back-button safe.
 *
 * Reads/writes filter state through AnalyticsContextProvider (URL search params).
 * The window control re-resolves real metrics server-side; comparison persists in
 * the URL for the (next-slice) comparison rendering.
 */
export function OperationalFilterBar({ siteLabel }: { siteLabel: string }) {
    const { filters, patchFilters } = useAnalyticsContext();
    const currentWindow = metricWindowFromPeriod(filters.dateRange);
    const compareOn = Boolean(filters.comparisonPeriod);

    return (
        <div
            className="flex flex-wrap items-center gap-2 rounded-xl border border-alloy-stone/15 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
            data-analytics-filter-bar="true"
        >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Scope</span>

            <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="date_range">
                <span className="text-alloy-midnight/45">Window:</span>
                <select
                    value={currentWindow}
                    onChange={(e) => {
                        const opt = ANALYTICS_WINDOW_OPTIONS.find((o) => o.windowKey === e.target.value);
                        patchFilters({ dateRange: { version: 1, kind: "rolling", days: opt?.days ?? 30 } });
                    }}
                    className="bg-transparent font-semibold text-alloy-midnight focus:outline-none"
                >
                    {ANALYTICS_WINDOW_OPTIONS.map((o) => (
                        <option key={o.windowKey} value={o.windowKey}>
                            {o.label}
                        </option>
                    ))}
                </select>
            </label>

            <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="comparison">
                <span className="text-alloy-midnight/45">Compare:</span>
                <select
                    value={compareOn ? "prior" : "off"}
                    onChange={(e) =>
                        patchFilters({
                            comparisonPeriod:
                                e.target.value === "prior" ? { version: 1, kind: "month_over_month" } : undefined,
                        })
                    }
                    className="bg-transparent font-semibold text-alloy-midnight focus:outline-none"
                >
                    <option value="off">Off</option>
                    <option value="prior">Prior period</option>
                </select>
            </label>

            <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-alloy-stone/20 px-2 py-1 text-xs text-alloy-midnight/55" data-filter-dimension="location">
                <span className="text-alloy-midnight/45">Site:</span>
                <span className="font-semibold text-alloy-midnight/70">{siteLabel}</span>
            </span>

            <span className="ml-auto text-[11px] text-alloy-midnight/45">
                Filters flow into every card, breakdown, and drill on this surface — and into the URL.
            </span>
        </div>
    );
}
