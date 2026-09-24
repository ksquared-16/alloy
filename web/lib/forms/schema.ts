import { z } from "zod";
import { documentCompositionSchema } from "@/lib/forms/documentComposition";

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

/**
 * WHAT A REPEATED ENTRY IS A PERSON OF.
 *
 * A repeating group already knew how MANY entries to collect (`repeat`) and, when bound, which
 * canonical collection they iterate (`collection_binding`). It never knew what each entry MEANS —
 * so the only thing a participant could be shown was "Add item", and nothing downstream could say
 * whether a row was a sibling, an emergency contact or a payer.
 *
 * This is that statement, and it is deliberately thin: every value here is the platform's own
 * relationship vocabulary (`RELATIONSHIP_ACTION_KEYS`, `RelationshipActionScope`), not a second one
 * invented for Forms. Forms declares the INTENT; the canonical owner still performs the write, and
 * `lib/admin/relationship/` remains the only place a relationship is created.
 *
 * It says nothing about tables, ids or storage. A group without it is an ordinary repeater and
 * behaves exactly as before.
 */
export const formPartyCollectionSchema = z
    .object({
        /** The canonical relationship action each entry expresses. Forms never performs it. */
        action_key: z.enum([
            "add_emergency_contact",
            "add_authorized_pickup",
            "add_billing_contact",
            "add_parent_guardian",
            "add_child",
            "link_existing_person",
            "link_existing_child",
        ]),
        /** Whether an entry is a person in their own right, or a child on the household. */
        subject: z.enum(["person", "child"]),
        /** Relationship role key where the action takes one (e.g. `emergency_contact`). */
        role: z.string().min(1).optional(),
        /** Who the relationship applies to. Values are `RelationshipActionScope`. */
        scope: z
            .enum([
                "this_child",
                "selected_children",
                "all_children_in_household",
                "this_opportunity",
                "household",
                "selected_enrollments",
            ])
            .optional(),
        /** Show what Alloy already knows first, for confirmation, instead of asking again. */
        show_known: z.boolean().default(true),
        /** Whether the family may add entries beyond the known ones. */
        allow_add: z.boolean().default(true),
        /** The words the family reads. `add_another` is the button; a blank falls back to the label. */
        add_another_label: z.string().min(1).optional(),
        entry_label: z.string().min(1).optional(),
    })
    .strict();

export type FormPartyCollection = z.infer<typeof formPartyCollectionSchema>;

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
    /** Whether "there are none" is one of this question's answers, and what it is called. */
    absence?: FormFieldAbsence;
    /** Where the answer is kept while no canonical owner exists. Never beside `field_source`. */
    retention?: FormFieldRetention;
    /** Canonical configuration supplies this value; the family is never asked for it. */
    supplied_by?: FormFieldSuppliedBy;
    /** When true, public PATCH/submit restore values from the saved draft baseline (operator/server wins). */
    read_only?: boolean;
    /** Alloy fills this destination from canonical truth; it is never asked. @see formFieldDerivedSchema */
    derived?: FormFieldDerived;
    visibility?: FormVisibility;
    validate?: FormValidateRules;
    entity_hint?: string;
    pdf_slot?: string;
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
          /** When set, each repeat instance is a PERSON or CHILD in a canonical relationship. */
          party_collection?: FormPartyCollection;
          /** When set, this group's fields are the parts of ONE address. */
          address_binding?: FormAddressBinding;
      });

/**
 * "THERE ARE NONE" IS AN ANSWER, AND THE FORM HAS TO SAY SO.
 *
 * The runtime already let a participant decline an optional question. What it did not have was a
 * statement of WHEN that is meaningful or what it should be called, so it guessed: the skip label
 * was chosen by testing whether the question's own words contained "allerg". A school that writes
 * "Please list any food sensitivities" got "Nothing to add"; one that writes "Allergy information"
 * got "No known allergies". Same fact, different paperwork, decided by spelling.
 *
 * `offered` is the author saying an absence answer exists for this question. `label` is what the
 * family reads. Absent, the question simply has no absence answer — which is the honest default for
 * a question nobody has thought about.
 *
 * ABSENCE IS NOT OPTIONALITY. `required` says whether the form insists on an answer; this says
 * whether "none" is one of the answers. A required question can have a true absence answer — "No
 * known allergies" is an answer, not a refusal to give one — and an optional question may have none.
 */
export const formFieldAbsenceSchema = z
    .object({
        offered: z.literal(true),
        /** What the family reads. Defaults to "None" where the author gives no words of their own. */
        label: z.string().min(1).optional(),
    })
    .strict();

export type FormFieldAbsence = z.infer<typeof formFieldAbsenceSchema>;

/**
 * WHERE AN ANSWER IS KEPT WHEN NOTHING CANONICAL OWNS IT YET.
 *
 * Some facts a school must collect today have no canonical owner in Alloy yet — a Health domain
 * that does not exist, a Consent writer not yet built. Until now a Form had two ways to describe
 * such a question, and both lied: bind it to a canonical field that will not receive it, or leave
 * it unbound and indistinguishable from a question nobody got round to normalising.
 *
 * This is the third, truthful state. The participant is asked normally, the answer is real
 * structured evidence, the completed artifact carries it — and no canonical binding is claimed, so
 * no writer is invented and nothing downstream mistakes it for owned truth. When the owner arrives
 * it can adopt the fact deliberately, knowing exactly which questions were waiting for it.
 *
 * `owner_hint` is the domain the author expects to own it eventually. It is a HINT for a human
 * reading the catalogue later, never a binding and never resolved against anything.
 */
export const formFieldRetentionSchema = z
    .object({
        kind: z.literal("form_only_pending_canonical_owner"),
        owner_hint: z.string().min(1).optional(),
        note: z.string().min(1).optional(),
    })
    .strict();

export type FormFieldRetention = z.infer<typeof formFieldRetentionSchema>;

/**
 * A VALUE THE ORGANISATION OWNS, WHICH THE FAMILY MUST NEVER BE ASKED FOR.
 *
 * A registration fee is the school's number. Asking a parent to type it invites them to get it
 * wrong; copying it into the Form makes a second place it can be right, which is the same thing as
 * a second place it can be stale. Financials already owns it, in a charge template.
 *
 * So the Form holds a REFERENCE and nothing else. The amount is resolved from canonical
 * configuration at the moment the document is generated, which is what makes "change the fee, print
 * new paperwork" work without anybody editing a Form.
 */
export const formFieldSuppliedBySchema = z
    .object({
        /** Which canonical configuration owns the value. */
        source_kind: z.literal("charge_template"),
        /** The owner's own stable key — never a duplicated amount, never a raw row id in the UI. */
        source_key: z.string().min(1),
        /** When the value is read. Generation keeps the document current; nothing is cached here. */
        resolve_at: z.enum(["generation"]).default("generation"),
    })
    .strict();

export type FormFieldSuppliedBy = z.infer<typeof formFieldSuppliedBySchema>;

/**
 * ONE ADDRESS, NOT FOUR QUESTIONS.
 *
 * The canonical store already exists on the Person — `address_line1`, `city`, `state`,
 * `postal_code` — and a group of four bound fields already expresses it structurally. What no Form
 * could say was that those four belong to ONE address, so a participant met four detached questions
 * with nothing to indicate they were describing a single thing, and nothing downstream could render
 * them as an address.
 *
 * Deliberately the same move `party_collection` made for repeated people: the group already
 * existed; this is the statement of what it MEANS. It creates no address store, declares no
 * columns, and adds no second address model — `subject` and `role` say whose address it is, and the
 * child fields keep their own canonical bindings.
 */
export const formAddressBindingSchema = z
    .object({
        /** Whose address. A role names the person in that relationship; absent means the subject's. */
        subject: z.enum(["child", "person"]),
        role: z.string().min(1).optional(),
    })
    .strict();

export type FormAddressBinding = z.infer<typeof formAddressBindingSchema>;

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
        /** Whether "there are none" is one of this question's answers, and what it is called. */
        absence: formFieldAbsenceSchema.optional(),
        /** Where the answer is kept while no canonical owner exists. Never beside `field_source`. */
        retention: formFieldRetentionSchema.optional(),
        /** Canonical configuration supplies this value; the family is never asked for it. */
        supplied_by: formFieldSuppliedBySchema.optional(),
        layout_width: z.enum(["full", "half", "third", "quarter"]).optional(),
    })
    .strict();

/**
 * Rules that span more than one property of a field.
 *
 * Applied to the assembled union rather than to `fieldCoreSchema`, because a refined schema is no
 * longer an object schema and every field variant is built by extending the core.
 */
function assertFieldCombinationsAreCoherent(field: FormField, ctx: z.RefinementCtx): void {
    /*
     * A QUESTION CANNOT BE BOTH OWNED AND WAITING FOR AN OWNER.
     *
     * `retention` exists precisely to say "nothing canonical owns this yet". Carrying a
     * `field_source` at the same time claims a canonical destination — the false binding this state
     * was created to avoid — so the pair is refused rather than left for two readers to disagree
     * about which one is true.
     */
    if (field.retention && field.field_source) {
        ctx.addIssue({
            code: "custom",
            message: "A field kept as Form-only evidence cannot also claim a canonical field_source.",
            path: ["retention"],
        });
    }
    // A value the organisation supplies is not a question, so "none" is not one of its answers.
    if (field.supplied_by && field.absence) {
        ctx.addIssue({
            code: "custom",
            message: "A configuration-supplied value cannot offer an absence answer.",
            path: ["supplied_by"],
        });
    }
}

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
                party_collection: formPartyCollectionSchema.optional(),
                /** When set, this group's fields are the parts of ONE address. */
                address_binding: formAddressBindingSchema.optional(),
            })
            .strict(),
    ]).superRefine(assertFieldCombinationsAreCoherent)
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

export function validateFormSchema(schemaJson: unknown): FormSchemaV1 {
    return formSchemaV1Schema.parse(schemaJson);
}

export function safeParseFormSchema(schemaJson: unknown) {
    return formSchemaV1Schema.safeParse(schemaJson);
}
