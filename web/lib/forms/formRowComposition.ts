/**
 * Row composition for Processing Form Builder — 12-unit row grid.
 *
 * Each field's `layout_width` consumes row units:
 *   full = 12, half = 6, third = 4, quarter = 3
 * Rows break when the next field would exceed 12 units or when a full-width field starts.
 */

import type { FormField, FormFieldLayoutWidth, FormSchemaV1 } from "@/lib/forms/schema";
import { moveFieldWithinSection } from "@/lib/forms/formBuilderSchema";

export type FormRowPlacement = "same-line" | "new-line-below";

export const LAYOUT_WIDTH_UNITS: Record<FormFieldLayoutWidth, number> = {
    full: 12,
    half: 6,
    third: 4,
    quarter: 3,
};

export const MAX_FIELDS_PER_ROW = 4;

export function layoutWidthFromField(field: FormField): FormFieldLayoutWidth {
    const w = field.layout_width;
    if (w === "half" || w === "third" || w === "quarter") return w;
    return "full";
}

export function placementFromField(field: FormField): FormRowPlacement {
    return layoutWidthFromField(field) === "full" ? "new-line-below" : "same-line";
}

function withLayoutWidth(schema: FormSchemaV1, fieldId: string, width: FormFieldLayoutWidth): FormSchemaV1 {
    return {
        ...schema,
        fields: schema.fields.map((f) => (f.id === fieldId ? { ...f, layout_width: width } : f)),
    };
}

/** Set row width for a field; same-line also coerces previous in-section field to compatible width when possible. */
export function setFieldLayoutWidth(schema: FormSchemaV1, fieldId: string, width: FormFieldLayoutWidth): FormSchemaV1 {
    let next = withLayoutWidth(schema, fieldId, width);
    if (width === "full") return next;

    const section = next.sections.find((s) => s.field_ids.includes(fieldId));
    if (!section) return next;
    const idx = section.field_ids.indexOf(fieldId);
    if (idx > 0) {
        const prevId = section.field_ids[idx - 1]!;
        const prev = next.fields.find((f) => f.id === prevId);
        if (prev && layoutWidthFromField(prev) === "full") {
            next = withLayoutWidth(next, prevId, width);
        }
    }
    return next;
}

/** @deprecated Prefer setFieldLayoutWidth — maps legacy same-line/new-line to half/full. */
export function setFieldPlacement(schema: FormSchemaV1, fieldId: string, placement: FormRowPlacement): FormSchemaV1 {
    return setFieldLayoutWidth(schema, fieldId, placement === "same-line" ? "half" : "full");
}

/** Group section field ids into visual rows using the 12-unit grid. */
export function groupFieldsIntoRows(fieldIds: string[], fieldById: Map<string, FormField>): string[][] {
    const rows: string[][] = [];
    let current: string[] = [];
    let usedUnits = 0;

    for (const fid of fieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;
        const width = layoutWidthFromField(field);
        const units = LAYOUT_WIDTH_UNITS[width];

        if (width === "full" || (current.length > 0 && usedUnits + units > 12)) {
            if (current.length > 0) rows.push(current);
            current = [fid];
            usedUnits = units;
            if (width === "full") {
                rows.push(current);
                current = [];
                usedUnits = 0;
            }
            continue;
        }

        current.push(fid);
        usedUnits += units;
        if (usedUnits >= 12) {
            rows.push(current);
            current = [];
            usedUnits = 0;
        }
    }

    if (current.length > 0) rows.push(current);
    return rows;
}

export function rowCapacityRemaining(rowFieldIds: string[], fieldById: Map<string, FormField>): number {
    let used = 0;
    for (const fid of rowFieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;
        used += LAYOUT_WIDTH_UNITS[layoutWidthFromField(field)];
    }
    return Math.max(0, 12 - used);
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

export { moveFieldWithinSection } from "@/lib/forms/formBuilderSchema";

/** Tailwind flex classes for a field's row width on the 12-unit grid. */
export function fieldLayoutFlexClass(width: FormFieldLayoutWidth): string {
    switch (width) {
        case "quarter":
            return "min-w-[calc(25%-0.5625rem)] flex-[1_1_calc(25%-0.5625rem)]";
        case "third":
            return "min-w-[calc(33.333%-0.4375rem)] flex-[1_1_calc(33.333%-0.4375rem)]";
        case "half":
            return "min-w-[calc(50%-0.3125rem)] flex-[1_1_calc(50%-0.3125rem)]";
        default:
            return "w-full flex-[1_1_100%]";
    }
}
