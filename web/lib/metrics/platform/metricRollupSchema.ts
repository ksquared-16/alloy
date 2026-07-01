import { z } from "zod";
import { metricRollupChildConfigSchema, metricThresholdConfigSchema } from "@/lib/metrics/platform/schemas";

export const metricRollupCreateSchema = z
    .object({
        key: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-z][a-z0-9_]*$/),
        label: z.string().min(1).max(256),
        rollup_type: z.enum(["sum", "avg", "weighted_avg", "best", "worst", "composite_score", "health_score"]),
        child_metric_config: metricRollupChildConfigSchema,
        context_scope: z.string().min(1).max(64).optional().default("org"),
        weight_config: z.record(z.string(), z.unknown()).nullish(),
        threshold_config: metricThresholdConfigSchema.nullish(),
        status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
        version: z.literal(1).optional().default(1),
    })
    .strict();

export const metricRollupUpdateSchema = metricRollupCreateSchema.partial().strict();

export type MetricRollupCreateInput = z.infer<typeof metricRollupCreateSchema>;
export type MetricRollupUpdateInput = z.infer<typeof metricRollupUpdateSchema>;

export function validateMetricRollupCreate(input: unknown): MetricRollupCreateInput {
    return metricRollupCreateSchema.parse(input);
}

export function validateMetricRollupUpdate(input: unknown): MetricRollupUpdateInput {
    return metricRollupUpdateSchema.parse(input);
}
