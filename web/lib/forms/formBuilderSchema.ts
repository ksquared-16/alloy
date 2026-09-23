/**
 * Manual form builder — pure schema helpers.
 *
 * Lets operators build a useful FormSchemaV1 by hand (not only from PDF extraction):
 * create a blank form, add/edit/reorder/remove fields and sections, set options,
 * required, label/help, and optional canonical binding (field_source). Pure and
 * deterministic; the UI persists the resulting schema via the existing forms-admin save
 * route, and previews it with the existing FormEngineRenderer. No I/O.
 */

import type { FormField, FormSchemaV1, FormSection } from "@/lib/forms/schema";
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
    | "signature"
    /**
     * A repeated PERSON or CHILD — the emergency contacts, the siblings, the authorized pickups.
     *
     * It is the schema's existing `group` with `repeat` plus a `party_collection` statement. The
     * builder exposes it as one answer type because that is how an administrator thinks about it:
     * "collect a list of people", not "make a group, then make it repeat, then bind it".
     */
    | "party_collection";

/** What one repeated-party collection collects, in the words the inspector uses. */
export interface BuilderPartyCollectionSpec {
    action_key: string;
    subject: "person" | "child";
    role?: string;
    scope?: string;
    show_known?: boolean;
    allow_add?: boolean;
    add_another_label?: string;
    entry_label?: string;
    min?: number;
    max?: number;
    /** The questions asked about each person. Scalar types only — a party never nests a party. */
    fields?: Array<{ type: BuilderFieldType; label: string; required?: boolean }>;
}

export interface BuilderFieldSpec {
    type: BuilderFieldType;
    label: string;
    party_collection?: BuilderPartyCollectionSpec;
    required?: boolean;
    description?: string;
    /** For select/multiselect — inline choices, when the vocabulary is this Form's own. */
    options?: Array<{ value: string; label: string }>;
    /**
     * For select/multiselect — an ORGANIZATION vocabulary instead of inline choices.
     *
     * `person_gender` is the case that forced this: the tenant already maintains that list, and an
     * imported "How would you describe your child's gender?" text box should join it rather than
     * grow a private copy that drifts. Setting this clears inline options; they are two ways to say
     * the same thing and a field holding both has no single answer to "where do the choices come
     * from".
     */
    option_set_key?: string;
    /**
     * When this question is asked at all — the schema's own `visibility`, surfaced for authoring.
     *
     * One condition is what an imported "If yes, …" box needs, and it is all this exposes: the
     * field it depends on, and the answer that reveals it. `formVisibilitySchema` supports several
     * ANDed conditions and the evaluator honours them; nothing here prevents that, it simply does
     * not invent an authoring surface for a shape no imported paperwork has yet produced.
     */
    visible_when?: { field_id: string; equals: string | number | boolean | null } | null;
    /**
     * A value Alloy CALCULATES and never asks for.
     *
     * "Student Age Upon Enrolling" is the case: a family typing "2" is being asked to compute
     * something Alloy holds the inputs for. `derived` has existed in the schema all along with no
     * authoring path.
     */
    derived?: { kind: "age_from_date_of_birth" | "execution_date"; source_key?: string; as_of_key?: string } | null;
    /** Optional canonical binding; unbound fields are allowed. */
    field_source?: { entity_type: string; field_key: string; shared_value_key?: string };
    /**
     * For `file_ref` — the canonical document classification this upload satisfies.
     *
     * Without it every upload requirement is "a file". `participantUploadRequests` falls back to
     * `enrollment_document`, which is honest but says only "a document this enrollment asked for" —
     * so a family who attaches a physical cannot be told they still owe an immunization record. The
     * schema has carried this field all along; only the builder had no way to set it.
     */
    document_type?: string;
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
        ...(visibilityFromSpec(spec.visible_when) ? { visibility: visibilityFromSpec(spec.visible_when)! } : {}),
        ...(spec.derived?.kind ? { derived: { kind: spec.derived.kind, ...(spec.derived.source_key ? { source_key: spec.derived.source_key } : {}), ...(spec.derived.as_of_key ? { as_of_key: spec.derived.as_of_key } : {}) } } : {}),
    };
    switch (spec.type) {
        case "party_collection": {
            /*
             * One answer type in the menu, the schema's existing repeater underneath.
             *
             * `party_collection` is what makes the entries PEOPLE rather than rows: it carries the
             * canonical relationship action, the subject, the role and the scope, and the renderer
             * reads it for the button words and for refusing to let a family delete someone Alloy
             * already knows. The repetition itself is `repeat`, which the schema has always had.
             */
            const p = spec.party_collection;
            const entryFields = (p?.fields ?? []).map((f, i) =>
                fieldFromSpec(`${id}_${slug(f.label) || `field_${i + 1}`}`, {
                    type: f.type,
                    label: f.label,
                    required: f.required,
                }),
            );
            return {
                ...base,
                type: "group",
                required: Boolean(spec.required),
                fields: entryFields,
                repeat: {
                    min: Math.max(0, Math.trunc(p?.min ?? 0)),
                    ...(p?.max != null && p.max > 0 ? { max: Math.trunc(p.max) } : {}),
                },
                ...(p
                    ? {
                          party_collection: {
                              action_key: p.action_key,
                              subject: p.subject,
                              ...(p.role?.trim() ? { role: p.role.trim() } : {}),
                              ...(p.scope?.trim() ? { scope: p.scope.trim() } : {}),
                              show_known: p.show_known !== false,
                              allow_add: p.allow_add !== false,
                              ...(p.add_another_label?.trim() ? { add_another_label: p.add_another_label.trim() } : {}),
                              ...(p.entry_label?.trim() ? { entry_label: p.entry_label.trim() } : {}),
                          },
                      }
                    : {}),
            } as FormField;
        }
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
            return { ...base, type: "select", ...choiceSource(spec) };
        case "multiselect":
            return { ...base, type: "multiselect", ...choiceSource(spec) };
    }
}

/**
 * Where a closed question's answers come from — an organization vocabulary, or this Form's own list.
 *
 * Never both. The schema permits either and `validateFormSchema` requires at least one; a field
 * carrying both would have two answers to "what may the family choose", and the renderer would pick
 * one of them silently.
 */
function choiceSource(spec: BuilderFieldSpec): { option_set_key: string } | { static_options: Array<{ value: string; label: string }> } {
    const key = spec.option_set_key?.trim();
    if (key) return { option_set_key: key };
    return { static_options: (spec.options ?? []).filter((o) => o.value && o.label) };
}

/** The schema's own condition shape, from the one the inspector speaks. */
function visibilityFromSpec(v: BuilderFieldSpec["visible_when"]): { all: [{ field_id: string; op: "eq"; value: string | number | boolean | null }] } | null {
    if (!v || !v.field_id) return null;
    return { all: [{ field_id: v.field_id, op: "eq", value: v.equals }] };
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
        /*
         * WHAT THE OPERATOR TYPED IS WHAT THE EDITOR HOLDS.
         *
         * This used to read `patch.label.trim() || next.label`, and that single expression made it
         * impossible to type a space in a question label. A controlled input sends the whole value
         * on every keystroke, so "Does " arrives here, is trimmed back to "Does", and is handed
         * straight back to the input — the space is erased before the next character is typed. The
         * `||` fallback did the same to deletion: clearing the box restored the old label.
         *
         * Normalization is a COMMIT concern, not a keystroke concern. `normalizeFormSchemaForPersist`
         * applies the trim and the "Untitled" fallback when the draft is actually saved, which is
         * the moment the fallback was written for.
         */
        if (patch.label !== undefined) next.label = patch.label;
        if (patch.required !== undefined) next.required = Boolean(patch.required);
        if (patch.description !== undefined) {
            // Help text is prose too — same rule, same reason. Emptying the box removes it; anything
            // else is stored exactly as typed, spaces included.
            if (patch.description === "") delete (next as { description?: string }).description;
            else (next as { description?: string }).description = patch.description;
        }
        if (patch.options !== undefined && (next.type === "select" || next.type === "multiselect")) {
            (next as { static_options?: Array<{ value: string; label: string }> }).static_options = patch.options.filter((o) => o.value && o.label);
            // Choosing an inline list is choosing NOT to use the organization's vocabulary.
            delete (next as { option_set_key?: string }).option_set_key;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "option_set_key") && (next.type === "select" || next.type === "multiselect")) {
            const key = patch.option_set_key?.trim();
            if (key) {
                (next as { option_set_key?: string }).option_set_key = key;
                // and the inline copy goes, so the two can never disagree
                delete (next as { static_options?: unknown }).static_options;
            } else {
                delete (next as { option_set_key?: string }).option_set_key;
                if (!(next as { static_options?: unknown[] }).static_options?.length) {
                    (next as { static_options?: Array<{ value: string; label: string }> }).static_options = [];
                }
            }
        }
        /* Presence, not value — the same rule `field_source` needed, and for the same reason: the
           only way to say "ask this always" is to clear the condition. */
        if (Object.prototype.hasOwnProperty.call(patch, "visible_when")) {
            const v = visibilityFromSpec(patch.visible_when);
            if (v) (next as { visibility?: unknown }).visibility = v;
            else delete (next as { visibility?: unknown }).visibility;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "derived")) {
            const d = patch.derived;
            if (d?.kind) (next as { derived?: unknown }).derived = { kind: d.kind, ...(d.source_key ? { source_key: d.source_key } : {}), ...(d.as_of_key ? { as_of_key: d.as_of_key } : {}) };
            else delete (next as { derived?: unknown }).derived;
        }
        /*
         * UNBINDING IS SAYING `undefined`, SO `undefined` CANNOT MEAN "NOT MENTIONED".
         *
         * Every other key here uses `patch.x !== undefined` to mean "the caller did not mention
         * this", which is right for keys cleared by passing an empty string. `field_source` has no
         * empty form: the only way to say "this question no longer writes anywhere" is to pass
         * undefined — the exact value that guard skipped. So choosing "Form field only" in the
         * inspector silently did nothing, the binding survived, and a question that an
         * administrator had deliberately unbound went on writing to a canonical field.
         *
         * Presence in the patch is the signal now, so an absent key still means "leave it alone"
         * while a present-but-undefined key clears the binding.
         */
        if (Object.prototype.hasOwnProperty.call(patch, "field_source")) {
            const fs = patch.field_source;
            if (fs && fs.entity_type && fs.field_key) (next as { field_source?: unknown }).field_source = { entity_type: fs.entity_type, field_key: fs.field_key, ...(fs.shared_value_key ? { shared_value_key: fs.shared_value_key } : {}) };
            else delete (next as { field_source?: unknown }).field_source;
        }
        if (patch.document_type !== undefined && next.type === "file_ref") {
            const dt = patch.document_type.trim();
            if (dt) (next as { document_type?: string }).document_type = dt;
            // Cleared means unclassified, which the participant runtime reads as a plain
            // enrollment document — a real choice, not an absent one.
            else delete (next as { document_type?: string }).document_type;
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
        fields: schema.fields.filter((f) => f.id !== fieldId),
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
    // Verbatim while editing — see `updateField`. The fallback lives in `normalizeFormSchemaForPersist`.
    return { ...schema, sections: schema.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)) };
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

/**
 * The normalization the editor no longer does on every keystroke.
 *
 * An operator typing "Does your child have siblings?" passes through a dozen states that are not
 * yet a sentence — including every trailing space. Trimming those as they are typed makes a space
 * untypeable (see `updateField`), so the editor holds the text verbatim and this runs once, at the
 * moment the draft is actually written.
 *
 * It is deliberately the SAME rule the create path already applied (`fieldFromSpec`,
 * `createBlankSchema`, `addSection`): trim, and fall back to a placeholder rather than persist an
 * empty label a participant would be shown.
 */
export function normalizeFormSchemaForPersist(schema: FormSchemaV1): FormSchemaV1 {
    return {
        ...schema,
        title: schema.title.trim() || "Untitled form",
        sections: schema.sections.map((s, i) => ({ ...s, title: (s.title ?? "").trim() || `Section ${i + 1}` })),
        fields: schema.fields.map((f) => {
            const label = f.label.trim() || "Untitled";
            const description = (f as { description?: string }).description?.trim();
            const next = { ...f, label } as FormField & { description?: string };
            if (description) next.description = description;
            else delete next.description;
            return next;
        }),
    };
}
