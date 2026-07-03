/**
 * Presentation Runtime V2 — Workspace Process "Primary Signal".
 *
 * A process has NO universal health score. It has ONE configurable Primary Signal — a
 * selected Operational Calculation. The calculation (registry) owns meaning; the resolved
 * metric owns value + state; this module assembles a domain-neutral `PrimarySignalModel`
 * the ProcessSummaryCard renders. The renderer never classifies and never assumes health.
 *
 * Availability of signals per process comes from the Operational Calculations registry
 * (`listCalculationsByBusinessProcess`, consumers ⊇ business_process_tile) — the same source
 * the Surface Builder's Primary Signal picker reads. Nothing here is hardcoded per process.
 */

import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import type { OperationalCalculationBusinessProcess } from "@/lib/analytics/calculations/types";
import {
    findOperationalCalculation,
    listCalculationsByBusinessProcess,
} from "@/lib/analytics/calculations/registry";
import { formatTargetFromKpi } from "@/lib/metrics/oipKpiObjectPresentation";
import { drillHrefForMetricKey, type PrimarySignalModel, type SignalState } from "./types";

export type { PrimarySignalModel, SignalState };

/** Map a process's key to its Operational Calculation business process (registry domain). */
export function businessProcessForProcessKey(
    processKey: string | null | undefined,
): OperationalCalculationBusinessProcess | null {
    const k = (processKey ?? "").toLowerCase();
    if (!k) return null;
    if (k.includes("enroll")) return "enrollment";
    if (k.includes("form")) return "forms";
    if (k.includes("communic")) return "communications";
    if (k.includes("capacity") || k.includes("utiliz")) return "capacity";
    if (k.includes("financ") || k.includes("revenue") || k.includes("billing")) return "financial";
    if (k.includes("operational") || k.includes("health") || k.includes("labor")) return "operational_health";
    return null;
}

/** Active calculations consumable on a process tile, for a business process. */
export function signalsForBusinessProcess(bp: OperationalCalculationBusinessProcess) {
    return listCalculationsByBusinessProcess(bp).filter(
        (c) => c.status === "active" && c.consumers.includes("business_process_tile"),
    );
}

/** Signals selectable for a process — active calculations consumable on the process tile. */
export function availableSignalsForProcess(processKey: string | null | undefined) {
    const bp = businessProcessForProcessKey(processKey);
    if (!bp) return [];
    return signalsForBusinessProcess(bp);
}

/**
 * The business processes the Surface Builder offers a Primary Signal for, with operator-facing
 * labels. Only those with at least one tile-consumable calculation are shown (registry-driven).
 */
export const WORKSPACE_SIGNAL_BUSINESS_PROCESSES: {
    businessProcess: OperationalCalculationBusinessProcess;
    label: string;
}[] = [
    { businessProcess: "enrollment", label: "Enrollment" },
    { businessProcess: "operational_health", label: "Operational Health" },
    { businessProcess: "communications", label: "Communications" },
    { businessProcess: "forms", label: "Forms" },
    { businessProcess: "capacity", label: "Capacity" },
    { businessProcess: "financial", label: "Financial" },
];

/** The default signal key for a process when none is configured (first available; null if none). */
export function defaultSignalKeyForProcess(processKey: string | null | undefined): string | null {
    return availableSignalsForProcess(processKey)[0]?.key ?? null;
}

/** OIP KPI status → canonical display state (localization only — no value inspection). */
export function signalStateFromKpiStatus(status: string | null | undefined): SignalState {
    switch (status) {
        case "healthy":
            return "healthy";
        case "warning":
            return "caution";
        case "critical":
            return "critical";
        default:
            return "neutral";
    }
}

/** Frame the signal label by its canonical state (presentation phrasing, no trend claim). */
export function signalAnswerText(label: string, state: SignalState): string {
    switch (state) {
        case "healthy":
            return `${label} on track`;
        case "caution":
            return `${label} needs attention`;
        case "critical":
            return `${label} needs action`;
        default:
            return label;
    }
}

/**
 * Assemble the Primary Signal for a configured calculation key + its resolved metric. Pure.
 * `item` absent (unresolved) → a neutral signal that still names the calculation. Never
 * fabricates value, state, or trend.
 */
export function resolvePrimarySignal(
    key: string,
    item: MetricResolveApiItem | undefined | null,
): PrimarySignalModel | null {
    const calc = findOperationalCalculation(key);
    const label = calc?.label ?? item?.label ?? key;
    const state = signalStateFromKpiStatus(item?.kpi?.status);
    const formatted =
        typeof item?.formatted_value === "string" ? item.formatted_value.trim() : "";
    const value = formatted && formatted !== "—" ? formatted : null;
    const target = formatTargetFromKpi(item?.kpi ?? null);
    return {
        key,
        label,
        answer: signalAnswerText(label, state),
        state,
        value,
        supportingContext: target ? `Target ${target}` : null,
        // Trend is not resolved by the metrics layer today — rendered only when present, never faked.
        trend: null,
        drillHref: drillHrefForMetricKey(key),
    };
}
