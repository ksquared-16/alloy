/** Field keys that store a unit/classroom program category on location field_values. */
export const UNIT_PROGRAM_CATEGORY_FIELD_KEYS = ["classroom_age_group", "childcare_program_type"] as const;

export type HierarchyLocationRow = {
    id: string;
    location_type?: string | null;
    metadata?: unknown;
};

export type UnitProgramCategoryFieldValue = {
    entity_id: string;
    value_text: string | null;
};

function unitHasExplicitCategoryMetadata(metadata: unknown): boolean {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const category = (metadata as Record<string, unknown>).category;
    return typeof category === "string" && category.trim().length > 0;
}

/** Merge resolved program category keys onto unit rows missing metadata.category. */
export function enrichHierarchyUnitsWithProgramCategories<T extends HierarchyLocationRow>(
    locations: readonly T[],
    fieldValues: ReadonlyArray<UnitProgramCategoryFieldValue>
): T[] {
    const categoryByUnitId = new Map<string, string>();
    for (const row of fieldValues) {
        const unitId = row.entity_id.trim();
        const value = (row.value_text ?? "").trim();
        if (unitId && value && !categoryByUnitId.has(unitId)) {
            categoryByUnitId.set(unitId, value);
        }
    }

    return locations.map((row) => {
        if (String(row.location_type ?? "").trim() !== "unit") return row;
        if (unitHasExplicitCategoryMetadata(row.metadata)) return row;
        const category = categoryByUnitId.get(String(row.id));
        if (!category) return row;
        const base =
            row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        return {
            ...row,
            metadata: { ...base, category },
        };
    });
}
