import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";

export type InquiryChildPlacementHierarchyRow = {
    id: string;
    label?: string | null;
    location_type?: string | null;
    parent_location_id?: string | null;
    is_active?: boolean;
    metadata?: unknown;
};

export type InquiryChildPlacementSelectOption = { value: string; label: string };

export type InquiryChildProgramOptionSetItem = {
    item_key: string;
    label?: string | null;
    sort_order?: number | null;
    is_active?: boolean | null;
};

function isActiveUnit(row: InquiryChildPlacementHierarchyRow): boolean {
    if (String(row.location_type ?? "").trim() !== "unit") return false;
    return row.is_active !== false;
}

function unitProgramCategory(row: InquiryChildPlacementHierarchyRow): string | null {
    const category = readLocationMetadataPresentation(row.metadata).category;
    const key = (category ?? "").trim();
    return key || null;
}

function activeProgramKeySet(items: InquiryChildProgramOptionSetItem[]): Set<string> {
    const out = new Set<string>();
    for (const item of items) {
        if (item.is_active === false) continue;
        const key = String(item.item_key ?? "").trim();
        if (key) out.add(key);
    }
    return out;
}

function programLabelAndOrder(items: InquiryChildProgramOptionSetItem[]): {
    labelByKey: Map<string, string>;
    orderByKey: Map<string, number>;
} {
    const labelByKey = new Map<string, string>();
    const orderByKey = new Map<string, number>();
    for (const item of items) {
        if (item.is_active === false) continue;
        const key = String(item.item_key ?? "").trim();
        if (!key) continue;
        labelByKey.set(key, String(item.label ?? key).trim() || key);
        orderByKey.set(key, item.sort_order ?? 9999);
    }
    return { labelByKey, orderByKey };
}

/**
 * Active program options offered at a site — derived from active unit rows'
 * `metadata.category` (childcare_program_type item_key). No programs table in V1.
 */
export function resolveProgramsOfferedForSite(
    locations: InquiryChildPlacementHierarchyRow[],
    siteId: string | null | undefined,
    programItems: InquiryChildProgramOptionSetItem[]
): InquiryChildPlacementSelectOption[] {
    const site = (siteId ?? "").trim();
    if (!site) return [];

    const validKeys = activeProgramKeySet(programItems);
    const { labelByKey, orderByKey } = programLabelAndOrder(programItems);
    const seen = new Set<string>();

    for (const row of locations) {
        if (!isActiveUnit(row)) continue;
        if (String(row.parent_location_id ?? "").trim() !== site) continue;
        const category = unitProgramCategory(row);
        if (!category || !validKeys.has(category)) continue;
        seen.add(category);
    }

    return [...seen]
        .sort((a, b) => {
            const orderDiff = (orderByKey.get(a) ?? 9999) - (orderByKey.get(b) ?? 9999);
            if (orderDiff !== 0) return orderDiff;
            return (labelByKey.get(a) ?? a).localeCompare(labelByKey.get(b) ?? b);
        })
        .map((value) => ({
            value,
            label: labelByKey.get(value) ?? value,
        }));
}

/**
 * Active room/unit locations under a site; optionally filtered by program category.
 * Value = unit `locations.id`, label = unit name.
 */
export function resolveRoomsForSiteAndProgram(
    locations: InquiryChildPlacementHierarchyRow[],
    siteId: string | null | undefined,
    programKey?: string | null
): InquiryChildPlacementSelectOption[] {
    const site = (siteId ?? "").trim();
    if (!site) return [];

    const program = (programKey ?? "").trim() || null;

    return locations
        .filter((row) => {
            if (!isActiveUnit(row)) return false;
            if (String(row.parent_location_id ?? "").trim() !== site) return false;
            if (!program) return true;
            return unitProgramCategory(row) === program;
        })
        .map((row) => ({
            value: String(row.id),
            label: (row.label ?? row.id).trim() || String(row.id),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveDefaultInquiryChildSiteId(params: {
    currentSiteId: string;
    headerSiteId: string | null | undefined;
    siteOptions: InquiryChildPlacementSelectOption[];
}): string | null {
    const current = params.currentSiteId.trim();
    if (current && params.siteOptions.some((o) => o.value === current)) return current;

    const header = (params.headerSiteId ?? "").trim();
    if (header && params.siteOptions.some((o) => o.value === header)) return header;

    if (params.siteOptions.length === 1) return params.siteOptions[0]!.value;
    return null;
}
