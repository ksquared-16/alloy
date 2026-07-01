/** Section row from GET /api/admin/field-sections */
export type FieldSectionRegistryRow = {
    section_key: string;
    label: string;
    sort_order: number;
};

export type FieldSectionSelectOption = { value: string; label: string };

/**
 * Load org field sections for an entity type. Returns [] on failure so UIs can fall back to legacy keys + Custom.
 */
export async function fetchFieldSectionRegistry(entityType: string): Promise<FieldSectionRegistryRow[]> {
    try {
        const res = await fetch(
            `/api/admin/field-sections?entity_type=${encodeURIComponent(entityType)}`,
            { cache: "no-store" }
        );
        if (!res.ok) return [];
        const json = (await res.json().catch(() => ({}))) as { sections?: Record<string, unknown>[] };
        const raw = json.sections ?? [];
        return raw.map((r) => ({
            section_key: String(r.section_key ?? ""),
            label: String(r.label ?? r.section_key ?? ""),
            sort_order: typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0,
        })).filter((r) => r.section_key.length > 0);
    } catch {
        return [];
    }
}

/**
 * Registry rows (ordered) + any section_key still used on field definitions but missing from registry,
 * plus optional synthetic "custom" for create-default UX when not in DB.
 */
export function mergeFieldSectionSelectOptions(
    registry: FieldSectionRegistryRow[],
    inUseSectionKeys: Iterable<string>,
    options?: { includeSyntheticCustom?: boolean }
): FieldSectionSelectOption[] {
    const includeSyntheticCustom = options?.includeSyntheticCustom !== false;
    const seen = new Set<string>();
    const out: FieldSectionSelectOption[] = [];

    const regSorted = [...registry].sort(
        (a, b) => a.sort_order - b.sort_order || a.section_key.localeCompare(b.section_key)
    );
    for (const r of regSorted) {
        if (seen.has(r.section_key)) continue;
        seen.add(r.section_key);
        out.push({ value: r.section_key, label: r.label });
    }

    const legacy = [...inUseSectionKeys]
        .map((k) => String(k).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    for (const key of legacy) {
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value: key, label: `${key} (legacy)` });
    }

    if (includeSyntheticCustom && !seen.has("custom")) {
        out.push({ value: "custom", label: "Custom" });
    }

    return out;
}

export function sectionKeyInOptions(options: FieldSectionSelectOption[], sectionKey: string): boolean {
    return options.some((o) => o.value === sectionKey);
}
