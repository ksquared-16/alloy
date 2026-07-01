import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload, FormPayloadGroupRow, FormPayloadSignature } from "@/lib/forms/validateSubmission";

export function emptyPayload(): FormPayload {
    return { values: {}, meta: {} };
}

function randomInstanceKey(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `i_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Nested groups on a row: seed minimum instances per child group definition. */
function seedNestedGroupsOnRow(parent: FormField & { type: "group" }): Record<string, FormPayloadGroupRow[]> | undefined {
    const nested: Record<string, FormPayloadGroupRow[]> = {};
    for (const child of parent.fields) {
        if (child.type !== "group") continue;
        const rows = buildMinimumRowsForGroupField(child);
        if (rows.length > 0) nested[child.id] = rows;
    }
    return Object.keys(nested).length ? nested : undefined;
}

function buildMinimumRowsForGroupField(field: FormField & { type: "group" }): FormPayloadGroupRow[] {
    const rep = field.repeat ?? { min: 0, max: undefined };
    const effectiveMin = Math.max(rep.min, field.required ? 1 : 0);
    const rows: FormPayloadGroupRow[] = [];
    for (let i = 0; i < effectiveMin; i++) {
        rows.push({
            instance_key: randomInstanceKey(),
            values: {},
            groups: seedNestedGroupsOnRow(field),
            signatures: {},
        });
    }
    return rows;
}

/**
 * Initial payload so repeating groups that require at least one instance start with empty rows.
 * Schema-driven: uses `repeat.min` and `required` (required implies at least one instance on submit).
 */
export function payloadWithMinimumRepeatingGroups(schema: FormSchemaV1): FormPayload {
    const groups: Record<string, FormPayloadGroupRow[]> = {};
    for (const field of schema.fields) {
        if (field.type !== "group") continue;
        const rows = buildMinimumRowsForGroupField(field);
        if (rows.length > 0) groups[field.id] = rows;
    }
    return {
        values: {},
        groups: Object.keys(groups).length ? groups : undefined,
        meta: {},
    };
}

export function setTopLevelValue(payload: FormPayload, fieldId: string, value: unknown): FormPayload {
    return {
        ...payload,
        values: { ...payload.values, [fieldId]: value },
    };
}

export function setSignature(payload: FormPayload, fieldId: string, sig: FormPayloadSignature): FormPayload {
    return {
        ...payload,
        signatures: { ...(payload.signatures ?? {}), [fieldId]: sig },
    };
}

export function ensureGroupRows(payload: FormPayload, groupId: string, rows: FormPayloadGroupRow[]): FormPayload {
    return {
        ...payload,
        groups: { ...(payload.groups ?? {}), [groupId]: rows },
    };
}
