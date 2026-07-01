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
import { OPERATIONAL_PULSE_STRIP_KEYS } from "@/lib/kpi/workspaceKpiPresentation";
import { listAvailableMetricPacks } from "@/lib/metrics/packs";
import { formatTargetFromKpi } from "@/lib/metrics/oipKpiObjectPresentation";

/** Code-owned workspace OIP strip keys when no DB placement rows exist — operational pulse only. */
export const DEFAULT_WORKSPACE_OIP_STRIP_KEYS: readonly MetricKey[] = OPERATIONAL_PULSE_STRIP_KEYS;

export function resolveWorkspaceOipMetricKeys(
    placementRows: WorkspaceKpiPlacementRow[] | undefined,
    scopeHasPlacementRows: boolean
): OipMetricKey[] {
    const fromPlacements = placementRows?.length ? extractOipMetricKeysFromPlacements(placementRows) : [];
    if (scopeHasPlacementRows && fromPlacements.length) return fromPlacements;

    const defaults = DEFAULT_WORKSPACE_OIP_STRIP_KEYS.map((k) => oipMetricKeyForStripKey(k)).filter(
        (k): k is OipMetricKey => k != null
    );
    const packKeys = listAvailableMetricPacks().flatMap((p) => p.metricKeys) as OipMetricKey[];
    const merged = [...fromPlacements];
    for (const key of [...defaults, ...packKeys]) {
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

/** Code-owned work-unit OIP strip keys — operational pulse only. */
export const DEFAULT_WORK_UNIT_OIP_STRIP_KEYS: readonly MetricKey[] = OPERATIONAL_PULSE_STRIP_KEYS;

export function resolveWorkUnitOipMetricKeys(placementRows: WorkspaceKpiPlacementRow[] | undefined): OipMetricKey[] {
    const fromPlacements = placementRows?.length ? extractOipMetricKeysFromPlacements(placementRows) : [];
    const defaults = DEFAULT_WORK_UNIT_OIP_STRIP_KEYS.map((k) => oipMetricKeyForStripKey(k)).filter(
        (k): k is OipMetricKey => k != null
    );
    const merged = [...fromPlacements];
    for (const key of defaults) {
        if (!merged.includes(key)) merged.push(key);
    }
    return merged;
}

export function appendWorkUnitOipKpis(
    strip: KPIVm[],
    resolved: ResolvedMetricMap,
    stripKeys: readonly MetricKey[] = DEFAULT_WORK_UNIT_OIP_STRIP_KEYS
): KPIVm[] {
    return appendWorkspaceOipKpis(strip, resolved, stripKeys);
}

export function filterOipKpiCells(kpis: KPIVm[]): KPIVm[] {
    return kpis.filter((k) => k.id.startsWith("oip."));
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
            targetDisplay: formatTargetFromKpi(item?.kpi) ?? undefined,
            kpiStatus: item?.kpi?.status,
        });
    }

    return appended.length ? [...strip, ...appended] : strip;
}

function metricDisplay(
    key: OipMetricKey,
    resolved: ResolvedMetricMap
): { label: string; value: string; target?: string; status?: string } {
    const item = resolved[key];
    return {
        label: item?.label ?? key,
        value: item?.formatted_value ?? "—",
        target: formatTargetFromKpi(item?.kpi) ?? undefined,
        status: item?.kpi?.status,
    };
}

/** Light teaser stats for process navigation tiles — max two inline stats, no KPI cards. */
export function enrichLifecycleCardsWithOipMetrics(
    cards: readonly OperatorLifecycleLandingCard[],
    resolved: ResolvedMetricMap
): OperatorLifecycleLandingCard[] {
    return cards.map((card) => {
        const processKey = card.processKey.trim().toLowerCase();
        const metrics: { label: string; value: string }[] = [];

        if (processKey.includes("enroll")) {
            metrics.push(metricDisplay("enrollment.tour_conversion_rate", resolved));
            metrics.push(metricDisplay("ops.needs_attention_count", resolved));
        } else if (processKey.includes("form")) {
            metrics.push(metricDisplay("forms.completion_rate", resolved));
        } else if (processKey.includes("communic")) {
            metrics.push(metricDisplay("ops.needs_attention_count", resolved));
        } else if (processKey.includes("operational") || processKey.includes("health")) {
            metrics.push(metricDisplay("ops.work_overdue_count", resolved));
            metrics.push(metricDisplay("ops.needs_attention_count", resolved));
        }

        const performanceMetrics = metrics.slice(0, 2);
        if (!performanceMetrics.length) return card;
        return { ...card, performanceMetrics };
    });
}
