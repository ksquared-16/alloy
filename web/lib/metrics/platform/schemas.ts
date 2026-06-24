import { z } from "zod";

export const CONFIG_VERSION = 1 as const;

export const metricPeriodConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        kind: z.enum(["rolling", "week_over_week", "month_over_month", "quarter_over_quarter", "custom"]),
        days: z.number().int().positive().optional(),
        startIso: z.string().datetime().optional(),
        endIso: z.string().datetime().optional(),
    })
    .strict();

export const metricFilterConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    })
    .strict();

export const metricDimensionConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        dimensions: z.record(z.string(), z.string()).optional(),
    })
    .strict();

export const metricTargetConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        kind: z.enum(["duration_max_hours", "rate_min", "rate_max", "count_max", "count_min"]),
        targetMaxHours: z.number().optional(),
        targetMinRate: z.number().optional(),
        targetMaxRate: z.number().optional(),
        targetMaxCount: z.number().optional(),
        targetMinCount: z.number().optional(),
        direction: z.enum(["higher_is_better", "lower_is_better"]).optional(),
    })
    .strict();

export const metricThresholdConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        healthyMaxHours: z.number().optional(),
        warningMaxHours: z.number().optional(),
        healthyMinRate: z.number().optional(),
        warningMinRate: z.number().optional(),
        healthyMaxCount: z.number().optional(),
        warningMaxCount: z.number().optional(),
        healthyMaxRate: z.number().optional(),
        warningMaxRate: z.number().optional(),
    })
    .strict();

export const metricStyleConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        accent: z.string().optional(),
        icon: z.string().optional(),
        colorToken: z.string().optional(),
        fill: z.enum(["border", "soft", "filled"]).optional(),
    })
    .strict();

export const metricDisplayConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        compact: z.boolean().optional(),
        showThreshold: z.boolean().optional(),
        showSparkline: z.boolean().optional(),
        labelOverride: z.string().optional(),
        subtitle: z.string().optional(),
        showTrend: z.boolean().optional(),
        additionalMetricDefinitionIds: z.array(z.string().uuid()).optional(),
    })
    .strict();

export const metricVisibilityConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        visible: z.boolean().optional(),
        roles: z.array(z.string()).optional(),
    })
    .strict();

export const metricContextConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        workUnitSlug: z.string().optional(),
        departmentId: z.string().uuid().optional(),
    })
    .strict();

export const metricRollupChildConfigSchema = z
    .object({
        version: z.literal(CONFIG_VERSION),
        metrics: z.array(
            z.object({
                metricDefinitionId: z.string().uuid(),
                weight: z.number().optional(),
            })
        ),
    })
    .strict();

export function rejectUnknownConfigVersion(config: unknown, fieldName: string): void {
    if (config == null) return;
    if (typeof config !== "object" || Array.isArray(config)) {
        throw new Error(`${fieldName} must be an object`);
    }
    const version = (config as { version?: unknown }).version;
    if (version !== CONFIG_VERSION) {
        throw new Error(`${fieldName} version ${String(version)} is not supported (expected ${CONFIG_VERSION})`);
    }
}
