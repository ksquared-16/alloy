import { z } from "zod";
import {
    metricDimensionConfigSchema,
    metricFilterConfigSchema,
    metricPeriodConfigSchema,
    metricTargetConfigSchema,
    metricThresholdConfigSchema,
} from "@/lib/metrics/platform/schemas";

export const metricDefinitionCreateSchema = z
    .object({
        key: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-z][a-z0-9_]*$/),
        label: z.string().min(1).max(256),
        description: z.string().max(2000).optional().default(""),
        category: z.string().min(1).max(64).optional().default("general"),
        entity_scope: z.enum(["org", "site", "department", "work_unit", "record"]).optional().default("org"),
        source_type: z.enum(["oip_adapter", "queue_adapter", "forms_adapter", "disabled"]),
        source_key: z.string().min(1).max(128),
        aggregation: z.enum(["count", "sum", "avg", "rate", "median", "min", "max", "ratio"]),
        numerator_config: z.record(z.string(), z.unknown()).nullish(),
        denominator_config: z.record(z.string(), z.unknown()).nullish(),
        filter_config: metricFilterConfigSchema.optional().default({ version: 1 }),
        dimension_config: metricDimensionConfigSchema.optional().default({ version: 1 }),
        default_period_config: metricPeriodConfigSchema.optional().default({ version: 1, kind: "rolling", days: 30 }),
        unit: z.enum(["none", "count", "percent", "currency", "duration", "rate"]).optional().default("none"),
        precision: z.number().int().min(0).max(6).optional().default(0),
        is_kpi: z.boolean().optional().default(false),
        target_config: metricTargetConfigSchema.nullish(),
        threshold_config: metricThresholdConfigSchema.nullish(),
        status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
        version: z.literal(1).optional().default(1),
    })
    .strict();

export const metricDefinitionUpdateSchema = metricDefinitionCreateSchema.partial().strict();

export type MetricDefinitionCreateInput = z.infer<typeof metricDefinitionCreateSchema>;
export type MetricDefinitionUpdateInput = z.infer<typeof metricDefinitionUpdateSchema>;

export function validateMetricDefinitionCreate(input: unknown): MetricDefinitionCreateInput {
    return metricDefinitionCreateSchema.parse(input);
}

export function validateMetricDefinitionUpdate(input: unknown): MetricDefinitionUpdateInput {
    return metricDefinitionUpdateSchema.parse(input);
}
