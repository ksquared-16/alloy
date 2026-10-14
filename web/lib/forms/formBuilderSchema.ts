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
import { relationshipCollectionGroupField } from "@/lib/forms/relationshipCollectionGroup";
import { addressComponentOf, collapseAddressRun } from "@/lib/pos/processingCase/formDraft/importedAddressGroups";

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

/** Every field id in the schema, including those inside groups — a payload is keyed by field id. */
function allFieldIds(fields: readonly FormField[], into = new Set<string>()): Set<string> {
    for (const f of fields) {
        into.add(f.id);
        if (f.type === "group") allFieldIds(f.fields, into);
    }
    return into;
}

function uniqueFieldId(schema: FormSchemaV1, base: string): string {
    const existing = allFieldIds(schema.fields);
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
    return mapFieldById(schema, fieldId, (f) => {
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
        fields: releaseCalculationsOn(
            schema.fields
                .filter((f) => f.id !== fieldId)
                .map((f) => (conditionTriggerOf(f) === fieldId ? withoutVisibility(f) : f)),
            fieldId,
        ),
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


/* ------------------------------------------------------------------ answer types and choices */

/**
 * WHAT A QUESTION ASKS FOR, AND CHANGING IT.
 *
 * A question's answer type was fixed the moment it was created: the inspector printed it and offered
 * nothing. So an imported "Is there anyone who has a legal restraining order…?" stayed Short answer
 * forever, and could never control the follow-up that depends on it. The type is an authoring decision
 * like any other, and both Studio paths change it here.
 *
 * Changing it keeps everything that is not about the answer's shape — label, requiredness, help text,
 * width, destination, provenance, and the question's OWN condition. What depends on the old shape is
 * reconciled: choices appear or go away, and a follow-up whose rule can no longer be met by the new
 * answer (a "Yes" when the answer is now a date) is returned to "always asked" rather than left hidden
 * from every family.
 */
export type AnswerKind =
    | "short_text"
    | "long_text"
    | "number"
    | "date"
    | "boolean"
    | "select"
    | "multiselect"
    | "file_ref"
    | "signature";

export const ANSWER_KIND_OPTIONS: ReadonlyArray<{ value: AnswerKind; label: string }> = [
    { value: "short_text", label: "Short answer" },
    { value: "long_text", label: "Long answer" },
    { value: "boolean", label: "Yes / No" },
    { value: "select", label: "Dropdown (one choice)" },
    { value: "multiselect", label: "Multiple choice (several)" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "file_ref", label: "File upload" },
    { value: "signature", label: "Signature" },
];

/** The answer kind of a question, or null for a group / text block (they have no answer type). */
export function answerKindOf(field: FormField): AnswerKind | null {
    switch (field.type) {
        case "text":
            return (field as { multiline?: boolean }).multiline ? "long_text" : "short_text";
        case "number":
        case "date":
        case "boolean":
        case "select":
        case "multiselect":
        case "file_ref":
        case "signature":
            return field.type;
        default:
            return null;
    }
}

/** Properties that only make sense for one answer shape — dropped when the shape changes. */
const SHAPE_KEYS = ["static_options", "option_set_key", "multiline", "signature", "document_type", "placeholder"] as const;

/** Follow-ups of `triggerId` whose rule the trigger can no longer satisfy go back to "always asked". */
function pruneDependentsOf(schema: FormSchemaV1, triggerId: string): FormSchemaV1 {
    let changed = false;
    const fields = schema.fields.map((f) => {
        const clause = f.visibility?.all?.[0];
        if (!clause || clause.field_id !== triggerId) return f;
        const trigger = eligibleConditionTriggers(schema, f.id).find((t) => t.id === triggerId);
        if (trigger && answerFitsTrigger(trigger, clause.value)) return f;
        changed = true;
        return withoutVisibility(f);
    });
    return changed ? { ...schema, fields } : schema;
}

export function changeAnswerKind(schema: FormSchemaV1, fieldId: string, kind: AnswerKind): FormSchemaV1 {
    const located = findFieldDeep(schema, fieldId);
    if (!located || !groupChildAuthoring(schema, fieldId).canChangeAnswerType) return schema;
    const current = located.field;
    // A calculated answer has no answer type of its own to choose — it is what the calculation makes.
    if (current.derived) return schema;
    const from = answerKindOf(current);
    if (!from || from === kind) return schema;

    const next = { ...current } as Record<string, unknown>;
    const priorOptions = (current as { static_options?: StaticOption[] }).static_options ?? [];
    for (const key of SHAPE_KEYS) delete next[key];

    switch (kind) {
        case "short_text":
            next.type = "text";
            break;
        case "long_text":
            next.type = "text";
            next.multiline = true;
            break;
        case "select":
        case "multiselect":
            next.type = kind;
            next.static_options = priorOptions.length
                ? priorOptions
                : from === "boolean"
                  ? [
                        { value: "yes", label: "Yes" },
                        { value: "no", label: "No" },
                    ]
                  : [{ value: "option_1", label: "Option 1" }];
            break;
        default:
            next.type = kind;
    }

    let changed = mapFieldById(schema, fieldId, () => next as unknown as FormField);
    // A calculation that read this question as a DATE can no longer read it.
    if (kind !== "date") changed = { ...changed, fields: releaseCalculationsOn(changed.fields, fieldId) };
    return pruneDependentsOf(changed, fieldId);
}

function optionsOf(schema: FormSchemaV1, fieldId: string): StaticOption[] | null {
    const f = schema.fields.find((x) => x.id === fieldId);
    if (!f || (f.type !== "select" && f.type !== "multiselect")) return null;
    return [...((f as { static_options?: StaticOption[] }).static_options ?? [])];
}

function withOptions(schema: FormSchemaV1, fieldId: string, options: StaticOption[]): FormSchemaV1 {
    const fields = schema.fields.map((f) => (f.id === fieldId ? ({ ...f, static_options: options } as FormField) : f));
    return pruneDependentsOf({ ...schema, fields }, fieldId);
}

/**
 * A choice's stored VALUE never changes when its label is edited — a condition or a submitted answer
 * that names it keeps meaning the same choice. A new choice gets a fresh value from its label.
 */
export function renameFieldOption(schema: FormSchemaV1, fieldId: string, index: number, label: string): FormSchemaV1 {
    const options = optionsOf(schema, fieldId);
    if (!options || !options[index]) return schema;
    const text = label.trim();
    if (!text) return schema;
    options[index] = { ...options[index]!, label: text };
    return withOptions(schema, fieldId, options);
}

export function addFieldOption(schema: FormSchemaV1, fieldId: string, label = "New choice"): FormSchemaV1 {
    const options = optionsOf(schema, fieldId);
    if (!options) return schema;
    const used = new Set(options.map((o) => o.value));
    const base = slug(label);
    let value = base;
    for (let i = 2; used.has(value); i += 1) value = `${base}_${i}`;
    return withOptions(schema, fieldId, [...options, { value, label: label.trim() || "New choice" }]);
}

/** Removing a choice also releases any follow-up that was waiting for it. The last choice stays. */
export function removeFieldOption(schema: FormSchemaV1, fieldId: string, index: number): FormSchemaV1 {
    const options = optionsOf(schema, fieldId);
    if (!options || options.length <= 1 || !options[index]) return schema;
    options.splice(index, 1);
    return withOptions(schema, fieldId, options);
}


/* ------------------------------------------------------------------ repeatable groups */

/**
 * "Please provide at least two emergency contacts" is a MINIMUM, not instructional text. The schema has
 * always carried `repeat.min` / `repeat.max` and the participant runtime enforces them on submit; what
 * was missing was a way to set them in Forms Studio. Whole numbers only; a maximum below the minimum is
 * refused rather than silently corrected.
 */
export function setGroupRepeat(
    schema: FormSchemaV1,
    groupId: string,
    repeat: { readonly min: number; readonly max?: number | null },
): FormSchemaV1 {
    const group = schema.fields.find((f) => f.id === groupId);
    if (!group || group.type !== "group") return schema;
    const min = Math.trunc(repeat.min);
    if (!Number.isFinite(min) || min < 0) return schema;
    const max = repeat.max == null ? null : Math.trunc(repeat.max);
    if (max != null && (!Number.isFinite(max) || max < 1 || max < min)) return schema;
    const fields = schema.fields.map((f) =>
        f.id === groupId ? ({ ...f, repeat: { min, ...(max != null ? { max } : {}) } } as FormField) : f,
    );
    return { ...schema, fields };
}

/** Add the repeatable group for a canonical relationship (Emergency contacts, Physicians, …). */
export function addRelationshipGroup(
    schema: FormSchemaV1,
    definitionKey: string,
    sectionId: string,
): { schema: FormSchemaV1; fieldId: string } | null {
    const id = uniqueFieldId(schema, `people_${definitionKey}`);
    const group = relationshipCollectionGroupField(definitionKey, id);
    if (!group) return null;
    const targetSectionId = schema.sections.some((s) => s.id === sectionId) ? sectionId : schema.sections[0]?.id;
    const sections = targetSectionId
        ? schema.sections.map((s) => (s.id === targetSectionId ? { ...s, field_ids: [...s.field_ids, id] } : s))
        : [{ id: uid("sec"), title: "Section 1", field_ids: [id] }];
    return { schema: { ...schema, fields: [...schema.fields, group], sections }, fieldId: id };
}


/* ------------------------------------------------------------------ structured address */

/**
 * ONE ADDRESS CONCEPT, MANY LINES.
 *
 * The importer already collapses a run of address-line questions into one address group
 * (`collapseAddressRun`). The SAME function does it here on the operator's request, so an address
 * typed into a hand-built form, or one the importer did not recognise, becomes the same group: one
 * address, each line still mapped to its own component, City | State | ZIP side by side.
 */
function sectionOfField(schema: FormSchemaV1, fieldId: string): FormSection | undefined {
    return schema.sections.find((s) => s.field_ids.includes(fieldId));
}

function addressRunAround(schema: FormSchemaV1, fieldId: string) {
    const section = sectionOfField(schema, fieldId);
    if (!section) return null;
    const byId = new Map(schema.fields.map((f) => [f.id, f] as const));
    const sectionFields = section.field_ids.map((id) => byId.get(id)).filter((f): f is FormField => f != null);
    const idx = sectionFields.findIndex((f) => f.id === fieldId);
    if (idx < 0 || !addressComponentOf(sectionFields[idx]!.field_source)) return null;
    let start = idx;
    while (start > 0 && addressComponentOf(sectionFields[start - 1]!.field_source)) start -= 1;
    const run = collapseAddressRun(sectionFields, start);
    if (!run) return null;
    const runIds = run.indices.map((i) => sectionFields[i]!.id);
    if (!runIds.includes(fieldId)) return null;
    return { section, run, runIds };
}

/** True when the question sits in a run of address lines that can become one address. */
export function canStructureAddressAt(schema: FormSchemaV1, fieldId: string): boolean {
    return addressRunAround(schema, fieldId) != null;
}

export function structureAddressAt(schema: FormSchemaV1, fieldId: string): FormSchemaV1 {
    const found = addressRunAround(schema, fieldId);
    if (!found) return schema;
    const { section, run, runIds } = found;
    const groupId = uniqueFieldId(schema, run.group.id);
    const group = { ...run.group, id: groupId } as FormField;
    const consumed = new Set(runIds);
    const firstAt = schema.fields.findIndex((f) => consumed.has(f.id));
    const fields = schema.fields.filter((f) => !consumed.has(f.id));
    fields.splice(Math.min(firstAt, fields.length), 0, group);
    const sections = schema.sections.map((s) => {
        if (s.id !== section.id) return s;
        const at = s.field_ids.findIndex((id) => consumed.has(id));
        const ids = s.field_ids.filter((id) => !consumed.has(id));
        ids.splice(at, 0, groupId);
        return { ...s, field_ids: ids };
    });
    // Conditions on the address lines now hang off the address as a whole.
    return { ...schema, fields, sections };
}

/** Undo `structureAddressAt`: the address's lines become individual questions again, in place. */
export function ungroupAddress(schema: FormSchemaV1, groupId: string): FormSchemaV1 {
    const group = schema.fields.find((f) => f.id === groupId);
    if (!group || group.type !== "group" || !(group as { address_binding?: unknown }).address_binding) return schema;
    const children = (group as { fields: FormField[] }).fields;
    const at = schema.fields.findIndex((f) => f.id === groupId);
    const fields = [...schema.fields];
    fields.splice(at, 1, ...children);
    const sections = schema.sections.map((s) => {
        const i = s.field_ids.indexOf(groupId);
        if (i < 0) return s;
        const ids = [...s.field_ids];
        ids.splice(i, 1, ...children.map((c) => c.id));
        return { ...s, field_ids: ids };
    });
    return { ...schema, fields, sections };
}


/* ------------------------------------------------------------------ fields inside groups */

/**
 * A GROUP'S LINES ARE QUESTIONS TOO.
 *
 * An address's City, or a people group's Phone, is an ordinary field that happens to live inside a
 * group. Every editing helper here used to look only at `schema.fields`, so a line inside a group could
 * not be renamed, re-mapped or resized even through code, and the Studio could only select the group as
 * a whole. These helpers find and replace a field wherever it lives.
 */
export type FieldLocation = {
    readonly field: FormField;
    /** The group the field sits in, or null for a top-level question. */
    readonly parent: (FormField & { type: "group" }) | null;
};

export function findFieldDeep(schema: FormSchemaV1, fieldId: string): FieldLocation | null {
    const walk = (fields: readonly FormField[], parent: FieldLocation["parent"]): FieldLocation | null => {
        for (const f of fields) {
            if (f.id === fieldId) return { field: f, parent };
            if (f.type === "group") {
                const hit = walk(f.fields, f);
                if (hit) return hit;
            }
        }
        return null;
    };
    return walk(schema.fields, null);
}

/** Replace one field, top-level or inside a group, leaving everything else untouched. */
export function mapFieldById(schema: FormSchemaV1, fieldId: string, fn: (field: FormField) => FormField): FormSchemaV1 {
    let hit = false;
    const walk = (fields: FormField[]): FormField[] =>
        fields.map((f) => {
            if (f.id === fieldId) {
                hit = true;
                return fn(f);
            }
            if (f.type === "group") {
                const inner = walk(f.fields);
                return inner === f.fields ? f : ({ ...f, fields: inner } as FormField);
            }
            return f;
        });
    const fields = walk(schema.fields);
    return hit ? { ...schema, fields } : schema;
}

/**
 * What an operator may change on a field, given the group it sits in.
 *
 * A PEOPLE group's lines are the relationship definition's own fields: the definition decides that an
 * Emergency Contact has a Phone and where it is stored, and persistence writes them through it. Re-mapping
 * or re-typing one of them in Studio would write an answer the relationship cannot store, so those lines
 * keep their label, requiredness and width editable and say where they are stored instead. An address
 * line, or a line of a plain group, is an ordinary field and is fully editable.
 */
export type GroupChildAuthoring = {
    readonly groupKind: "address" | "people" | "group" | null;
    readonly canChangeAnswerType: boolean;
    readonly canChangeDestination: boolean;
};

export function groupChildAuthoring(schema: FormSchemaV1, fieldId: string): GroupChildAuthoring {
    const located = findFieldDeep(schema, fieldId);
    const parent = located?.parent ?? null;
    if (!parent) return { groupKind: null, canChangeAnswerType: true, canChangeDestination: true };
    const g = parent as { collection_binding?: unknown; address_binding?: unknown };
    if (g.collection_binding) return { groupKind: "people", canChangeAnswerType: false, canChangeDestination: false };
    if (g.address_binding) return { groupKind: "address", canChangeAnswerType: true, canChangeDestination: true };
    return { groupKind: "group", canChangeAnswerType: true, canChangeDestination: true };
}

/** Width of any field, wherever it lives. A group's line has no neighbours to re-balance. */
export function setAnyFieldLayoutWidth(schema: FormSchemaV1, fieldId: string, width: FormFieldLayoutWidth): FormSchemaV1 {
    return mapFieldById(schema, fieldId, (f) => {
        const next = { ...f } as FormField & { layout_width?: FormFieldLayoutWidth };
        if (width === "full") delete next.layout_width;
        else next.layout_width = width;
        return next;
    });
}


/* ------------------------------------------------------------------ duplicate */

/**
 * "Parent name" → copy → "Parent first name", without building the question again.
 *
 * The copy is a NEW question: a new id (so its answers, conditions and mapping are its own), placed
 * directly below the original. It keeps how the question is ASKED — answer type, choices, requiredness,
 * help text, width and the condition that reveals it — because that is what makes copying faster than
 * starting over.
 *
 * It does NOT keep where the answer is STORED. Two questions writing the same canonical field is a
 * conflict nobody chose: if "Parent first name" were copied with its destination, the copy would write
 * First name too. The copy starts as a Form field until the operator gives it its own destination. A
 * calculation is not copied either — it describes the original's value, not the copy's.
 *
 * Refused for a group (its lines' identities and relationship binding cannot be duplicated as one
 * question) and for a field inside a group.
 */
export function duplicateField(schema: FormSchemaV1, fieldId: string): { schema: FormSchemaV1; fieldId: string } | null {
    const located = findFieldDeep(schema, fieldId);
    if (!located || located.parent || located.field.type === "group") return null;
    const original = located.field;
    const id = uniqueFieldId(schema, `${original.id}_copy`);
    const copy = { ...original, id, label: `${original.label} (copy)` } as Record<string, unknown>;
    for (const key of ["field_source", "derived", "read_only", "pdf_slot", "entity_hint"]) delete copy[key];
    const made = copy as unknown as FormField;

    const at = schema.fields.findIndex((f) => f.id === fieldId);
    const fields = [...schema.fields.slice(0, at + 1), made, ...schema.fields.slice(at + 1)];
    const sections = schema.sections.map((section) => {
        const i = section.field_ids.indexOf(fieldId);
        if (i < 0) return section;
        return { ...section, field_ids: [...section.field_ids.slice(0, i + 1), id, ...section.field_ids.slice(i + 1)] };
    });
    return { schema: { ...schema, fields, sections }, fieldId: id };
}


/* ------------------------------------------------------------------ calculated answers */

/**
 * AN ANSWER ALLOY WORKS OUT, INSTEAD OF ASKING FOR.
 *
 * "Student Age Upon Enrolling" is not a question: the family already gives the child's date of birth,
 * and the form already asks when enrollment starts. The schema has always been able to say so — a field's
 * `derived` declaration, which the submit path and the enrollment artifact both resolve through the
 * platform derived-field doctrine — but nothing in Forms Studio could set it, so an operator could only
 * leave the box for the family to fill.
 *
 * Two calculations exist, because two exist in the platform doctrine:
 *   - an AGE, from a date-of-birth question, as of another date question in the form (the enrollment
 *     start date). The as-of is required: an age is only ever an age on a date, and the platform refuses
 *     to substitute "today" for the date that was meant;
 *   - the DATE THE FORM IS SIGNED, which exists only once the family submits.
 *
 * A calculated field is shown to the family, never asked. Its type follows the calculation — an age is words
 * ("5 years 4 months"), a signing date is a date — because that is what the resolver stores and what
 * validation enforces.
 */
export type FieldCalculation =
    | { readonly kind: "age_from_date_of_birth"; readonly source_key: string; readonly as_of_key: string }
    | { readonly kind: "execution_date" };

/** Date questions a calculation on `fieldId` may read: top-level, not itself calculated, not the field. */
export function calculationDateSources(schema: FormSchemaV1, fieldId: string): Array<{ id: string; label: string }> {
    return schema.fields
        .filter((f) => f.id !== fieldId && f.type === "date" && !f.derived)
        .map((f) => ({ id: f.id, label: f.label }));
}

export function calculationOf(field: FormField): FieldCalculation | null {
    const d = field.derived;
    if (!d) return null;
    if (d.kind === "execution_date") return { kind: "execution_date" };
    return { kind: "age_from_date_of_birth", source_key: d.source_key ?? "", as_of_key: d.as_of_key ?? "" };
}

/** Set or clear a field's calculation. Refuses anything it cannot honestly compute. */
export function setFieldCalculation(schema: FormSchemaV1, fieldId: string, calculation: FieldCalculation | null): FormSchemaV1 {
    const located = findFieldDeep(schema, fieldId);
    if (!located || located.parent) return schema;
    const field = located.field;
    if (field.type === "group" || field.type === "text_block" || field.type === "signature" || field.type === "file_ref") return schema;

    if (calculation === null) {
        if (!field.derived) return schema;
        return mapFieldById(schema, fieldId, (f) => {
            const next = { ...f } as Record<string, unknown>;
            delete next.derived;
            delete next.read_only;
            return next as unknown as FormField;
        });
    }

    if (calculation.kind === "age_from_date_of_birth") {
        const sources = new Set(calculationDateSources(schema, fieldId).map((s) => s.id));
        if (!sources.has(calculation.source_key) || !sources.has(calculation.as_of_key)) return schema;
        if (calculation.source_key === calculation.as_of_key) return schema;
    }

    const type = calculation.kind === "execution_date" ? "date" : "text";
    const derived =
        calculation.kind === "execution_date"
            ? { kind: "execution_date" as const }
            : { kind: "age_from_date_of_birth" as const, source_key: calculation.source_key, as_of_key: calculation.as_of_key };

    const next = mapFieldById(schema, fieldId, (f) => {
        const out = { ...f } as Record<string, unknown>;
        for (const key of SHAPE_KEYS) delete out[key];
        out.type = type;
        out.derived = derived;
        /*
         * Not `read_only`. The declaration is `derived`, and the participant renderer shows a derived
         * field read-only on its own. `read_only` means something else to the runtime — a placement-only
         * destination, hidden from the family until it holds a value — and setting it hid the age the
         * family should see being worked out.
         */
        delete out.read_only;
        return out as unknown as FormField;
    });
    // Nothing a calculation produces is a Yes/No or a choice, so rules that waited for one go back to always asked.
    return pruneDependentsOf(next, fieldId);
}

/** Calculations that read `removedId` stop being calculations (they cannot be computed any more). */
function releaseCalculationsOn(fields: FormField[], removedId: string): FormField[] {
    return fields.map((f) => {
        const d = f.derived;
        if (!d || (d.source_key !== removedId && d.as_of_key !== removedId)) return f;
        const next = { ...f } as Record<string, unknown>;
        delete next.derived;
        delete next.read_only;
        return next as unknown as FormField;
    });
}
