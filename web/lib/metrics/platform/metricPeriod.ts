import type { MetricPeriodConfig, MetricPeriodKind } from "@/lib/metrics/platform/types";

export type MetricPeriodBounds = {
    periodStart: Date;
    periodEnd: Date;
    comparisonStart: Date | null;
    comparisonEnd: Date | null;
};

function addDays(d: Date, days: number): Date {
    const out = new Date(d);
    out.setUTCDate(out.getUTCDate() + days);
    return out;
}

function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcWeek(d: Date): Date {
    const day = d.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    return addDays(startOfUtcDay(d), -diff);
}

function startOfUtcMonth(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfUtcQuarter(d: Date): Date {
    const q = Math.floor(d.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(d.getUTCFullYear(), q, 1));
}

export function resolveMetricPeriodBounds(period: MetricPeriodConfig, now: Date = new Date()): MetricPeriodBounds {
    const end = now;
    switch (period.kind) {
        case "rolling": {
            const days = period.days ?? 30;
            const start = addDays(end, -days);
            const compEnd = start;
            const compStart = addDays(compEnd, -days);
            return { periodStart: start, periodEnd: end, comparisonStart: compStart, comparisonEnd: compEnd };
        }
        case "week_over_week": {
            const start = startOfUtcWeek(end);
            const prevEnd = start;
            const prevStart = addDays(prevEnd, -7);
            return { periodStart: start, periodEnd: end, comparisonStart: prevStart, comparisonEnd: prevEnd };
        }
        case "month_over_month": {
            const start = startOfUtcMonth(end);
            const prevEnd = start;
            const prevStart = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth() - 1, 1));
            return { periodStart: start, periodEnd: end, comparisonStart: prevStart, comparisonEnd: prevEnd };
        }
        case "quarter_over_quarter": {
            const start = startOfUtcQuarter(end);
            const prevEnd = start;
            const prevStart = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth() - 3, 1));
            return { periodStart: start, periodEnd: end, comparisonStart: prevStart, comparisonEnd: prevEnd };
        }
        case "custom": {
            const start = period.startIso ? new Date(period.startIso) : addDays(end, -30);
            const customEnd = period.endIso ? new Date(period.endIso) : end;
            return { periodStart: start, periodEnd: customEnd, comparisonStart: null, comparisonEnd: null };
        }
        default: {
            const _exhaustive: never = period.kind;
            throw new Error(`Unhandled period kind: ${_exhaustive}`);
        }
    }
}

export function rollingPeriodDays(days: 7 | 30 | 90): MetricPeriodConfig {
    return { version: 1, kind: "rolling", days };
}

export function periodKindLabel(kind: MetricPeriodKind): string {
    switch (kind) {
        case "rolling":
            return "Rolling period";
        case "week_over_week":
            return "Week over week";
        case "month_over_month":
            return "Month over month";
        case "quarter_over_quarter":
            return "Quarter over quarter";
        case "custom":
            return "Custom period";
        default:
            return kind;
    }
}

export function metricPeriodToWindowKey(period: MetricPeriodConfig): "rolling_7d" | "rolling_30d" | "rolling_24h" {
    if (period.kind === "rolling") {
        if (period.days === 7) return "rolling_7d";
        if (period.days === 1) return "rolling_24h";
    }
    return "rolling_30d";
}
