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
        /*
         * PRESENCE of the key is the instruction, not its value. "Form field only" in the inspector
         * passes `field_source: undefined`, and testing `!== undefined` skipped it — so choosing it never
         * cleared anything, and a destination could not be removed from either Studio path.
         */
        if ("field_source" in patch) {
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

/** The answer that reveals it: `true`/`false` for a yes/no, otherwise the literal choice or value. */
export function conditionValueOf(field: FormField): string | number | boolean | null | undefined {
    return field.visibility?.all?.[0]?.value;
}

/** The runtime's two comparisons, in the operator's words: `eq` is "is", `neq` is "is not". */
export type ConditionComparison = "eq" | "neq";

export function conditionComparisonOf(field: FormField): ConditionComparison {
    return field.visibility?.all?.[0]?.op === "neq" ? "neq" : "eq";
}

/**
 * How a controlling question's answer is compared, which decides how the operator states it.
 *
 * Every kind here is a scalar the runtime already compares exactly (`valuesEqual`): a yes/no is a
 * boolean, a choice is the stored option value, text is the string as typed, a number is a number and
 * a date is the `YYYY-MM-DD` string the date input stores. Nothing is offered that the runtime would
 * have to learn — no "contains", no range, no membership in a multi-select, no OR.
 */
export type ConditionAnswerKind = "boolean" | "choice" | "text" | "number" | "date";

export type ConditionTrigger = {
    readonly id: string;
    readonly label: string;
    readonly kind: ConditionAnswerKind;
    /** The answers to pick from, for a yes/no or a choice. Empty for a typed answer. */
    readonly answers: ReadonlyArray<{ value: string | boolean; label: string }>;
};

export type UnavailableConditionTrigger = {
    readonly id: string;
    readonly label: string;
    /** Why this question cannot control another, in the operator's words. */
    readonly reason: string;
};

function withoutVisibility(field: FormField): FormField {
    const next = { ...field } as FormField & { visibility?: unknown };
    delete next.visibility;
    return next;
}

type StaticOption = { value: string; label: string };

function staticOptionsOf(field: FormField): StaticOption[] {
    return (field as { static_options?: StaticOption[] }).static_options ?? [];
}

/** The answer kind a question can be compared by, or the reason it cannot control another question. */
function conditionKindOf(field: FormField): { kind: ConditionAnswerKind } | { reason: string } {
    switch (field.type) {
        case "boolean":
            return { kind: "boolean" };
        case "select":
            return staticOptionsOf(field).length
                ? { kind: "choice" }
                : { reason: "This dropdown has no choices written on the form, so there is no answer to pick." };
        case "text":
            return (field as { multiline?: boolean }).multiline
                ? { reason: "Long answers are written freely, so they can't be matched to one exact answer." }
                : { kind: "text" };
        case "number":
            return { kind: "number" };
        case "date":
            return { kind: "date" };
        case "multiselect":
            return { reason: "Families can pick several answers here, and a condition compares a single answer." };
        case "signature":
            return { reason: "A signature has no answer to compare." };
        case "file_ref":
            return { reason: "An upload has no answer to compare." };
        case "group":
            return { reason: "A repeating group holds several answers, not one." };
        default:
            return { reason: "This kind of question has no single answer to compare." };
    }
}

/**
 * True when `fromId` is only asked because of `targetId` — directly, or through a chain of conditions.
 *
 * This is the cycle test. The runtime would not loop on a cycle (it treats one as hidden), but a cycle
 * is a form in which neither question can ever be shown, which is never what an operator meant.
 */
export function conditionDependsOn(schema: FormSchemaV1, fromId: string, targetId: string): boolean {
    const byId = new Map(schema.fields.map((f) => [f.id, f] as const));
    const seen = new Set<string>();
    const stack = [fromId];
    while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const clause of byId.get(id)?.visibility?.all ?? []) {
            if (clause.field_id === targetId) return true;
            stack.push(clause.field_id);
        }
    }
    return false;
}

/** True when making `fieldId` depend on `triggerFieldId` would be self-reference or a cycle. */
export function conditionWouldCycle(schema: FormSchemaV1, fieldId: string, triggerFieldId: string): boolean {
    return triggerFieldId === fieldId || conditionDependsOn(schema, triggerFieldId, fieldId);
}

/**
 * Every question on the form, sorted into the ones that can control `fieldId` and the ones that cannot
 * — with the reason, so the list never looks like an arbitrary subset.
 *
 * A question that is itself conditional IS offered: the runtime evaluates visibility recursively, so a
 * question hidden by its own condition also hides everything that depends on it. Only a choice that
 * would close a loop back to `fieldId` is withheld.
 */
export function conditionTriggerOptions(
    schema: FormSchemaV1,
    fieldId: string,
): { readonly eligible: ConditionTrigger[]; readonly unavailable: UnavailableConditionTrigger[] } {
    const eligible: ConditionTrigger[] = [];
    const unavailable: UnavailableConditionTrigger[] = [];
    for (const f of schema.fields) {
        if (f.id === fieldId) continue;
        if (f.type === "text_block") continue;
        const kind = conditionKindOf(f);
        if ("reason" in kind) {
            unavailable.push({ id: f.id, label: f.label, reason: kind.reason });
            continue;
        }
        if (conditionDependsOn(schema, f.id, fieldId)) {
            unavailable.push({
                id: f.id,
                label: f.label,
                reason: "It is only asked because of this question, so it can't control this question in return.",
            });
            continue;
        }
        const answers =
            kind.kind === "boolean"
                ? [
                      { value: true, label: "Yes" },
                      { value: false, label: "No" },
                  ]
                : kind.kind === "choice"
                  ? staticOptionsOf(f).map((o) => ({ value: o.value, label: o.label }))
                  : [];
        eligible.push({ id: f.id, label: f.label, kind: kind.kind, answers });
    }
    return { eligible, unavailable };
}

/** The questions that can control `fieldId`. @see conditionTriggerOptions for the ones that cannot. */
export function eligibleConditionTriggers(schema: FormSchemaV1, fieldId: string): ConditionTrigger[] {
    return conditionTriggerOptions(schema, fieldId).eligible;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(raw: string): boolean {
    if (!ISO_DATE.test(raw)) return false;
    const d = new Date(`${raw}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/**
 * The value an operator typed, as the runtime will compare it — or `null` when it is not a usable
 * answer yet (empty text, not a number, not a real date).
 */
export function parseConditionAnswer(kind: ConditionAnswerKind, raw: string): string | number | null {
    const text = raw.trim();
    if (!text) return null;
    if (kind === "number") {
        const n = Number(text);
        return Number.isFinite(n) ? n : null;
    }
    if (kind === "date") return isRealIsoDate(text) ? text : null;
    return text;
}

/** Whether `value` is an answer the trigger can actually give, in the type the runtime compares. */
function answerFitsTrigger(trigger: ConditionTrigger, value: string | number | boolean | null): boolean {
    switch (trigger.kind) {
        case "boolean":
            return typeof value === "boolean";
        case "choice":
            return typeof value === "string" && trigger.answers.some((a) => a.value === value);
        case "text":
            return typeof value === "string" && value.trim().length > 0;
        case "number":
            return typeof value === "number" && Number.isFinite(value);
        case "date":
            return typeof value === "string" && isRealIsoDate(value);
    }
}

/**
 * Set or clear a question's condition.
 *
 * Passing `null` clears it, which makes the question always asked. Anything the form could not honour
 * is refused rather than written — the schema is returned unchanged:
 *   • a trigger that is not a field on this form (the validator would reject the whole form);
 *   • the question itself, or a trigger that is only asked because of this question (a cycle);
 *   • a trigger that has no single comparable answer;
 *   • an answer the trigger cannot give, or one in the wrong type (the runtime compares exactly, so a
 *     "3" would never equal a 3).
 */
export function setFieldVisibility(
    schema: FormSchemaV1,
    fieldId: string,
    condition: {
        readonly triggerFieldId: string;
        readonly value: string | number | boolean | null;
        readonly comparison?: ConditionComparison;
    } | null,
): FormSchemaV1 {
    if (!schema.fields.some((f) => f.id === fieldId)) return schema;
    if (condition) {
        if (conditionWouldCycle(schema, fieldId, condition.triggerFieldId)) return schema;
        const trigger = eligibleConditionTriggers(schema, fieldId).find((t) => t.id === condition.triggerFieldId);
        if (!trigger) return schema;
        if (!answerFitsTrigger(trigger, condition.value)) return schema;
    }
    const value = condition && typeof condition.value === "string" ? condition.value.trim() : condition?.value ?? null;
    const fields = schema.fields.map((f) => {
        if (f.id !== fieldId) return f;
        if (!condition) return withoutVisibility(f);
        return {
            ...f,
            visibility: { all: [{ field_id: condition.triggerFieldId, op: condition.comparison ?? "eq", value }] },
        } as FormField;
    });
    return { ...schema, fields };
}

/**
 * The condition as one sentence an operator can read on the canvas and in the inspector, with the
 * answer in its own words — a choice's label rather than its stored value, Yes / No for a boolean.
 */
export function describeCondition(schema: FormSchemaV1, field: FormField): string | null {
    const triggerId = conditionTriggerOf(field);
    if (!triggerId) return null;
    const value = conditionValueOf(field);
    const trigger = schema.fields.find((f) => f.id === triggerId);
    const choice = trigger && typeof value === "string" ? staticOptionsOf(trigger).find((o) => o.value === value) : undefined;
    const answer =
        value === true
            ? "Yes"
            : value === false
              ? "No"
              : value === null || value === undefined
                ? "blank"
                : choice
                  ? choice.label
                  : trigger?.type === "text"
                    ? `“${String(value)}”`
                    : String(value);
    const verb = conditionComparisonOf(field) === "neq" ? "is not" : "is";
    return trigger
        ? `Only asked when “${trigger.label}” ${verb} ${answer}`
        : `Only asked when an earlier answer ${verb} ${answer}`;
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
