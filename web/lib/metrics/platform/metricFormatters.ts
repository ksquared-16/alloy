import type { MetricUnit } from "@/lib/metrics/platform/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import type { MetricFormat } from "@/lib/metrics/types";

export function platformUnitToFormat(unit: MetricUnit): MetricFormat {
    switch (unit) {
        case "percent":
        case "rate":
            return "percent";
        case "count":
            return "count";
        case "currency":
            return "currency";
        case "duration":
            return "duration";
        default:
            return "count";
    }
}

export function formatPlatformMetricValue(unit: MetricUnit, value: number | null, precision = 0): string {
    if (value == null || !Number.isFinite(value)) return "—";
    const format = platformUnitToFormat(unit);
    if (format === "percent" && precision > 0) {
        return `${(value * 100).toFixed(precision)}%`;
    }
    return formatMetricValue(format, value);
}

export function formatDeltaPercent(deltaPercent: number | null, precision = 1): string {
    if (deltaPercent == null || !Number.isFinite(deltaPercent)) return "—";
    const sign = deltaPercent > 0 ? "+" : "";
    return `${sign}${deltaPercent.toFixed(precision)}%`;
}

export function formatDeltaValue(delta: number | null, unit: MetricUnit, precision = 0): string {
    if (delta == null || !Number.isFinite(delta)) return "—";
    const sign = delta > 0 ? "+" : "";
    return `${sign}${formatPlatformMetricValue(unit, Math.abs(delta), precision)}`.replace("—", "0");
}
