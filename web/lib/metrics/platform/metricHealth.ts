import type {
    MetricHealthState,
    MetricTargetConfig,
    MetricThresholdConfig,
} from "@/lib/metrics/platform/types";

export function evaluatePlatformMetricHealth(params: {
    value: number | null;
    target: MetricTargetConfig | null;
    thresholds: MetricThresholdConfig | null;
}): MetricHealthState {
    const { value, target, thresholds } = params;
    if (value == null || !Number.isFinite(value)) return "unknown";
    if (!target && !thresholds) return "unknown";

    const kind = target?.kind;
    const t: MetricThresholdConfig = thresholds ?? { version: 1 };

    switch (kind) {
        case "duration_max_hours": {
            const healthyMax = t.healthyMaxHours ?? target?.targetMaxHours ?? Infinity;
            const warningMax = t.warningMaxHours ?? healthyMax;
            if (value <= healthyMax) return "healthy";
            if (value <= warningMax) return "warning";
            return "critical";
        }
        case "rate_min": {
            const healthyMin = t.healthyMinRate ?? target?.targetMinRate ?? 0;
            const warningMin = t.warningMinRate ?? healthyMin;
            if (value >= healthyMin) return "healthy";
            if (value >= warningMin) return "warning";
            return "critical";
        }
        case "rate_max": {
            const healthyMax = t.healthyMaxRate ?? target?.targetMaxRate ?? Infinity;
            const warningMax = t.warningMaxRate ?? healthyMax;
            if (value <= healthyMax) return "healthy";
            if (value <= warningMax) return "warning";
            return "critical";
        }
        case "count_max": {
            const healthyMax = t.healthyMaxCount ?? target?.targetMaxCount ?? Infinity;
            const warningMax = t.warningMaxCount ?? healthyMax;
            if (value <= healthyMax) return "healthy";
            if (value <= warningMax) return "warning";
            return "critical";
        }
        case "count_min": {
            const healthyMin = target?.targetMinCount ?? 0;
            if (value >= healthyMin) return "healthy";
            return "warning";
        }
        default:
            return "unknown";
    }
}

export function healthStateLabel(state: MetricHealthState): string {
    switch (state) {
        case "healthy":
            return "Healthy";
        case "warning":
            return "Warning";
        case "critical":
            return "Critical";
        default:
            return "Unknown";
    }
}
