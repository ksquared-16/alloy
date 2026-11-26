import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import {
    locationProgramCategoriesToSelectOptions,
    resolveActiveProgramCategoriesForSite,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";

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
 * Program options for OCM-persisting program selects — value = `location_program_categories.id`
 * (the stored OCM `program_category_id` FK). Only configured categories can produce storable
 * FK values; when none exist for the site there is nothing storable, so no options are returned
 * (the legacy unit-metadata key derivation cannot be persisted on OCM).
 */
export function resolveProgramCategoryOptionsForSite(
    siteId: string | null | undefined,
    locationCategories?: ReadonlyArray<LocationProgramCategoryRow>
): InquiryChildPlacementSelectOption[] {
    const site = (siteId ?? "").trim();
    if (!site) return [];
    return resolveActiveProgramCategoriesForSite(locationCategories ?? [], site).map((c) => ({
        value: c.id,
        label: c.label,
    }));
}

export type InquiryChildProgramOptionValueMode = "category_id" | "key";

/**
 * Program select options for a site with explicit value semantics:
 * - "category_id": values are `location_program_categories.id` (storable OCM FK) — use for
 *   selects that PATCH OCM `program_category_id` directly. Empty when no categories configured.
 * - "key": values are stable program keys — use for create_lead flows (`child_program`)
 *   where the FK is resolved at persist time; includes the legacy unit-metadata fallback.
 */
export function resolveProgramSelectOptionsForSite(
    locations: InquiryChildPlacementHierarchyRow[],
    siteId: string | null | undefined,
    programItems: InquiryChildProgramOptionSetItem[],
    locationCategories: ReadonlyArray<LocationProgramCategoryRow> | undefined,
    valueMode: InquiryChildProgramOptionValueMode
): InquiryChildPlacementSelectOption[] {
    if (valueMode === "category_id") {
        return resolveProgramCategoryOptionsForSite(siteId, locationCategories);
    }
    return resolveProgramsOfferedForSite(locations, siteId, programItems, locationCategories);
}

/**
 * Active program options offered at a site, valued by stable program KEY.
 * Prefers `location_program_categories` when provided; otherwise derives from unit
 * `metadata.category` keyed against legacy program item labels.
 *
 * Key-valued options are for flows that persist a key and resolve the FK at write time
 * (create_lead `child_program` → resolveProgramCategoryId). Selects that PATCH OCM directly
 * must use {@link resolveProgramCategoryOptionsForSite} (category-id values) instead.
 */
export function resolveProgramsOfferedForSite(
    locations: InquiryChildPlacementHierarchyRow[],
    siteId: string | null | undefined,
    programItems: InquiryChildProgramOptionSetItem[],
    locationCategories?: ReadonlyArray<LocationProgramCategoryRow>
): InquiryChildPlacementSelectOption[] {
    const site = (siteId ?? "").trim();
    if (!site) return [];

    const configured = resolveActiveProgramCategoriesForSite(locationCategories ?? [], site);
    if (configured.length > 0) {
        return locationProgramCategoriesToSelectOptions(configured).map((o) => ({
            value: o.value,
            label: o.label,
        }));
    }

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
