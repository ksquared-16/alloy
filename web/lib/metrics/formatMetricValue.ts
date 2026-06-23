import type { MetricFormat } from "@/lib/metrics/types";

/** Format duration stored as hours (fractional). */
export function formatDurationHours(hours: number | null): string {
    if (hours == null || !Number.isFinite(hours)) return "—";
    if (hours < 1) {
        const minutes = Math.round(hours * 60);
        return `${minutes}m`;
    }
    if (hours < 48) {
        return `${hours.toFixed(1)}h`;
    }
    const days = hours / 24;
    return `${days.toFixed(1)}d`;
}

export function formatPercentRate(rate: number | null): string {
    if (rate == null || !Number.isFinite(rate)) return "—";
    return `${(rate * 100).toFixed(1)}%`;
}

export function formatCount(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return String(Math.round(value));
}

export function formatMetricValue(format: MetricFormat, value: number | null): string {
    switch (format) {
        case "duration":
            return formatDurationHours(value);
        case "percent":
        case "rate":
            return formatPercentRate(value);
        case "count":
            return formatCount(value);
        case "currency":
            return value == null ? "—" : `$${value.toFixed(2)}`;
        default:
            return value == null ? "—" : String(value);
    }
}
