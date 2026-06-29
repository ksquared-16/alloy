"use client";

import { useTransition } from "react";

import { useAnalyticsContext } from "@/lib/analytics/runtime/AnalyticsContextProvider";
import { metricWindowFromPeriod, ANALYTICS_WINDOW_OPTIONS } from "@/lib/analytics/runtime/metricWindow";
import type { AnalyticsFilterState } from "@/lib/analytics/runtime/analyticsContextUrl";
import type { SiteOption } from "@/lib/analytics/runtime/operationalSurfaceModel";

/**
 * Analytics Context Filter Bar (production) — URL-safe, back-button safe.
 *
 * Reads/writes filter state through AnalyticsContextProvider (URL search params).
 * Window + site re-resolve real data server-side; comparison toggles prior-period
 * deltas. `useTransition` surfaces a pending state during the navigation.
 */
export function OperationalFilterBar({
    siteId,
    siteOptions,
}: {
    siteId: string | null;
    siteOptions: SiteOption[];
}) {
    const { filters, patchFilters } = useAnalyticsContext();
    const [isPending, startTransition] = useTransition();
    const currentWindow = metricWindowFromPeriod(filters.dateRange);
    const compareOn = Boolean(filters.comparisonPeriod);

    const patch = (next: Partial<AnalyticsFilterState>) => startTransition(() => patchFilters(next));

    const controlClass = "bg-transparent font-semibold text-alloy-midnight focus:outline-none";

    return (
        <div
            className={`flex flex-wrap items-center gap-2 rounded-xl border border-alloy-stone/15 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${isPending ? "opacity-60" : ""}`}
            data-analytics-filter-bar="true"
            aria-busy={isPending}
        >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Scope</span>

            <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="date_range">
                <span className="text-alloy-midnight/45">Window:</span>
                <select
                    value={currentWindow}
                    disabled={isPending}
                    onChange={(e) => {
                        const opt = ANALYTICS_WINDOW_OPTIONS.find((o) => o.windowKey === e.target.value);
                        patch({ dateRange: { version: 1, kind: "rolling", days: opt?.days ?? 30 } });
                    }}
                    className={controlClass}
                >
                    {ANALYTICS_WINDOW_OPTIONS.map((o) => (
                        <option key={o.windowKey} value={o.windowKey}>
                            {o.label}
                        </option>
                    ))}
                </select>
            </label>

            <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="location">
                <span className="text-alloy-midnight/45">Site:</span>
                <select
                    value={siteId ?? ""}
                    disabled={isPending || siteOptions.length === 0}
                    onChange={(e) =>
                        patch({ siteLocationIds: e.target.value ? [e.target.value] : undefined })
                    }
                    className={controlClass}
                    data-site-options={siteOptions.length}
                >
                    <option value="">All sites</option>
                    {siteOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.label}
                        </option>
                    ))}
                </select>
            </label>

            <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="comparison">
                <span className="text-alloy-midnight/45">Compare:</span>
                <select
                    value={compareOn ? "prior" : "off"}
                    disabled={isPending}
                    onChange={(e) =>
                        patch({
                            comparisonPeriod:
                                e.target.value === "prior" ? { version: 1, kind: "month_over_month" } : undefined,
                        })
                    }
                    className={controlClass}
                >
                    <option value="off">Off</option>
                    <option value="prior">Prior period</option>
                </select>
            </label>

            <span className="ml-auto text-[11px] text-alloy-midnight/45" aria-live="polite">
                {isPending ? "Updating…" : "Filters persist in the URL and re-resolve live data."}
            </span>
        </div>
    );
}
