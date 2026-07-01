import { z } from "zod";
import { metricDisplayConfigSchema, metricStyleConfigSchema } from "@/lib/metrics/platform/schemas";

export const metricVisualizationCreateSchema = z
    .object({
        metric_definition_id: z.string().uuid(),
        key: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-z][a-z0-9_]*$/),
        label: z.string().min(1).max(256),
        visualization_type: z.enum([
            "kpi_card",
            "trend_card",
            "sparkline",
            "line_chart",
            "area_chart",
            "bar_chart",
            "comparison",
            "gauge",
            "scorecard",
            "table",
            "chip",
        ]),
        style_config: metricStyleConfigSchema.optional().default({ version: 1 }),
        display_config: metricDisplayConfigSchema.optional().default({ version: 1 }),
        status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
        version: z.literal(1).optional().default(1),
    })
    .strict();

export const metricVisualizationUpdateSchema = metricVisualizationCreateSchema.partial().strict();

export type MetricVisualizationCreateInput = z.infer<typeof metricVisualizationCreateSchema>;
export type MetricVisualizationUpdateInput = z.infer<typeof metricVisualizationUpdateSchema>;

export function validateMetricVisualizationCreate(input: unknown): MetricVisualizationCreateInput {
    return metricVisualizationCreateSchema.parse(input);
}

export function validateMetricVisualizationUpdate(input: unknown): MetricVisualizationUpdateInput {
    return metricVisualizationUpdateSchema.parse(input);
}
