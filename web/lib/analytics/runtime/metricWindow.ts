/**
 * Map an AnalyticsContext date range (MetricPeriodConfig) onto the OIP-supported
 * rolling window keys. OIP today supports three rolling windows; the Analytics
 * filter bar exposes those three and round-trips them through the URL codec as
 * `period=rolling&period_days=N`.
 */

import type { MetricPeriodConfig } from "@/lib/metrics/platform/types";
import type { MetricTimeWindowKey } from "@/lib/metrics/types";

export type AnalyticsWindowOption = {
    windowKey: MetricTimeWindowKey;
    days: number;
    label: string;
};

export const ANALYTICS_WINDOW_OPTIONS: readonly AnalyticsWindowOption[] = [
    { windowKey: "rolling_24h", days: 1, label: "Last 24 hours" },
    { windowKey: "rolling_7d", days: 7, label: "Last 7 days" },
    { windowKey: "rolling_30d", days: 30, label: "Last 30 days" },
];

export const DEFAULT_ANALYTICS_WINDOW: MetricTimeWindowKey = "rolling_30d";

/** Resolve a period config to the nearest supported rolling window (snaps by day count). */
export function metricWindowFromPeriod(period: MetricPeriodConfig | undefined): MetricTimeWindowKey {
    const days = period?.days;
    if (days == null) return DEFAULT_ANALYTICS_WINDOW;
    if (days <= 1) return "rolling_24h";
    if (days <= 7) return "rolling_7d";
    return "rolling_30d";
}

export function periodDaysForWindow(windowKey: MetricTimeWindowKey): number {
    return ANALYTICS_WINDOW_OPTIONS.find((o) => o.windowKey === windowKey)?.days ?? 30;
}

export function windowLabel(windowKey: MetricTimeWindowKey): string {
    return ANALYTICS_WINDOW_OPTIONS.find((o) => o.windowKey === windowKey)?.label ?? windowKey;
}
