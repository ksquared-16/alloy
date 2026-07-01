import type { MetricTimeWindowKey } from "@/lib/metrics/types";

export function parseMetricTimeWindow(raw: string | null | undefined): MetricTimeWindowKey | null {
    const t = raw?.trim();
    if (t === "rolling_24h" || t === "rolling_7d" || t === "rolling_30d") return t;
    return null;
}

export function resolveMetricTimeWindowBounds(
    window: MetricTimeWindowKey,
    now: Date = new Date()
): { windowStart: Date; windowEnd: Date } {
    const windowEnd = now;
    const windowStart = new Date(now.getTime());
    switch (window) {
        case "rolling_24h":
            windowStart.setHours(windowStart.getHours() - 24);
            break;
        case "rolling_7d":
            windowStart.setDate(windowStart.getDate() - 7);
            break;
        case "rolling_30d":
            windowStart.setDate(windowStart.getDate() - 30);
            break;
        default:
            windowStart.setDate(windowStart.getDate() - 30);
    }
    return { windowStart, windowEnd };
}
