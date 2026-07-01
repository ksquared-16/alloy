import {
    deriveMetricCategoryFromSource,
    normalizeMetricCategoryKey,
    type MetricCategoryKey,
} from "@/lib/metrics/platform/metricCategory";
import type { MetricDefinitionRow } from "@/lib/metrics/platform/types";

export type MetricForm = {
    key: string;
    label: string;
    description: string;
    category: MetricCategoryKey;
    source_key: string;
    aggregation: string;
    unit: string;
    precision: number;
    is_kpi: boolean;
    period_days: number;
    target_min_rate: string;
    healthy_min_rate: string;
    warning_min_rate: string;
    target_max_count: string;
    healthy_max_count: string;
    warning_max_count: string;
    direction: "higher_is_better" | "lower_is_better";
};

export const EMPTY_METRIC_FORM: MetricForm = {
    key: "",
    label: "",
    description: "",
    category: "enrollment",
    source_key: "enrollment.tour_conversion_rate",
    aggregation: "rate",
    unit: "percent",
    precision: 1,
    is_kpi: true,
    period_days: 30,
    target_min_rate: "0.65",
    healthy_min_rate: "0.65",
    warning_min_rate: "0.50",
    target_max_count: "10",
    healthy_max_count: "10",
    warning_max_count: "25",
    direction: "higher_is_better",
};

export function rowToForm(row: MetricDefinitionRow): MetricForm {
    const period = row.default_period_config;
    const target = row.target_config;
    const thresholds = row.threshold_config;
    return {
        key: row.key,
        label: row.label,
        description: row.description,
        category: normalizeMetricCategoryKey(row.category),
        source_key: row.source_key,
        aggregation: row.aggregation,
        unit: row.unit,
        precision: row.precision,
        is_kpi: row.is_kpi,
        period_days: period?.days ?? 30,
        target_min_rate: String(target?.targetMinRate ?? thresholds?.healthyMinRate ?? ""),
        healthy_min_rate: String(thresholds?.healthyMinRate ?? ""),
        warning_min_rate: String(thresholds?.warningMinRate ?? ""),
        target_max_count: String(target?.targetMaxCount ?? thresholds?.healthyMaxCount ?? ""),
        healthy_max_count: String(thresholds?.healthyMaxCount ?? ""),
        warning_max_count: String(thresholds?.warningMaxCount ?? ""),
        direction: target?.direction ?? "higher_is_better",
    };
}

export function formToPayload(form: MetricForm, status: string) {
    const isRate = form.aggregation === "rate";
    return {
        key: form.key.trim(),
        label: form.label.trim(),
        description: form.description.trim(),
        category: form.category,
        entity_scope: "org" as const,
        source_type: "oip_adapter" as const,
        source_key: form.source_key,
        aggregation: form.aggregation,
        filter_config: { version: 1 as const },
        dimension_config: { version: 1 as const },
        default_period_config: { version: 1 as const, kind: "rolling" as const, days: form.period_days },
        unit: form.unit,
        precision: form.precision,
        is_kpi: form.is_kpi,
        target_config: form.is_kpi
            ? isRate
                ? {
                      version: 1 as const,
                      kind: "rate_min" as const,
                      targetMinRate: parseFloat(form.target_min_rate) || 0,
                      direction: form.direction,
                  }
                : {
                      version: 1 as const,
                      kind: "count_max" as const,
                      targetMaxCount: parseInt(form.target_max_count, 10) || 0,
                      direction: form.direction,
                  }
            : null,
        threshold_config: form.is_kpi
            ? isRate
                ? {
                      version: 1 as const,
                      healthyMinRate: parseFloat(form.healthy_min_rate) || 0,
                      warningMinRate: parseFloat(form.warning_min_rate) || 0,
                  }
                : {
                      version: 1 as const,
                      healthyMaxCount: parseInt(form.healthy_max_count, 10) || 0,
                      warningMaxCount: parseInt(form.warning_max_count, 10) || 0,
                  }
            : null,
        status,
        version: 1 as const,
    };
}

export { deriveMetricCategoryFromSource };
