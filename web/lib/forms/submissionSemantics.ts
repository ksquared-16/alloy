/**
 * THE AUTHORED SEMANTICS EVERY PARTICIPANT RUNTIME HONOURS.
 *
 * Forms Studio authors conditions, groups and their minimums once, on the Form. The generic public
 * runtime and the Enrollment participant runtime both collect answers to that Form and both finish
 * through the one public submit route — so the rules about what is SHOWN, and how a group's answers are
 * SHAPED for submission, live here once and both consume them. Neither runtime keeps its own copy.
 *
 * Pure. No I/O.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { evaluateFieldVisibility } from "@/lib/forms/validateSubmission";

type GroupField = FormField & { type: "group"; fields: FormField[] };

/** Parent group of every field nested in a group, by id. */
function parentIndex(schema: FormSchemaV1): Map<string, GroupField> {
    const parents = new Map<string, GroupField>();
    const walk = (fields: readonly FormField[], parent: GroupField | null) => {
        for (const f of fields) {
            if (parent) parents.set(f.id, parent);
            if (f.type === "group") walk((f as GroupField).fields, f as GroupField);
        }
    };
    walk(schema.fields, null);
    return parents;
}

/**
 * Is this field shown, given the answers so far?
 *
 * Its own condition AND every enclosing group's — a line of a hidden group is hidden, which is the
 * current model: a group's lines follow the group's visibility rule.
 */
export function fieldShownForAnswers(
    schema: FormSchemaV1,
    fieldId: string,
    getValue: (fieldId: string) => unknown,
): boolean {
    const parents = parentIndex(schema);
    let id: string | undefined = fieldId;
    while (id) {
        if (!evaluateFieldVisibility(id, schema, getValue)) return false;
        id = parents.get(id)?.id;
    }
    return true;
}

/**
 * The fields whose answer decides whether ANOTHER field is shown.
 *
 * Such a field is a question by construction: its answer changes what the family must do next
 * ("Do you have other children?" → the Other children collection). Every participant runtime reads
 * this one set, so none of them can present a controlling answer as something else — a tick box at
 * signing, say — and leave the collection it opens unreachable.
 */
export function fieldIdsControllingVisibility(schema: FormSchemaV1): ReadonlySet<string> {
    const out = new Set<string>();
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            for (const cond of f.visibility?.all ?? []) out.add(cond.field_id);
            if (f.type === "group") walk((f as GroupField).fields);
        }
    };
    walk(schema.fields);
    return out;
}

function hasAnswer(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

type Row = { instance_key: string; values: Record<string, unknown>; signatures?: Record<string, unknown>; groups?: Record<string, unknown> };

/**
 * Shape a participant payload for submission against the published schema.
 *
 * 1. A GROUP'S ANSWERS ARE ITS ROWS. A group is submitted as `groups[groupId]` rows — the shape the
 *    generic renderer writes and the validator checks (minimum, per-row requiredness). A runtime that
 *    collected a non-repeating group's lines one by one (an address the conversation asked line by
 *    line) holds them flat in `values`; they are folded into that group's single row when it has
 *    none. The flat values are kept as well, because the signed-document fill reads lines by id.
 *    A people group (relationship collection) is never folded: its members are rows by nature, and
 *    one flat answer is not a member.
 *
 * 2. A HIDDEN QUESTION HAS NO ANSWER. A value given before its controlling answer changed would
 *    otherwise be refused at submit ("hidden and must be empty") — the family is blocked by a
 *    question they can no longer see. Hidden questions and groups are cleared before validation.
 */
export function normalizeSubmissionForSchema<P extends { values?: Record<string, unknown>; groups?: Record<string, unknown>; signatures?: Record<string, unknown> }>(
    schema: FormSchemaV1,
    payload: P,
): P {
    const values: Record<string, unknown> = { ...(payload.values ?? {}) };
    const groups: Record<string, unknown> = { ...(payload.groups ?? {}) };
    const signatures: Record<string, unknown> = { ...(payload.signatures ?? {}) };

    for (const field of schema.fields) {
        if (field.type !== "group") continue;
        const g = field as GroupField & { collection_binding?: unknown; repeat?: { max?: number } };
        if (g.collection_binding) continue;
        if (g.repeat && (g.repeat.max === undefined || g.repeat.max > 1)) continue;
        const existing = groups[g.id];
        if (Array.isArray(existing) && existing.length > 0) continue;
        const rowValues: Record<string, unknown> = {};
        for (const child of g.fields) {
            if (child.type === "group") continue;
            if (hasAnswer(values[child.id])) rowValues[child.id] = values[child.id];
        }
        if (Object.keys(rowValues).length === 0) continue;
        const row: Row = { instance_key: `${g.id}__1`, values: rowValues, signatures: {}, groups: {} };
        groups[g.id] = [row];
    }

    const getValue = (id: string) => values[id];
    for (const field of schema.fields) {
        if (fieldShownForAnswers(schema, field.id, getValue)) continue;
        delete values[field.id];
        delete signatures[field.id];
        delete groups[field.id];
        if (field.type === "group") for (const child of (field as GroupField).fields) delete values[child.id];
    }

    return { ...payload, values, groups, signatures };
}
