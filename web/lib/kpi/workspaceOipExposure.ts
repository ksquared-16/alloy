import type { MetricKey, WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { getMetricDefinition } from "@/lib/kpi/registry";
import {
    extractOipMetricKeysFromPlacements,
    oipMetricKeyForStripKey,
    type OipMetricStripValues,
} from "@/lib/kpi/oipBridge";

/** Code-owned workspace OIP strip keys when no DB placement rows exist. */
export const DEFAULT_WORKSPACE_OIP_STRIP_KEYS: readonly MetricKey[] = [
    "oip.enrollment.tour_conversion_rate",
    "oip.enrollment.time_to_schedule_tour",
    "oip.ops.work_overdue_count",
    "oip.forms.completion_rate",
];

export function resolveWorkspaceOipMetricKeys(
    placementRows: WorkspaceKpiPlacementRow[] | undefined,
    scopeHasPlacementRows: boolean
): OipMetricKey[] {
    const fromPlacements = placementRows?.length ? extractOipMetricKeysFromPlacements(placementRows) : [];
    if (scopeHasPlacementRows && fromPlacements.length) return fromPlacements;

    const defaults = DEFAULT_WORKSPACE_OIP_STRIP_KEYS.map((k) => oipMetricKeyForStripKey(k)).filter(
        (k): k is OipMetricKey => k != null
    );
    const merged = [...fromPlacements];
    for (const key of defaults) {
        if (!merged.includes(key)) merged.push(key);
    }
    return merged;
}

export function resolvedMetricsToStripValues(resolved: ResolvedMetricMap): OipMetricStripValues {
    const out = {} as OipMetricStripValues;
    for (const [key, item] of Object.entries(resolved)) {
        if (item?.formatted_value) {
            out[key as OipMetricKey] = item.formatted_value;
        }
    }
    return out;
}

function kpiToneFromStatus(status: string | undefined): KPIVm["tone"] {
    if (status === "healthy") return "positive";
    if (status === "warning" || status === "critical") return "risk";
    return "neutral";
}

/** Append default OIP KPI cells not already present in the strip. */
export function appendWorkspaceOipKpis(
    strip: KPIVm[],
    resolved: ResolvedMetricMap,
    stripKeys: readonly MetricKey[] = DEFAULT_WORKSPACE_OIP_STRIP_KEYS
): KPIVm[] {
    const existing = new Set(strip.map((k) => k.id));
    const appended: KPIVm[] = [];

    for (const stripKey of stripKeys) {
        const oipKey = oipMetricKeyForStripKey(stripKey);
        if (!oipKey || existing.has(stripKey)) continue;
        const def = getMetricDefinition(stripKey);
        const item = resolved[oipKey];
        appended.push({
            id: stripKey,
            label: def.defaultLabel,
            value: item?.formatted_value ?? "—",
            lane: def.defaultLane ?? "business",
            tone: kpiToneFromStatus(item?.kpi?.status),
        });
    }

    return appended.length ? [...strip, ...appended] : strip;
}

function metricDisplay(key: OipMetricKey, resolved: ResolvedMetricMap): { label: string; value: string } {
    const item = resolved[key];
    return {
        label: item?.label ?? key,
        value: item?.formatted_value ?? "—",
    };
}

/** Light performance metrics for lifecycle command tiles — max 2 per card. */
export function enrichLifecycleCardsWithOipMetrics(
    cards: readonly OperatorLifecycleLandingCard[],
    resolved: ResolvedMetricMap
): OperatorLifecycleLandingCard[] {
    return cards.map((card) => {
        const processKey = card.processKey.trim().toLowerCase();
        const metrics: { label: string; value: string }[] = [];

        if (processKey.includes("enroll")) {
            metrics.push(metricDisplay("enrollment.time_to_schedule_tour", resolved));
            metrics.push(metricDisplay("enrollment.tour_conversion_rate", resolved));
            if (metrics.length < 2) {
                metrics.push(metricDisplay("forms.completion_rate", resolved));
            }
        }

        if (processKey.includes("form")) {
            metrics.push(metricDisplay("forms.completion_rate", resolved));
        }

        if (processKey.includes("operational") || processKey.includes("health")) {
            metrics.push(metricDisplay("ops.work_overdue_count", resolved));
            metrics.push(metricDisplay("ops.needs_attention_count", resolved));
        }

        const performanceMetrics = metrics.slice(0, 2);
        if (!performanceMetrics.length) return card;
        return { ...card, performanceMetrics };
    });
}
