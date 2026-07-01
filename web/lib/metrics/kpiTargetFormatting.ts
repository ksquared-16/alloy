import type { KpiTargetConfig, OipKpiKey } from "@/lib/metrics/types";
import { getKpiDefinition } from "@/lib/metrics/kpiRegistry";

export function formatKpiTargetDisplay(kpiKey: OipKpiKey, target: KpiTargetConfig): string {
    switch (target.kind) {
        case "duration_max_hours":
            return `${target.targetMaxHours ?? target.thresholds.healthyMaxHours ?? "—"}h`;
        case "rate_min": {
            const rate = target.targetMinRate ?? target.thresholds.healthyMinRate;
            return rate != null ? `${Math.round(rate * 100)}%` : "—";
        }
        case "count_max":
            return `≤ ${target.targetMaxCount ?? target.thresholds.healthyMaxCount ?? "—"}`;
        default:
            return "—";
    }
}

export function formatKpiTargetHint(kpiKey: OipKpiKey): string {
    const def = getKpiDefinition(kpiKey);
    switch (def.defaultTarget.kind) {
        case "duration_max_hours":
            return "Maximum hours (lower is better)";
        case "rate_min":
            return "Minimum rate (higher is better)";
        case "count_max":
            return "Maximum count (lower is better)";
        default:
            return "";
    }
}
