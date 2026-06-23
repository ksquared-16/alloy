import { resolveKpiTargetConfig, getKpiDefinition } from "@/lib/metrics/kpiRegistry";
import type {
    KpiHealthStatus,
    KpiTargetConfig,
    KpiTargetKind,
    OipKpiKey,
    ResolvedKpiEvaluation,
    ResolvedMetricValue,
} from "@/lib/metrics/types";

export function evaluateDurationKpiHealth(
    observedHours: number | null,
    target: KpiTargetConfig
): KpiHealthStatus {
    if (observedHours == null || !Number.isFinite(observedHours)) return "unknown";
    const healthyMax = target.thresholds.healthyMaxHours ?? target.targetMaxHours ?? Infinity;
    const warningMax = target.thresholds.warningMaxHours ?? healthyMax;
    if (observedHours <= healthyMax) return "healthy";
    if (observedHours <= warningMax) return "warning";
    return "critical";
}

export function evaluateRateMinKpiHealth(
    observedRate: number | null,
    target: KpiTargetConfig
): KpiHealthStatus {
    if (observedRate == null || !Number.isFinite(observedRate)) return "unknown";
    const healthyMin = target.thresholds.healthyMinRate ?? target.targetMinRate ?? 0;
    const warningMin = target.thresholds.warningMinRate ?? healthyMin;
    if (observedRate >= healthyMin) return "healthy";
    if (observedRate >= warningMin) return "warning";
    return "critical";
}

export function evaluateCountMaxKpiHealth(
    observedCount: number | null,
    target: KpiTargetConfig
): KpiHealthStatus {
    if (observedCount == null || !Number.isFinite(observedCount)) return "unknown";
    const healthyMax = target.thresholds.healthyMaxCount ?? target.targetMaxCount ?? Infinity;
    const warningMax = target.thresholds.warningMaxCount ?? healthyMax;
    if (observedCount <= healthyMax) return "healthy";
    if (observedCount <= warningMax) return "warning";
    return "critical";
}

export function evaluateKpiHealth(
    target: KpiTargetConfig,
    observed: {
        hours?: number | null;
        rate?: number | null;
        count?: number | null;
    }
): KpiHealthStatus {
    switch (target.kind) {
        case "duration_max_hours":
            return evaluateDurationKpiHealth(observed.hours ?? null, target);
        case "rate_min":
            return evaluateRateMinKpiHealth(observed.rate ?? null, target);
        case "count_max":
            return evaluateCountMaxKpiHealth(observed.count ?? null, target);
        default:
            return "unknown";
    }
}

export function evaluateKpiForMetric(params: {
    kpiKey: OipKpiKey;
    metric: ResolvedMetricValue;
    orgMetadata?: unknown;
}): ResolvedKpiEvaluation {
    const def = getKpiDefinition(params.kpiKey);
    const target = resolveKpiTargetConfig(params.kpiKey, params.orgMetadata);
    const m = params.metric;

    let observed: { hours?: number | null; rate?: number | null; count?: number | null };
    if (target.kind === "duration_max_hours") {
        observed = { hours: m.value };
    } else if (target.kind === "rate_min") {
        observed = { rate: m.value };
    } else {
        observed = { count: m.value };
    }

    const status = evaluateKpiHealth(target, observed);

    return {
        key: params.kpiKey,
        label: def.label,
        metricKey: def.metricKey,
        status,
        targetKind: target.kind as KpiTargetKind,
        targetMaxHours: target.targetMaxHours,
        targetMinRate: target.targetMinRate,
        targetMaxCount: target.targetMaxCount,
        thresholds: target.thresholds,
        observedValueHours: target.kind === "duration_max_hours" ? m.value : null,
        observedValueRate: target.kind === "rate_min" ? m.value : null,
        observedValueCount: target.kind === "count_max" ? m.value : null,
    };
}

export function evaluateKpiForMetricValue(params: {
    kpiKey: OipKpiKey;
    observedValueHours?: number | null;
    orgMetadata?: unknown;
}): ResolvedKpiEvaluation {
    const def = getKpiDefinition(params.kpiKey);
    const target = resolveKpiTargetConfig(params.kpiKey, params.orgMetadata);
    const status = evaluateDurationKpiHealth(params.observedValueHours ?? null, target);
    return {
        key: params.kpiKey,
        label: def.label,
        metricKey: def.metricKey,
        status,
        targetKind: target.kind,
        targetMaxHours: target.targetMaxHours,
        thresholds: target.thresholds,
        observedValueHours: params.observedValueHours ?? null,
    };
}
