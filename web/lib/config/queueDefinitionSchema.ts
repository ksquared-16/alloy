import { z } from "zod";

const StatusFilterSchema = z
    .object({
        type: z.literal("status"),
        operator: z.literal("in"),
        values: z.array(z.string()),
    })
    .strict();

const FieldFilterSchema = z
    .object({
        type: z.literal("field"),
        field_key: z.string(),
        operator: z.enum(["eq", "gt", "lt"]),
        value: z.unknown(),
    })
    .strict();

const DateFilterSchema = z
    .object({
        type: z.literal("date"),
        field: z.string(),
        operator: z.enum(["today", "past_due"]),
    })
    .strict();

const AssignmentFilterSchema = z
    .object({
        type: z.literal("assignment"),
        operator: z.enum(["is_null", "equals"]),
        value: z.string().optional(),
    })
    .strict()
    .superRefine((val, ctx) => {
        if (val.operator === "equals" && !val.value) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "assignment.equals requires value",
                path: ["value"],
            });
        }
        if (val.operator === "is_null" && val.value !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "assignment.is_null must not include value",
                path: ["value"],
            });
        }
    });

const ExceptionFilterSchema = z
    .object({
        type: z.literal("exception"),
        operator: z.literal("exists"),
        exception_types: z.array(z.string()).nullish(),
    })
    .strict();

export const queueFilterSchema = z
    .union([StatusFilterSchema, FieldFilterSchema, DateFilterSchema, AssignmentFilterSchema, ExceptionFilterSchema])
    .readonly();

export const queueConfigSchema = z
    .object({
        key: z.string().min(1),
        label: z.string().min(1),
        /** Optional Lucide icon token (kebab-case), resolved via workspace icon registry in AdminV2. */
        icon: z.string().min(1).nullish(),
        /** JSONB commonly stores explicit null; treat like omitted. */
        description: z.string().nullish(),
        filters: z.array(queueFilterSchema),
        sort: z
            .array(
                z
                    .object({
                        field: z.string().min(1),
                        direction: z.enum(["asc", "desc"]),
                    })
                    .strict()
            )
            .optional(),
        limit: z.number().int().positive().optional(),
        priority: z.enum(["standard", "attention", "critical"]).nullish(),
        display: z.enum(["list", "cards"]).nullish(),
        group_by: z.string().min(1).nullish(),
    })
    .strict()
    .readonly();

const queueUiRowPreviewSchema = z
    .object({
        variant: z.enum(["crm_compact", "basic"]).default("basic"),
        fields: z
            .array(
                z.enum([
                    "title",
                    "status",
                    "primary_contact",
                    "phone",
                    "email",
                    "child_name",
                    "program",
                    "desired_start_date",
                    "tour_date",
                ])
            )
            .default(["title", "status"]),
        actions: z.array(z.enum(["open", "call", "email"])).default(["open"]),
        field_labels: z.record(z.string(), z.string()).nullish(),
    })
    .strict();

const queueUiSectionSchema = z
    .object({
        key: z.string().min(1),
        label: z.string().min(1),
        tone: z.enum(["standard", "attention", "critical"]).nullish(),
        queue_keys: z.array(z.string().min(1)).nonempty(),
    })
    .strict();

const queueUiSchema = z
    .object({
        layout: z.enum(["pipeline_with_attention", "single_section"]).default("single_section"),
        primary_total_label: z.string().min(1).nullish(),
        primary_total_queue: z.string().min(1).nullish(),
        sections: z.array(queueUiSectionSchema).nonempty().optional(),
        row_preview: queueUiRowPreviewSchema.optional(),
    })
    .strict();

export const queueDefinitionV1Schema = z
    .object({
        version: z.literal(1),
        entity_type: z.enum(["job", "schedule", "opportunity"]),
        queues: z.array(queueConfigSchema).nonempty(),
        ui: queueUiSchema.optional(),
    })
    .strict()
    .readonly();

export type QueueFilter = z.infer<typeof queueFilterSchema>;
export type QueueConfig = z.infer<typeof queueConfigSchema>;
export type QueueDefinitionV1 = z.infer<typeof queueDefinitionV1Schema>;

export function validateQueueDefinition(input: unknown): QueueDefinitionV1 {
    return queueDefinitionV1Schema.parse(input);
}

