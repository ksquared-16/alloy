/**
 * Operational Intelligence surface — serializable view model + pure assembly helpers.
 *
 * This module is server/client-shared and contains NO server imports, so the client
 * shell can import the types and tests can exercise the pure builders without a DB.
 */

import type { MetricHealthState } from "@/lib/metrics/platform/types";
import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";

export type OperationalMetricCard = {
    key: OipMetricKey;
    label: string;
    /** Operational question from the Operational Calculation descriptor. */
    question: string;
    value: number | null;
    formattedValue: string;
    format: string;
    health: MetricHealthState;
    /** True when the underlying OIP fact is a bounded/capped scan, not exhaustive truth. */
    bounded: boolean;
    drillHref: string | null;
    drillLabel: string | null;
};

export type OperationalBreakdownBar = {
    label: string;
    statusKey: string;
    value: number;
    formatted: string;
    drillHref: string | null;
};

export type OperationalAffectedWorkItem = {
    id: string;
    title: string;
    detail: string;
    badge?: string;
    drillHref: string | null;
};

export type OperationalSurfaceModel = {
    windowKey: MetricTimeWindowKey;
    windowLabel: string;
    siteLabel: string;
    metrics: OperationalMetricCard[];
    breakdown: {
        title: string;
        question: string;
        bars: OperationalBreakdownBar[];
        bounded: boolean;
        note: string;
    };
    affectedWork: OperationalAffectedWorkItem[];
    /** Surfaced to the operator: what is real vs. degraded. */
    dataNotes: string[];
};

/** Map a KPI status string (or absence) onto a health state. */
export function healthFromKpiStatus(status: string | null | undefined): MetricHealthState {
    if (status === "healthy" || status === "warning" || status === "critical") return status;
    return "unknown";
}

export type StatusCount = { statusKey: string; count: number };

/**
 * Assemble breakdown bars from raw status counts + a label map, ordered by count
 * descending and capped. `drillHrefFor` resolves each segment's drill (may return null).
 */
export function assembleBreakdownBars(
    counts: StatusCount[],
    labelFor: (statusKey: string) => string,
    drillHrefFor: (statusKey: string) => string | null,
    limit = 8,
): OperationalBreakdownBar[] {
    return [...counts]
        .filter((c) => c.statusKey.trim() !== "" && c.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((c) => ({
            label: labelFor(c.statusKey),
            statusKey: c.statusKey,
            value: c.count,
            formatted: String(c.count),
            drillHref: drillHrefFor(c.statusKey),
        }));
}

/** Tally a flat list of status keys into counts. */
export function tallyStatusCounts(statusKeys: Array<string | null | undefined>): StatusCount[] {
    const map = new Map<string, number>();
    for (const raw of statusKeys) {
        const key = String(raw ?? "").trim();
        if (!key) continue;
        map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([statusKey, count]) => ({ statusKey, count }));
}

/** Build the affected-work list from the top breakdown segments (real queues + counts). */
export function affectedWorkFromBreakdown(bars: OperationalBreakdownBar[], limit = 4): OperationalAffectedWorkItem[] {
    return bars.slice(0, limit).map((bar) => ({
        id: `status-${bar.statusKey}`,
        title: bar.label,
        detail: `${bar.value} open in this stage`,
        badge: bar.formatted,
        drillHref: bar.drillHref,
    }));
}
