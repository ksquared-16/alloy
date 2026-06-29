/**
 * Operational Intelligence surface — serializable view model + pure assembly helpers.
 *
 * This module is server/client-shared and contains NO server imports, so the client
 * shell can import the types and tests can exercise the pure builders without a DB.
 */

import type { MetricHealthState, MetricTrendDirection } from "@/lib/metrics/platform/types";
import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

/** A prior-period comparison shown on a metric card (real, or honestly unavailable). */
export type MetricComparisonDisplay = {
    available: boolean;
    label: string;
    direction: MetricTrendDirection;
};

export type SiteOption = { id: string; label: string };

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
    /** Prior-period comparison, present only when the operator enabled comparison. */
    comparison?: MetricComparisonDisplay;
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
    siteId: string | null;
    siteLabel: string;
    siteOptions: SiteOption[];
    compareOn: boolean;
    /** Most recent metric computation time (ISO) for the freshness note. */
    freshnessIso: string | null;
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

/** The minimal trend shape the comparison display needs (avoids importing snapshot types). */
export type TrendForComparison = { hasTrend: boolean; trendLabel: string; direction: MetricTrendDirection } | null;

/**
 * Build a prior-period comparison display. Returns undefined when comparison is off,
 * an honest "not available" state when there is no prior snapshot, and the real delta
 * label otherwise. Never invents a delta.
 */
export function buildMetricComparison(
    trend: TrendForComparison,
    compareOn: boolean,
): MetricComparisonDisplay | undefined {
    if (!compareOn) return undefined;
    if (!trend || !trend.hasTrend) {
        return { available: false, label: "No prior snapshot yet", direction: "flat" };
    }
    return { available: true, label: trend.trendLabel, direction: trend.direction };
}

/** Resolve the access-scope site allowlist param (restricted → ids, all → null). No inaccessible exposure. */
export function siteAllowlistForScope(accessScope: AdminAccessScopeDimensions): string[] | null {
    if (accessScope.siteScope === "restricted") {
        return accessScope.allowedSiteLocationIds ?? [];
    }
    return null;
}

/** Human label for the selected site ("All sites" when none, the matched label otherwise). */
export function resolveSiteLabel(siteId: string | null, options: SiteOption[]): string {
    if (!siteId) return "All sites";
    return options.find((o) => o.id === siteId)?.label ?? "Selected site";
}

/** A drill href is navigable only when it is an internal app path (guards "#"/external). */
export function isInternalDrillHref(href: string | null | undefined): boolean {
    return typeof href === "string" && href.startsWith("/");
}

/** Accept a URL-supplied site id only when it is in the accessible option set (else null = All sites). */
export function sanitizeSiteId(requestedSiteId: string | null | undefined, options: SiteOption[]): string | null {
    if (!requestedSiteId) return null;
    return options.some((o) => o.id === requestedSiteId) ? requestedSiteId : null;
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
