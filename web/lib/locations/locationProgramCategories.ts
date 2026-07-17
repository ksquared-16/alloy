/**
 * Location-owned program categories — single source of truth for site offerings.
 * Stable keys identify categories across sites; OCM stores the category FK (`program_category_id`).
 */

import { slugifyAdminKey } from "@/lib/admin/slugifyAdminKey";

export type LocationProgramCategoryRow = {
    id: string;
    org_id: string;
    location_id: string;
    key: string;
    label: string;
    sort_order?: number | null;
    is_active?: boolean | null;
    metadata?: Record<string, unknown> | null;
    /** Null on legacy local-only compatibility rows. */
    program_id?: string | null;
    /** Published Organization revision consumed by this Location. */
    program_revision_id?: string | null;
    configuration_consumption_id?: string | null;
    /** The only Program identity-adjacent value Locations may override in V1. */
    local_description_override?: string | null;
    /** Location-owned evidence required for local readiness. */
    local_authorization_evidence?: string | null;
};

export type LocationProgramCategorySelectOption = {
    value: string;
    label: string;
    category_id: string;
};

function trimOrEmpty(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export function isLocationProgramCategoryActive(row: Pick<LocationProgramCategoryRow, "is_active">): boolean {
    return row.is_active !== false;
}

/** Active categories for one site, sorted for pickers. */
export function resolveActiveProgramCategoriesForSite(
    categories: ReadonlyArray<LocationProgramCategoryRow>,
    siteId: string | null | undefined
): LocationProgramCategoryRow[] {
    const site = trimOrEmpty(siteId);
    if (!site) return [];
    return categories
        .filter((c) => trimOrEmpty(c.location_id) === site && isLocationProgramCategoryActive(c))
        .sort((a, b) => {
            const orderDiff = (a.sort_order ?? 100) - (b.sort_order ?? 100);
            if (orderDiff !== 0) return orderDiff;
            return a.label.localeCompare(b.label);
        });
}

export function locationProgramCategoriesToSelectOptions(
    categories: ReadonlyArray<LocationProgramCategoryRow>
): LocationProgramCategorySelectOption[] {
    return categories.map((c) => ({
        value: c.key,
        label: c.label,
        category_id: c.id,
    }));
}

export function indexLocationProgramCategoriesBySite(
    categories: ReadonlyArray<LocationProgramCategoryRow>
): Map<string, LocationProgramCategoryRow[]> {
    const bySite = new Map<string, LocationProgramCategoryRow[]>();
    for (const row of categories) {
        const siteId = trimOrEmpty(row.location_id);
        if (!siteId) continue;
        const list = bySite.get(siteId) ?? [];
        list.push(row);
        bySite.set(siteId, list);
    }
    for (const [siteId, list] of bySite) {
        bySite.set(
            siteId,
            [...list].sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100))
        );
    }
    return bySite;
}

export function findLocationProgramCategory(args: {
    categories: ReadonlyArray<LocationProgramCategoryRow>;
    locationId?: string | null;
    categoryId?: string | null;
    key?: string | null;
    includeInactive?: boolean;
}): LocationProgramCategoryRow | null {
    const locationId = trimOrEmpty(args.locationId);
    const categoryId = trimOrEmpty(args.categoryId);
    const key = trimOrEmpty(args.key);

    if (categoryId) {
        const byId = args.categories.find((c) => c.id === categoryId);
        if (!byId) return null;
        if (!args.includeInactive && !isLocationProgramCategoryActive(byId)) return null;
        return byId;
    }

    if (!locationId || !key) return null;
    const match = args.categories.find(
        (c) => trimOrEmpty(c.location_id) === locationId && trimOrEmpty(c.key) === key
    );
    if (!match) return null;
    if (!args.includeInactive && !isLocationProgramCategoryActive(match)) return null;
    return match;
}

/** Resolve display label: category id → site+key → legacy option-set label → raw key. */
export function resolveLocationProgramCategoryLabel(args: {
    categories?: ReadonlyArray<LocationProgramCategoryRow>;
    locationId?: string | null;
    categoryId?: string | null;
    programKey?: string | null;
    cachedLabel?: string | null;
    legacyOptionSetLabel?: string | null;
}): string | null {
    const cached = trimOrEmpty(args.cachedLabel);
    if (cached) return cached;

    const categories = args.categories ?? [];
    const fromCategory = findLocationProgramCategory({
        categories,
        locationId: args.locationId,
        categoryId: args.categoryId,
        key: args.programKey,
        includeInactive: true,
    });
    if (fromCategory) return fromCategory.label;

    const legacy = trimOrEmpty(args.legacyOptionSetLabel);
    if (legacy) return legacy;

    const key = trimOrEmpty(args.programKey);
    return key || null;
}

/** Map stable program key → category id for a site (active rows only). */
export function resolveProgramCategoryIdForSiteKey(
    categories: ReadonlyArray<LocationProgramCategoryRow>,
    siteId: string | null | undefined,
    programKey: string | null | undefined
): string | null {
    const row = findLocationProgramCategory({
        categories,
        locationId: siteId,
        key: programKey,
        includeInactive: false,
    });
    return row?.id ?? null;
}

/** Stable key slug for new location program categories. */
export function slugifyLocationProgramCategoryKey(label: string): string {
    return slugifyAdminKey(label);
}

/** Next sort_order for a new category on a site (max + 10, default floor 10). */
export function suggestNextLocationProgramCategorySortOrder(
    categories: ReadonlyArray<LocationProgramCategoryRow>,
    siteId: string
): number {
    const site = trimOrEmpty(siteId);
    if (!site) return 10;
    const orders = categories
        .filter((c) => trimOrEmpty(c.location_id) === site)
        .map((c) => c.sort_order ?? 0);
    const max = orders.length ? Math.max(...orders) : 0;
    return max > 0 ? max + 10 : 10;
}
