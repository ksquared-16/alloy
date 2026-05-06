import { z } from "zod";

/** Single visibility condition; submit evaluation uses AND across `visibility.all`. */
export const formVisibilityConditionSchema = z
    .object({
        field_id: z.string().min(1),
        op: z.enum(["eq", "neq"]),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    })
    .strict();

export const formVisibilitySchema = z
    .object({
        all: z.array(formVisibilityConditionSchema).nonempty(),
    })
    .strict();

export const formValidateRulesSchema = z
    .object({
        min: z.number().optional(),
        max: z.number().optional(),
        min_length: z.number().int().min(0).optional(),
        max_length: z.number().int().min(0).optional(),
        pattern: z.string().optional(),
    })
    .strict();

export const formRepeatRulesSchema = z
    .object({
        min: z.number().int().min(0).default(0),
        max: z.number().int().min(1).optional(),
    })
    .strict();

export const formSignatureConfigSchema = z
    .object({
        /** When true, submit requires `typed_full_name` for typed signatures. */
        require_typed_name: z.boolean().optional(),
        /** When true, submit requires `drawn_document_id` for drawn signatures. */
        require_drawn_asset: z.boolean().optional(),
        /** When true, submit requires `acknowledged_at` to be set. */
        require_acknowledgment: z.boolean().optional(),
    })
    .strict();

type FormVisibility = z.infer<typeof formVisibilitySchema>;
type FormValidateRules = z.infer<typeof formValidateRulesSchema>;
type FormRepeatRules = z.infer<typeof formRepeatRulesSchema>;
type FormSignatureConfig = z.infer<typeof formSignatureConfigSchema>;

type FormFieldBase = {
    id: string;
    label: string;
    required: boolean;
    visibility?: FormVisibility;
    validate?: FormValidateRules;
    entity_hint?: string;
    pdf_slot?: string;
};

/** Parsed `schema_json` field node (recursive for groups). */
export type FormField =
    | (FormFieldBase & { type: "text" })
    | (FormFieldBase & { type: "number" })
    | (FormFieldBase & { type: "date" })
    | (FormFieldBase & { type: "boolean" })
    | (FormFieldBase & { type: "select"; option_set_key: string })
    | (FormFieldBase & { type: "multiselect"; option_set_key: string })
    | (FormFieldBase & { type: "file_ref" })
    | (FormFieldBase & { type: "signature"; signature?: FormSignatureConfig })
    | (FormFieldBase & { type: "group"; fields: FormField[]; repeat?: FormRepeatRules });

const fieldCoreSchema = z
    .object({
        id: z.string().min(1),
        label: z.string().min(1),
        required: z.boolean().optional().default(false),
        visibility: formVisibilitySchema.optional(),
        validate: formValidateRulesSchema.optional(),
        entity_hint: z.string().min(1).optional(),
        /** Name of PDF mapping slot for this field (hint only; mapping lives in `pdf_mapping_json`). */
        pdf_slot: z.string().min(1).optional(),
    })
    .strict();

export const formFieldSchema: z.ZodType<FormField> = z.lazy(() =>
    z.union([
        fieldCoreSchema
            .extend({
                type: z.literal("text"),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("number"),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("date"),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("boolean"),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("select"),
                option_set_key: z.string().min(1),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("multiselect"),
                option_set_key: z.string().min(1),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("file_ref"),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("signature"),
                signature: formSignatureConfigSchema.optional(),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("group"),
                fields: z.array(formFieldSchema).min(1),
                repeat: formRepeatRulesSchema.optional(),
            })
            .strict(),
    ])
);

export const formSectionSchema = z
    .object({
        id: z.string().min(1),
        title: z.string().optional(),
        field_ids: z.array(z.string().min(1)),
    })
    .strict();

export type FormSection = z.infer<typeof formSectionSchema>;

export const formSchemaV1Schema = z
    .object({
        schema_version: z.literal(1),
        title: z.string().min(1),
        sections: z.array(formSectionSchema),
        fields: z.array(formFieldSchema).min(1),
    })
    .strict()
    .superRefine((data, ctx) => {
        const topLevelIds = data.fields.map((f) => f.id);
        const topSet = new Set(topLevelIds);
        if (topSet.size !== topLevelIds.length) {
            ctx.addIssue({
                code: "custom",
                message: "Duplicate top-level field id",
                path: ["fields"],
            });
        }

        const allIds: string[] = [];
        const walkIds = (fields: FormField[]) => {
            for (const f of fields) {
                allIds.push(f.id);
                if (f.type === "group") walkIds(f.fields);
            }
        };
        walkIds(data.fields);
        const allSet = new Set(allIds);
        if (allSet.size !== allIds.length) {
            ctx.addIssue({
                code: "custom",
                message: "Duplicate field id in schema tree",
                path: ["fields"],
            });
        }

        for (let s = 0; s < data.sections.length; s++) {
            const section = data.sections[s];
            for (let i = 0; i < section.field_ids.length; i++) {
                const fid = section.field_ids[i];
                if (!topSet.has(fid)) {
                    ctx.addIssue({
                        code: "custom",
                        message: `Section references unknown top-level field id: ${fid}`,
                        path: ["sections", s, "field_ids", i],
                    });
                }
            }
        }

        const walkGroups = (fields: FormField[]) => {
            for (const f of fields) {
                if (f.type !== "group") continue;
                const rep = f.repeat;
                if (rep?.max !== undefined && rep.max < rep.min) {
                    ctx.addIssue({
                        code: "custom",
                        message: "group.repeat.max must be >= repeat.min",
                        path: ["fields"],
                    });
                }
                const childIds = f.fields.map((c) => c.id);
                const cset = new Set(childIds);
                if (cset.size !== childIds.length) {
                    ctx.addIssue({
                        code: "custom",
                        message: `Duplicate field id inside group ${f.id}`,
                        path: ["fields"],
                    });
                }
                for (const child of f.fields) {
                    if (child.type === "group" && child.id === f.id) {
                        ctx.addIssue({
                            code: "custom",
                            message: "Group child id must not equal parent group id",
                            path: ["fields"],
                        });
                    }
                }
                walkGroups(f.fields);
            }
        };
        walkGroups(data.fields);

        const walkVisibilityRefs = (fields: FormField[]) => {
            for (const f of fields) {
                if (f.visibility) {
                    for (const c of f.visibility.all) {
                        if (!allSet.has(c.field_id)) {
                            ctx.addIssue({
                                code: "custom",
                                message: `visibility references unknown field_id: ${c.field_id}`,
                                path: ["fields"],
                            });
                        }
                    }
                }
                if (f.type === "group") walkVisibilityRefs(f.fields);
            }
        };
        walkVisibilityRefs(data.fields);
    });

export type FormSchemaV1 = z.infer<typeof formSchemaV1Schema>;

export function validateFormSchema(schemaJson: unknown): FormSchemaV1 {
    return formSchemaV1Schema.parse(schemaJson);
}

export function safeParseFormSchema(schemaJson: unknown) {
    return formSchemaV1Schema.safeParse(schemaJson);
}
