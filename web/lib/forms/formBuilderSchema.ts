/**
 * Manual form builder — pure schema helpers.
 *
 * Lets operators build a useful FormSchemaV1 by hand (not only from PDF extraction):
 * create a blank form, add/edit/reorder/remove fields and sections, set options,
 * required, label/help, and optional canonical binding (field_source). Pure and
 * deterministic; the UI persists the resulting schema via the existing forms-admin save
 * route, and previews it with the existing FormEngineRenderer. No I/O.
 */

import type { FormField, FormFieldLayoutWidth, FormFieldSource, FormSchemaV1, FormSection } from "@/lib/forms/schema";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import type { SystemFieldRegistryEntry } from "@/lib/forms/systemFieldRegistry";

/** Builder-facing field type menu (maps to FormField discriminants + a "section" pseudo-type). */
export type BuilderFieldType =
    | "short_text"
    | "long_text"
    | "text_block"
    | "date"
    | "number"
    | "select"
    | "multiselect"
    | "boolean"
    | "file_ref"
    | "signature";

export interface BuilderFieldSpec {
    type: BuilderFieldType;
    label: string;
    required?: boolean;
    description?: string;
    /** For select/multiselect. */
    options?: Array<{ value: string; label: string }>;
    /** Optional canonical binding; unbound fields are allowed. */
    field_source?: { entity_type: string; field_key: string; shared_value_key?: string };
    /** Inline authorization / explanatory content for text blocks. */
    content?: string;
    token_ids?: string[];
    /** Target section id; defaults to the first section. */
    sectionId?: string;
}

let counter = 0;
function uid(prefix: string): string {
    counter += 1;
    return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** Slug from a label for stable-ish field ids (uniqueness enforced separately). */
function slug(label: string): string {
    const s = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    return s || "field";
}

export function createBlankSchema(title: string): FormSchemaV1 {
    const t = title.trim() || "Untitled form";
    const sectionId = uid("sec");
    return { schema_version: 1, title: t, sections: [{ id: sectionId, title: "Section 1", field_ids: [] }], fields: [] };
}

function uniqueFieldId(schema: FormSchemaV1, base: string): string {
    const existing = new Set(schema.fields.map((f) => f.id));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}_${i}`)) i += 1;
    return `${base}_${i}`;
}

/** Build a FormField from a builder spec (id assigned by caller via addField). */
function fieldFromSpec(id: string, spec: BuilderFieldSpec): FormField {
    const base = {
        id,
        label: spec.label.trim() || "Untitled",
        required: Boolean(spec.required),
        ...(spec.description?.trim() ? { description: spec.description.trim() } : {}),
        ...(spec.field_source && spec.field_source.entity_type && spec.field_source.field_key
            ? { field_source: { entity_type: spec.field_source.entity_type, field_key: spec.field_source.field_key, ...(spec.field_source.shared_value_key ? { shared_value_key: spec.field_source.shared_value_key } : {}) } }
            : {}),
    };
    switch (spec.type) {
        case "short_text":
            return { ...base, type: "text" };
        case "long_text":
            return { ...base, type: "text", multiline: true };
        case "text_block":
            return {
                ...base,
                type: "text_block",
                required: false,
                content: spec.content?.trim() || "I, {Primary contact}, hereby authorize…",
                token_ids: spec.token_ids ?? [],
            };
        case "number":
            return { ...base, type: "number" };
        case "date":
            return { ...base, type: "date" };
        case "boolean":
            return { ...base, type: "boolean" };
        case "file_ref":
            return { ...base, type: "file_ref" };
        case "signature":
            return { ...base, type: "signature" };
        case "select":
            return { ...base, type: "select", static_options: (spec.options ?? []).filter((o) => o.value && o.label) };
        case "multiselect":
            return { ...base, type: "multiselect", static_options: (spec.options ?? []).filter((o) => o.value && o.label) };
    }
}

/** Add a registry-backed canonical field to a section. */
export function addRegistryField(
    schema: FormSchemaV1,
    entry: SystemFieldRegistryEntry,
    sectionId: string,
    overrides?: { label?: string }
): { schema: FormSchemaV1; fieldId: string } {
    const base = formFieldFromRegistryEntry(entry, overrides?.label ? { label: overrides.label } : {});
    const id = uniqueFieldId(schema, base.id);
    const field: FormField = { ...base, id, layout_width: "full" };
    const targetSectionId = schema.sections.some((s) => s.id === sectionId) ? sectionId : schema.sections[0]?.id;
    const sections = targetSectionId
        ? schema.sections.map((s) => (s.id === targetSectionId ? { ...s, field_ids: [...s.field_ids, id] } : s))
        : [{ id: uid("sec"), title: "Section 1", field_ids: [id] }];
    return { schema: { ...schema, fields: [...schema.fields, field], sections }, fieldId: id };
}

/** Add a field to a section (defaults to first section). Returns a new schema + the new id. */
export function addField(schema: FormSchemaV1, spec: BuilderFieldSpec): { schema: FormSchemaV1; fieldId: string } {
    const id = uniqueFieldId(schema, slug(spec.label));
    const field = fieldFromSpec(id, spec);
    const sectionId = spec.sectionId && schema.sections.some((s) => s.id === spec.sectionId) ? spec.sectionId : schema.sections[0]?.id;
    const sections = sectionId
        ? schema.sections.map((s) => (s.id === sectionId ? { ...s, field_ids: [...s.field_ids, id] } : s))
        : [{ id: uid("sec"), title: "Section 1", field_ids: [id] }];
    return { schema: { ...schema, fields: [...schema.fields, field], sections }, fieldId: id };
}

/** Patch a field's editable props (label/required/description/options/field_source). */
export function updateField(schema: FormSchemaV1, fieldId: string, patch: Partial<BuilderFieldSpec>): FormSchemaV1 {
    const fields = schema.fields.map((f) => {
        if (f.id !== fieldId) return f;
        const next: FormField = { ...f };
        if (patch.label !== undefined) next.label = patch.label.trim() || next.label;
        if (patch.required !== undefined) next.required = Boolean(patch.required);
        if (patch.description !== undefined) {
            const d = patch.description.trim();
            if (d) (next as { description?: string }).description = d;
            else delete (next as { description?: string }).description;
        }
        if (patch.options !== undefined && (next.type === "select" || next.type === "multiselect")) {
            (next as { static_options?: Array<{ value: string; label: string }> }).static_options = patch.options.filter((o) => o.value && o.label);
        }
        if (patch.field_source !== undefined) {
            const fs = patch.field_source;
            if (fs && fs.entity_type && fs.field_key) (next as { field_source?: unknown }).field_source = { entity_type: fs.entity_type, field_key: fs.field_key, ...(fs.shared_value_key ? { shared_value_key: fs.shared_value_key } : {}) };
            else delete (next as { field_source?: unknown }).field_source;
        }
        if (patch.content !== undefined && next.type === "text_block") {
            (next as { content: string }).content = patch.content;
        }
        if (patch.token_ids !== undefined && next.type === "text_block") {
            (next as { token_ids?: string[] }).token_ids = patch.token_ids;
        }
        return next;
    });
    return { ...schema, fields };
}

/** Remove a field (and its section reference). */
export function removeField(schema: FormSchemaV1, fieldId: string): FormSchemaV1 {
    return {
        ...schema,
        /*
         * Removing a question also removes any condition that pointed AT it. A visibility rule naming a
         * field that no longer exists is a dangling reference: the runtime evaluates it as "never show",
         * so a follow-up question would silently vanish from the family's form because somebody deleted
         * the question above it. Clearing the rule means the follow-up is simply always asked, which is
         * the safe direction to fail in.
         */
        fields: schema.fields
            .filter((f) => f.id !== fieldId)
            .map((f) => (conditionTriggerOf(f) === fieldId ? withoutVisibility(f) : f)),
        sections: schema.sections.map((s) => ({ ...s, field_ids: s.field_ids.filter((id) => id !== fieldId) })),
    };
}

/** Move a field up/down within its section. */
export function moveFieldWithinSection(schema: FormSchemaV1, fieldId: string, dir: -1 | 1): FormSchemaV1 {
    const sections = schema.sections.map((s) => {
        const idx = s.field_ids.indexOf(fieldId);
        if (idx === -1) return s;
        const to = idx + dir;
        if (to < 0 || to >= s.field_ids.length) return s;
        const ids = s.field_ids.slice();
        const [m] = ids.splice(idx, 1);
        ids.splice(to, 0, m);
        return { ...s, field_ids: ids };
    });
    return { ...schema, sections };
}

/** Add a new section (header). */
export function addSection(schema: FormSchemaV1, title: string): { schema: FormSchemaV1; sectionId: string } {
    const id = uid("sec");
    const section: FormSection = { id, title: title.trim() || `Section ${schema.sections.length + 1}`, field_ids: [] };
    return { schema: { ...schema, sections: [...schema.sections, section] }, sectionId: id };
}

/** Rename a section. */
export function renameSection(schema: FormSchemaV1, sectionId: string, title: string): FormSchemaV1 {
    return { ...schema, sections: schema.sections.map((s) => (s.id === sectionId ? { ...s, title: title.trim() || s.title } : s)) };
}

/** Remove a section and its fields (keeps schema valid). */
export function removeSection(schema: FormSchemaV1, sectionId: string): FormSchemaV1 {
    const section = schema.sections.find((s) => s.id === sectionId);
    const removeIds = new Set(section?.field_ids ?? []);
    return {
        ...schema,
        fields: schema.fields.filter((f) => !removeIds.has(f.id)),
        sections: schema.sections.filter((s) => s.id !== sectionId),
    };
}


/* ------------------------------------------------------------------ conditional questions */

/**
 * AUTHORING A CONDITION, in the one place both Form surfaces already share.
 *
 * The capability was built from the bottom up and never reached the top: `visibility` persists on the
 * draft, survives the save rebuild, reaches the published schema, and the participant renderer really
 * does hide the field (`evaluateFieldVisibility`). What never existed was any way to SEE or SET it while
 * authoring — the canonical canvas referenced `visibility` zero times and so did the canonical
 * inspector. So a condition was real to a family and invisible to the operator who owned it.
 *
 * These helpers are the authoring half, on the shared schema authority, so an imported form and a
 * hand-built one get the same behaviour from the same code.
 */

/** The question whose answer governs this one, when it has one. */
export function conditionTriggerOf(field: FormField): string | null {
    const clause = field.visibility?.all?.[0];
    return clause?.field_id ?? null;
}

/** The answer that reveals it: `true`/`false` for a yes/no, otherwise the literal choice. */
export function conditionValueOf(field: FormField): string | number | boolean | null | undefined {
    return field.visibility?.all?.[0]?.value;
}

function withoutVisibility(field: FormField): FormField {
    const next = { ...field } as FormField & { visibility?: unknown };
    delete next.visibility;
    return next;
}

/**
 * Questions that can govern another: a yes/no, or a choice with options to pick from.
 *
 * A question cannot be its own trigger, and a question that is ITSELF conditional is not offered —
 * nesting a condition on a condition is a rule the runtime evaluates one level deep, so offering it
 * would promise behaviour the form does not have.
 */
export function eligibleConditionTriggers(
    schema: FormSchemaV1,
    fieldId: string,
): Array<{ readonly id: string; readonly label: string; readonly answers: ReadonlyArray<{ value: string | boolean; label: string }> }> {
    const out: Array<{ id: string; label: string; answers: Array<{ value: string | boolean; label: string }> }> = [];
    for (const f of schema.fields) {
        if (f.id === fieldId) continue;
        if (conditionTriggerOf(f)) continue;
        if (f.type === "boolean") {
            out.push({ id: f.id, label: f.label, answers: [{ value: true, label: "Yes" }, { value: false, label: "No" }] });
            continue;
        }
        if (f.type === "select") {
            const options = (f as { static_options?: Array<{ value: string; label: string }> }).static_options ?? [];
            if (options.length) {
                out.push({ id: f.id, label: f.label, answers: options.map((o) => ({ value: o.value, label: o.label })) });
            }
        }
    }
    return out;
}

/**
 * Set or clear a question's condition.
 *
 * Passing `null` clears it, which makes the question always asked. A trigger that is not a field on
 * this form is refused rather than written: the schema validator rejects a visibility clause naming an
 * unknown field, so writing one would make the whole form unsaveable — it fails closed here instead.
 */
export function setFieldVisibility(
    schema: FormSchemaV1,
    fieldId: string,
    condition: { readonly triggerFieldId: string; readonly value: string | number | boolean | null } | null,
): FormSchemaV1 {
    const fields = schema.fields.map((f) => {
        if (f.id !== fieldId) return f;
        if (!condition) return withoutVisibility(f);
        if (!schema.fields.some((other) => other.id === condition.triggerFieldId)) return f;
        if (condition.triggerFieldId === fieldId) return f;
        return {
            ...f,
            visibility: { all: [{ field_id: condition.triggerFieldId, op: "eq" as const, value: condition.value }] },
        } as FormField;
    });
    return { ...schema, fields };
}


/* ------------------------------------------------------------------ field composition */

/**
 * ONE SOURCE CONCEPT BECOMING SEVERAL FORM FIELDS.
 *
 * A page prints "Parent/Guardian #1 Name" on one rule, and the record stores a first name and a last
 * name. Those are not in conflict — the paper is a layout and the record is a structure — but a single
 * text field can only ever satisfy one of them, so a guardian's name arrived as one blob that had to be
 * re-split by hand later, badly, for anyone with a two-word surname.
 *
 * This is the general mechanism rather than a "split name" button: a field is replaced, in place, by the
 * fields it is really made of. Each part is an ordinary Studio field with its own answer type, width and
 * destination, so a part maps to exactly one canonical field and nothing maps twice. The same mechanism
 * serves any composite a source prints on one line.
 *
 * The original is REPLACED, not kept alongside, because two questions asking for the same answer is the
 * duplicate an operator would have to notice and delete. An operator who wants it back adds a question;
 * the source evidence itself is untouched on the draft either way.
 */
export type FieldPart = {
    readonly label: string;
    /** Defaults to the original's type when absent — a name splits into text, a date would not split. */
    readonly type?: "text" | "number" | "date";
    readonly layout_width?: FormFieldLayoutWidth;
    /** The canonical destination for THIS part. Absent leaves it for the operator to choose. */
    readonly field_source?: FormFieldSource;
    readonly required?: boolean;
};

/**
 * Replace one field with its parts, keeping its place in the section.
 *
 * Refused — returning the schema untouched — when the field is absent, when it is a group (a group is
 * already a composition), or when fewer than two parts are offered, because "splitting" into one field
 * is a rename and should be done as one.
 */
export function splitFieldIntoParts(schema: FormSchemaV1, fieldId: string, parts: readonly FieldPart[]): FormSchemaV1 {
    const original = schema.fields.find((f) => f.id === fieldId);
    if (!original || original.type === "group" || parts.length < 2) return schema;

    const made: FormField[] = parts.map((part, index) => {
        const base = {
            id: `${fieldId}__${index + 1}`,
            label: part.label,
            required: part.required ?? original.required,
            /*
             * No source provenance is copied here, and that is deliberate: `page`/`bbox` are DRAFT
             * properties the published schema does not accept, so writing them would make the form
             * unsaveable. Provenance is re-attached on save from the draft field the part descends from.
             */
            ...(part.layout_width && part.layout_width !== "full" ? { layout_width: part.layout_width } : {}),
            ...(part.field_source ? { field_source: part.field_source } : {}),
        };
        const type = part.type ?? (original.type === "text" ? "text" : "text");
        return { ...base, type } as FormField;
    });

    const at = schema.fields.findIndex((f) => f.id === fieldId);
    const fields = [...schema.fields.slice(0, at), ...made, ...schema.fields.slice(at + 1)];
    const sections = schema.sections.map((section) => {
        const i = section.field_ids.indexOf(fieldId);
        if (i < 0) return section;
        return {
            ...section,
            field_ids: [...section.field_ids.slice(0, i), ...made.map((f) => f.id), ...section.field_ids.slice(i + 1)],
        };
    });

    /*
     * A condition that pointed at the field being replaced has lost its trigger. Clearing it means the
     * dependent question is always asked, rather than evaluating against a field that no longer exists
     * and disappearing from the family's form.
     */
    const repaired = fields.map((f) => (conditionTriggerOf(f) === fieldId ? withoutVisibility(f) : f));
    return { ...schema, fields: repaired, sections };
}

/** A person's name printed on one rule: the one composition the importer proposes on its own. */
const PERSON_NAME_LABEL =
    /^(?!.*\b(full\s*name|name\s+as\s+it\s+appears|legal\s+name)\b)(?=.*\bname\b).*$/i;

const EXPLICIT_SINGLE_FIELD = /\b(full\s*name|name\s+as\s+it\s+appears|legal\s+name|first\s+name|last\s+name|surname|given\s+name)\b/i;

/**
 * Should Alloy OFFER to split this question into a first and last name?
 *
 * Offered, never applied: §"do NOT silently split every arbitrary Name field". A label that is already
 * explicit about being one field, or already about one part of a name, is left alone — the document was
 * clear and the operator did not ask. Only a text question survives: a date called "Name of event" is
 * not a person.
 */
export function suggestsNameComposition(field: Pick<FormField, "type" | "label">): boolean {
    if (field.type !== "text") return false;
    const label = field.label.trim();
    if (!label || EXPLICIT_SINGLE_FIELD.test(label)) return false;
    return PERSON_NAME_LABEL.test(label);
}

/**
 * The first/last parts to offer for a person-name question.
 *
 * Half and half, so the rendered form puts them on one row the way a form asks for a name. The
 * destinations are left for the operator unless the original carried one, because guessing which record
 * a name belongs to is the mapping decision, not the composition decision.
 */
export function nameCompositionParts(field: Pick<FormField, "label" | "required" | "field_source">): readonly FieldPart[] {
    const entity = field.field_source?.entity_type;
    const prefix = field.label.replace(/\s*name\s*:?\s*$/i, "").trim();
    const name = (part: string) => (prefix ? `${prefix} ${part}` : part);
    return [
        {
            label: name("first name"),
            type: "text",
            layout_width: "half",
            required: field.required,
            ...(entity ? { field_source: { entity_type: entity, field_key: "first_name" } } : {}),
        },
        {
            label: name("last name"),
            type: "text",
            layout_width: "half",
            required: field.required,
            ...(entity ? { field_source: { entity_type: entity, field_key: "last_name" } } : {}),
        },
    ];
}
