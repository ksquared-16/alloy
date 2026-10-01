import { z } from "zod";
import { documentCompositionSchema } from "@/lib/forms/documentComposition";
import { normalizeLegacyPublishedFormSchema } from "@/lib/forms/normalizeLegacyPublishedFormSchema";

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

/* Exported because the import draft now records an ACCEPTED condition and converts it to this shape. */
export type FormVisibilityCondition = z.infer<typeof formVisibilityConditionSchema>;
export type FormVisibility = z.infer<typeof formVisibilitySchema>;
type FormValidateRules = z.infer<typeof formValidateRulesSchema>;
type FormRepeatRules = z.infer<typeof formRepeatRulesSchema>;
type FormSignatureConfig = z.infer<typeof formSignatureConfigSchema>;

/**
 * The explicit "nothing to report" a parent may give instead of typing a false value.
 *
 * Authored ON the field because only the author knows the honest words: "No known allergies" is a
 * true clinical statement, "None we know of" is not the same sentence, and "Nothing to add" is a
 * description of the click rather than an answer. The runtime already owns the AFFORDANCE — an
 * optional need offers a skip, and `enrollmentSessionDeclines` records that it was offered and
 * taken — so this adds the wording, never a second decline system.
 *
 * `offered: false` states that the author considered a skip and decided against one, which is a
 * different fact from never having configured it.
 */
export const formFieldAbsenceSchema = z
    .object({
        label: z.string().min(1),
        offered: z.boolean(),
    })
    .strict();

export type FormFieldAbsence = z.infer<typeof formFieldAbsenceSchema>;

/**
 * WHOSE address a structured address group is.
 *
 * The group's own children already say WHAT they hold, through `field_source` (`person.address_line1`,
 * `person.city`, …). What they cannot say is which person: two address groups on one form — a home
 * address and a mailing address — both resolve `entity_type: "person"` and would fill from the same
 * person, so a family would see their guardian's address offered as the billing address.
 *
 * `subject` is the entity the address belongs to and `role` is the relationship that selects WHICH
 * one. Deliberately not a provider ref: the relationship leaves are name/email/phone, there is no
 * canonical address leaf, and inventing one to fit here would put address ownership inside the Forms
 * runtime instead of the relationship model that owns it.
 */
export const formGroupAddressBindingSchema = z
    .object({
        subject: z.string().min(1),
        role: z.string().min(1),
    })
    .strict();

export type FormGroupAddressBinding = z.infer<typeof formGroupAddressBindingSchema>;

export const formFieldSourceRelationshipSchema = z
    .object({
        /** Canonical relationship leaf provider refKey (Forms registry grain). */
        provider_ref_key: z.string().min(1),
        relationship_id: z.string().min(1),
        role: z.string().optional(),
        /** Manifest/platform leaf refKey — canonical scalar leaf identity (e.g. person.primary_email). */
        leaf_provider_ref_key: z.string().min(1),
        /** Leaf discriminator within the relationship edge — not canonical identity alone. */
        leaf_key: z.string().min(1),
        target_entity_type: z.string().optional(),
    })
    .strict();

export type FormFieldSourceRelationship = z.infer<typeof formFieldSourceRelationshipSchema>;

/**
 * A destination Alloy FILLS rather than asks.
 *
 * Declared on the field so that every consumer — the value-production gate, prefill, submission —
 * reads the same statement, and so a derived box is never mistaken for a question nobody answered.
 * `source_key` and `as_of_key` are field ids within this same schema, because a Form's payload is
 * keyed by field id.
 */
export const formFieldDerivedSchema = z
    .object({
        kind: z.enum(["age_from_date_of_birth", "execution_date"]),
        source_key: z.string().min(1).optional(),
        as_of_key: z.string().min(1).optional(),
    })
    .strict();

export type FormFieldDerived = z.infer<typeof formFieldDerivedSchema>;

export const formFieldSourceSchema = z
    .object({
        entity_type: z.string().min(1),
        field_key: z.string().min(1),
        shared_value_key: z.string().optional(),
        crm_mapping_key: z.string().optional(),
        /** Optional relationship lineage — backward compatible for scalar-only bindings. */
        relationship: formFieldSourceRelationshipSchema.optional(),
    })
    .strict();

export type FormFieldSource = z.infer<typeof formFieldSourceSchema>;

export const formGroupCollectionBindingSchema = z
    .object({
        /** Canonical whole-collection provider refKey (e.g. children, household.members). */
        collection_provider_ref: z.string().min(1),
        iteration_entity_type: z.string().min(1),
        iteration_alias: z.string().optional(),
    })
    .strict();

export type FormGroupCollectionBinding = z.infer<typeof formGroupCollectionBindingSchema>;

export const formIterationContextSchema = z
    .object({
        scope: z.literal("collection_item"),
        collection_provider_ref: z.string().min(1),
        iteration_entity_type: z.string().min(1),
        iteration_alias: z.string().optional(),
    })
    .strict();

export type FormIterationContext = z.infer<typeof formIterationContextSchema>;

export type FormFieldLayoutWidth = "full" | "half" | "third" | "quarter";

type FormFieldBase = {
    id: string;
    label: string;
    required: boolean;
    /** Shown under the label in renderers that support it (help / description). */
    description?: string;
    /** Input placeholder where applicable (text-like controls). */
    placeholder?: string;
    /** Row width on desktop; fractional widths share a 12-unit row grid. Default full. */
    layout_width?: FormFieldLayoutWidth;
    /** Provenance for operational mapping (CRM, shared_values, etc.); optional for legacy/demo schemas. */
    field_source?: FormFieldSource;
    /** When true, public PATCH/submit restore values from the saved draft baseline (operator/server wins). */
    read_only?: boolean;
    /** Alloy fills this destination from canonical truth; it is never asked. @see formFieldDerivedSchema */
    derived?: FormFieldDerived;
    visibility?: FormVisibility;
    validate?: FormValidateRules;
    entity_hint?: string;
    pdf_slot?: string;
    /** The author's own wording for an explicit "nothing to report". @see formFieldAbsenceSchema */
    absence?: FormFieldAbsence;
};

/** Parsed `schema_json` field node (recursive for groups). */
export type FormField =
    | (FormFieldBase & { type: "text"; multiline?: boolean })
    | (FormFieldBase & { type: "text_block"; content: string; token_ids?: string[] })
    | (FormFieldBase & { type: "number" })
    | (FormFieldBase & { type: "date" })
    | (FormFieldBase & { type: "boolean" })
    | (FormFieldBase & {
          type: "select";
          /** DB-backed option set (org `option_sets`); omit when `static_options` is set. */
          option_set_key?: string;
          /** Inline choices for admin-configured forms (no `option_sets` row required). */
          static_options?: ReadonlyArray<{ value: string; label: string }>;
      })
    | (FormFieldBase & {
          type: "multiselect";
          option_set_key?: string;
          static_options?: ReadonlyArray<{ value: string; label: string }>;
      })
    | (FormFieldBase & {
          type: "file_ref";
          /**
           * The canonical document classification this upload satisfies, when one is known.
           *
           * Without it every upload requirement is "a file", and a family who uploads a physical
           * cannot be told they still owe an immunization record. Optional on purpose: an unknown
           * type stays absent rather than being guessed into the nearest key.
           */
          document_type?: string;
      })
    | (FormFieldBase & { type: "signature"; signature?: FormSignatureConfig })
    | (FormFieldBase & {
          type: "group";
          fields: FormField[];
          repeat?: FormRepeatRules;
          /** When set, repeat instances bind to a canonical collection provider. */
          collection_binding?: FormGroupCollectionBinding;
          /** When set, the group's address fields resolve from the person this names. */
          address_binding?: FormGroupAddressBinding;
      });

const staticOptionRowSchema = z
    .object({
        value: z.string().min(1),
        label: z.string().min(1),
    })
    .strict();

const fieldCoreSchema = z
    .object({
        id: z.string().min(1),
        label: z.string().min(1),
        required: z.boolean().optional().default(false),
        description: z.string().optional(),
        placeholder: z.string().optional(),
        visibility: formVisibilitySchema.optional(),
        validate: formValidateRulesSchema.optional(),
        entity_hint: z.string().min(1).optional(),
        /** Name of PDF mapping slot for this field (hint only; mapping lives in `pdf_mapping_json`). */
        pdf_slot: z.string().min(1).optional(),
        read_only: z.boolean().optional().default(false),
        derived: formFieldDerivedSchema.optional(),
        field_source: formFieldSourceSchema.optional(),
        layout_width: z.enum(["full", "half", "third", "quarter"]).optional(),
        absence: formFieldAbsenceSchema.optional(),
    })
    .strict();

export const formFieldSchema: z.ZodType<FormField> = z.lazy(() =>
    z.union([
        fieldCoreSchema
            .extend({
                type: z.literal("text"),
                multiline: z.boolean().optional(),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("text_block"),
                content: z.string().default(""),
                token_ids: z.array(z.string().min(1)).optional(),
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
                option_set_key: z.string().min(1).optional(),
                static_options: z.array(staticOptionRowSchema).optional(),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("multiselect"),
                option_set_key: z.string().min(1).optional(),
                static_options: z.array(staticOptionRowSchema).optional(),
            })
            .strict(),
        fieldCoreSchema
            .extend({
                type: z.literal("file_ref"),
                document_type: z.string().min(1).optional(),
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
                collection_binding: formGroupCollectionBindingSchema.optional(),
                address_binding: formGroupAddressBindingSchema.optional(),
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
        fields: z.array(formFieldSchema),
        /** Optional document composition layer — ignored by public renderer until staged (FD-4). */
        document_composition: documentCompositionSchema.optional(),
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

        const walkSelectFieldSources = (fields: FormField[], basePath: (string | number)[]) => {
            for (let fi = 0; fi < fields.length; fi++) {
                const f = fields[fi];
                const here = [...basePath, fi];
                if (f.type === "select" || f.type === "multiselect") {
                    const key = f.option_set_key?.trim();
                    const stat = f.static_options;
                    const hasStatic = Array.isArray(stat) && stat.length > 0;
                    if (!key && !hasStatic) {
                        ctx.addIssue({
                            code: "custom",
                            message: `${f.type} must set option_set_key or static_options`,
                            path: here,
                        });
                    }
                    if (hasStatic && stat) {
                        const vals = stat.map((r) => r.value);
                        if (new Set(vals).size !== vals.length) {
                            ctx.addIssue({
                                code: "custom",
                                message: "static_options values must be unique",
                                path: here,
                            });
                        }
                    }
                }
                if (f.type === "group") {
                    walkSelectFieldSources(f.fields, [...here, "fields"]);
                }
            }
        };
        walkSelectFieldSources(data.fields, ["fields"]);
    });

export type FormSchemaV1 = z.infer<typeof formSchemaV1Schema>;

/*
 * ── HISTORICAL VOCABULARY, THEN STRICT PARSE ───────────────────────────────────────────────────
 *
 * A published version is immutable, so an artifact authored before a property was renamed keeps the
 * old name forever. Normalization translates the NAMED historical contracts and nothing else; the
 * strict parse below is unchanged, so a property nobody has taught the normalizer is still an
 * error. Both entry points normalize, because a caller that forgot would meet a 500 on a family's
 * screen rather than a failing test.
 */
export function validateFormSchema(schemaJson: unknown): FormSchemaV1 {
    return formSchemaV1Schema.parse(normalizeLegacyPublishedFormSchema(schemaJson));
}

export function safeParseFormSchema(schemaJson: unknown) {
    return formSchemaV1Schema.safeParse(normalizeLegacyPublishedFormSchema(schemaJson));
}
