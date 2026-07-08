/**
 * Row composition for Processing Form Builder — bridge to Surface Builder placement grammar.
 *
 * Uses existing `layout_width` on FormField:
 * - `half` → Same line (side-by-side with previous when consecutive halves share a row)
 * - `full` → New line below (default)
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { moveFieldWithinSection } from "@/lib/forms/formBuilderSchema";

export type FormRowPlacement = "same-line" | "new-line-below";

export const MAX_FIELDS_PER_ROW = 3;

export function placementFromField(field: FormField): FormRowPlacement {
    return field.layout_width === "half" ? "same-line" : "new-line-below";
}

function withLayoutWidth(schema: FormSchemaV1, fieldId: string, width: "half" | "full"): FormSchemaV1 {
    return {
        ...schema,
        fields: schema.fields.map((f) => (f.id === fieldId ? { ...f, layout_width: width } : f)),
    };
}

/** Set placement; same-line also marks the previous field in-section as half when possible. */
export function setFieldPlacement(schema: FormSchemaV1, fieldId: string, placement: FormRowPlacement): FormSchemaV1 {
    if (placement === "new-line-below") {
        return withLayoutWidth(schema, fieldId, "full");
    }
    let next = withLayoutWidth(schema, fieldId, "half");
    const section = next.sections.find((s) => s.field_ids.includes(fieldId));
    if (!section) return next;
    const idx = section.field_ids.indexOf(fieldId);
    if (idx > 0) {
        const prevId = section.field_ids[idx - 1]!;
        next = withLayoutWidth(next, prevId, "half");
    }
    return next;
}

/** Group section field ids into visual rows for canvas rendering. */
export function groupFieldsIntoRows(fieldIds: string[], fieldById: Map<string, FormField>): string[][] {
    const rows: string[][] = [];
    for (const fid of fieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;
        const sameLine = field.layout_width === "half";
        const lastRow = rows[rows.length - 1];
        if (sameLine && lastRow && lastRow.length > 0 && lastRow.length < MAX_FIELDS_PER_ROW) {
            lastRow.push(fid);
        } else {
            rows.push([fid]);
        }
    }
    return rows;
}

export function moveFieldBetweenSections(
    schema: FormSchemaV1,
    fieldId: string,
    toSectionId: string
): FormSchemaV1 {
    const fromSection = schema.sections.find((s) => s.field_ids.includes(fieldId));
    if (!fromSection || fromSection.id === toSectionId) return schema;
    const sections = schema.sections.map((s) => {
        if (s.id === fromSection.id) {
            return { ...s, field_ids: s.field_ids.filter((id) => id !== fieldId) };
        }
        if (s.id === toSectionId) {
            return { ...s, field_ids: [...s.field_ids, fieldId] };
        }
        return s;
    });
    return { ...schema, sections };
}

/**
 * Move a field within or across sections to a precise index.
 * `insertBeforeFieldId` null appends to the end of the target section.
 */
export function reorderField(
    schema: FormSchemaV1,
    fieldId: string,
    targetSectionId: string,
    insertBeforeFieldId: string | null
): FormSchemaV1 {
    const sections = schema.sections.map((s) => ({ ...s, field_ids: s.field_ids.filter((id) => id !== fieldId) }));
    const target = sections.find((s) => s.id === targetSectionId);
    if (!target) return schema;

    const ids = [...target.field_ids];
    if (insertBeforeFieldId === null) {
        ids.push(fieldId);
    } else {
        const at = ids.indexOf(insertBeforeFieldId);
        if (at === -1) ids.push(fieldId);
        else ids.splice(at, 0, fieldId);
    }

    return {
        ...schema,
        sections: sections.map((s) => (s.id === targetSectionId ? { ...s, field_ids: ids } : s)),
    };
}

/** Reorder after an anchor field (append when anchor is last). */
export function reorderFieldAfter(
    schema: FormSchemaV1,
    fieldId: string,
    targetSectionId: string,
    afterFieldId: string | null
): FormSchemaV1 {
    if (!afterFieldId) return reorderField(schema, fieldId, targetSectionId, null);
    const target = schema.sections.find((s) => s.id === targetSectionId);
    if (!target) return schema;
    const ids = target.field_ids.filter((id) => id !== fieldId);
    const afterIdx = ids.indexOf(afterFieldId);
    if (afterIdx === -1) return reorderField(schema, fieldId, targetSectionId, null);
    const insertBefore = ids[afterIdx + 1] ?? null;
    return reorderField(schema, fieldId, targetSectionId, insertBefore);
}

export { moveFieldWithinSection };
