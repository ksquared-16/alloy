/**
 * Analytics window helpers — OIP supports three rolling windows; the Operational
 * Intelligence surface exposes those three.
 */

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

export function periodDaysForWindow(windowKey: MetricTimeWindowKey): number {
    return ANALYTICS_WINDOW_OPTIONS.find((o) => o.windowKey === windowKey)?.days ?? 30;
}

export function windowLabel(windowKey: MetricTimeWindowKey): string {
    return ANALYTICS_WINDOW_OPTIONS.find((o) => o.windowKey === windowKey)?.label ?? windowKey;
}
