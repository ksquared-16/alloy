import { z } from "zod";
import { metricContextConfigSchema, metricVisibilityConfigSchema } from "@/lib/metrics/platform/schemas";

export const metricPlacementCreateSchema = z
    .object({
        visualization_id: z.string().uuid(),
        surface: z.enum([
            "workspace_header",
            "business_process_tile",
            "work_unit_header",
            "drawer",
            "operational_intelligence",
            "dashboard",
            "report",
            "portal",
            "mobile",
        ]),
        surface_key: z.string().min(1).max(128).optional().default("default"),
        placement_zone: z
            .enum([
                "overview",
                "health",
                "trends",
                "comparisons",
                "header",
                "footer",
                "sidebar",
                "primary_metrics",
                "secondary_metrics",
                "header_metrics",
                "tile_metrics",
            ])
            .optional()
            .default("overview"),
        context_config: metricContextConfigSchema.optional().default({ version: 1 }),
        visibility_config: metricVisibilityConfigSchema.optional().default({ version: 1, visible: true }),
        sort_order: z.number().int().optional().default(0),
        status: z.enum(["draft", "active", "archived", "hidden"]).optional().default("draft"),
        version: z.literal(1).optional().default(1),
    })
    .strict();

export const metricPlacementUpdateSchema = metricPlacementCreateSchema.partial().strict();

export type MetricPlacementCreateInput = z.infer<typeof metricPlacementCreateSchema>;
export type MetricPlacementUpdateInput = z.infer<typeof metricPlacementUpdateSchema>;

export function validateMetricPlacementCreate(input: unknown): MetricPlacementCreateInput {
    return metricPlacementCreateSchema.parse(input);
}

export function validateMetricPlacementUpdate(input: unknown): MetricPlacementUpdateInput {
    return metricPlacementUpdateSchema.parse(input);
}
