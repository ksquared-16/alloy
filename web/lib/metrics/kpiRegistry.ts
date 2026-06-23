import type { KpiDefinition, KpiTargetConfig, OipKpiKey, OipMetricKey } from "@/lib/metrics/types";

const KPI_DEFINITIONS: Record<OipKpiKey, KpiDefinition> = {
    "enrollment.time_to_schedule_tour": {
        key: "enrollment.time_to_schedule_tour",
        label: "Time to schedule tour",
        metricKey: "enrollment.time_to_schedule_tour",
        pack: "enrollment",
        owner: "enrollment",
        defaultTarget: {
            metricKey: "enrollment.time_to_schedule_tour",
            kind: "duration_max_hours",
            targetMaxHours: 48,
            thresholds: { healthyMaxHours: 48, warningMaxHours: 72 },
        },
    },
    "enrollment.tour_conversion_rate": {
        key: "enrollment.tour_conversion_rate",
        label: "Tour conversion rate",
        metricKey: "enrollment.tour_conversion_rate",
        pack: "enrollment",
        owner: "enrollment",
        defaultTarget: {
            metricKey: "enrollment.tour_conversion_rate",
            kind: "rate_min",
            targetMinRate: 0.5,
            thresholds: { healthyMinRate: 0.5, warningMinRate: 0.3 },
        },
    },
    "comms.delivery_rate": {
        key: "comms.delivery_rate",
        label: "Delivery rate",
        metricKey: "comms.delivery_rate",
        pack: "communications",
        owner: "communications",
        defaultTarget: {
            metricKey: "comms.delivery_rate",
            kind: "rate_min",
            targetMinRate: 0.95,
            thresholds: { healthyMinRate: 0.95, warningMinRate: 0.9 },
        },
    },
    "forms.completion_rate": {
        key: "forms.completion_rate",
        label: "Form completion rate",
        metricKey: "forms.completion_rate",
        pack: "forms",
        owner: "forms",
        defaultTarget: {
            metricKey: "forms.completion_rate",
            kind: "rate_min",
            targetMinRate: 0.8,
            thresholds: { healthyMinRate: 0.8, warningMinRate: 0.6 },
        },
    },
    "ops.work_overdue_count": {
        key: "ops.work_overdue_count",
        label: "Overdue work",
        metricKey: "ops.work_overdue_count",
        pack: "operational_health",
        owner: "operations",
        defaultTarget: {
            metricKey: "ops.work_overdue_count",
            kind: "count_max",
            targetMaxCount: 5,
            thresholds: { healthyMaxCount: 5, warningMaxCount: 10 },
        },
    },
};

/** Phase 2: move to kpi_targets table; until then optional org_settings.metadata.kpi_targets overlay. */
export type OrgKpiTargetsMetadata = {
    kpi_targets?: Partial<
        Record<
            OipKpiKey,
            {
                target_max_hours?: number;
                healthy_max_hours?: number;
                warning_max_hours?: number;
                target_min_rate?: number;
                healthy_min_rate?: number;
                warning_min_rate?: number;
                target_max_count?: number;
                healthy_max_count?: number;
                warning_max_count?: number;
            }
        >
    >;
};

function mergeTarget(
    base: KpiTargetConfig,
    overlay:
        | {
              target_max_hours?: number;
              healthy_max_hours?: number;
              warning_max_hours?: number;
              target_min_rate?: number;
              healthy_min_rate?: number;
              warning_min_rate?: number;
              target_max_count?: number;
              healthy_max_count?: number;
              warning_max_count?: number;
          }
        | undefined
): KpiTargetConfig {
    if (!overlay) return base;
    return {
        ...base,
        targetMaxHours:
            typeof overlay.target_max_hours === "number" ? overlay.target_max_hours : base.targetMaxHours,
        targetMinRate:
            typeof overlay.target_min_rate === "number" ? overlay.target_min_rate : base.targetMinRate,
        targetMaxCount:
            typeof overlay.target_max_count === "number" ? overlay.target_max_count : base.targetMaxCount,
        thresholds: {
            healthyMaxHours:
                typeof overlay.healthy_max_hours === "number"
                    ? overlay.healthy_max_hours
                    : base.thresholds.healthyMaxHours,
            warningMaxHours:
                typeof overlay.warning_max_hours === "number"
                    ? overlay.warning_max_hours
                    : base.thresholds.warningMaxHours,
            healthyMinRate:
                typeof overlay.healthy_min_rate === "number"
                    ? overlay.healthy_min_rate
                    : base.thresholds.healthyMinRate,
            warningMinRate:
                typeof overlay.warning_min_rate === "number"
                    ? overlay.warning_min_rate
                    : base.thresholds.warningMinRate,
            healthyMaxCount:
                typeof overlay.healthy_max_count === "number"
                    ? overlay.healthy_max_count
                    : base.thresholds.healthyMaxCount,
            warningMaxCount:
                typeof overlay.warning_max_count === "number"
                    ? overlay.warning_max_count
                    : base.thresholds.warningMaxCount,
        },
    };
}

export function resolveKpiTargetConfig(kpiKey: OipKpiKey, orgMetadata?: unknown): KpiTargetConfig {
    const def = KPI_DEFINITIONS[kpiKey];
    const base = def.defaultTarget;
    const meta =
        orgMetadata && typeof orgMetadata === "object" && !Array.isArray(orgMetadata)
            ? (orgMetadata as OrgKpiTargetsMetadata)
            : null;
    return mergeTarget(base, meta?.kpi_targets?.[kpiKey]);
}

export function getKpiDefinition(key: OipKpiKey): KpiDefinition {
    return KPI_DEFINITIONS[key];
}

const METRIC_TO_KPI: Partial<Record<OipMetricKey, OipKpiKey>> = {
    "enrollment.time_to_schedule_tour": "enrollment.time_to_schedule_tour",
    "enrollment.tour_conversion_rate": "enrollment.tour_conversion_rate",
    "comms.delivery_rate": "comms.delivery_rate",
    "forms.completion_rate": "forms.completion_rate",
    "ops.work_overdue_count": "ops.work_overdue_count",
};

export function kpiForMetric(metricKey: OipMetricKey): OipKpiKey | null {
    return METRIC_TO_KPI[metricKey] ?? null;
}

export function listKpiDefinitions(): readonly KpiDefinition[] {
    return Object.freeze(Object.values(KPI_DEFINITIONS));
}
