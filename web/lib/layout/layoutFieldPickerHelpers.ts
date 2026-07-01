import type { LayoutCatalogField } from "./fieldCatalog";

export function normalizeFieldPickerQuery(query: string): string {
    return query.trim().toLowerCase();
}

export function fieldMatchesPickerQuery(field: LayoutCatalogField, query: string): boolean {
    const q = normalizeFieldPickerQuery(query);
    if (!q) return true;
    const hay = `${field.fieldLabel} ${field.refKey} ${field.fieldKey}`.toLowerCase();
    return hay.includes(q);
}

export type FieldPickerPartition = {
    available: LayoutCatalogField[];
    used: LayoutCatalogField[];
};

/** Split entity-scoped fields into unused vs already present on the layout doc. */
export function partitionCatalogFieldsForPicker(
    fields: LayoutCatalogField[],
    usedRefKeys: ReadonlySet<string>,
    query: string,
): FieldPickerPartition {
    const available: LayoutCatalogField[] = [];
    const used: LayoutCatalogField[] = [];
    for (const field of fields) {
        if (!fieldMatchesPickerQuery(field, query)) continue;
        if (usedRefKeys.has(field.refKey)) used.push(field);
        else available.push(field);
    }
    return { available, used };
}

export function countAvailableFieldsInGroup(fields: LayoutCatalogField[], usedRefKeys: ReadonlySet<string>): number {
    return fields.filter((f) => !usedRefKeys.has(f.refKey)).length;
}
