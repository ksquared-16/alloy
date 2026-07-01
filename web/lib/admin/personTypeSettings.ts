/**
 * Configurable person model settings: customer person roles and person relationship types.
 * Use these APIs for dropdowns in forms; store the key in customer_persons.role_type or
 * person_relationships.relationship_type. Current text values remain compatible.
 *
 * Industry is the PRIMARY driver for default options (orgs.industry_id).
 * Optional vertical_id remains for future/secondary refinement.
 *
 * API paths:
 * - GET/POST /api/admin/customer-person-role-types (?active_only=true for industry-resolved options; ?industry_id= override; ?vertical_id= for secondary)
 * - PATCH /api/admin/customer-person-role-types/[id]
 * - GET/POST /api/admin/person-relationship-type-settings (same)
 * - PATCH /api/admin/person-relationship-type-settings/[id]
 *
 * Resolution (industry-first): active rows for org + (industry_id = org.industry_id OR industry_id IS NULL);
 * de-dupe by key (industry-specific wins); sort by sort_order then label.
 */

export const CUSTOMER_PERSON_ROLE_TYPES_API = "/api/admin/customer-person-role-types";
export const PERSON_RELATIONSHIP_TYPE_SETTINGS_API = "/api/admin/person-relationship-type-settings";

/** Options list shape for dropdowns: value = key stored in DB, label = display. */
export type DropdownOption = { value: string; label: string };

/** Row shape used for industry resolution (key, label, sort_order, industry_id). */
export type IndustryOptionRow = { key: string; label: string | null; sort_order?: number; industry_id?: string | null };

/**
 * Resolve options by industry: keep rows where industry_id = industryId or industry_id is null;
 * de-duplicate by key (prefer industry-specific over universal); sort by sort_order then label.
 * If industryId is null/empty, returns items as-is (only sorted).
 */
export function resolveOptionsByIndustry<T extends IndustryOptionRow>(items: T[], industryId: string | null): T[] {
    if (!industryId || !items.length) {
        const sorted = [...items].sort((a, b) => {
            const soA = a.sort_order ?? 100;
            const soB = b.sort_order ?? 100;
            if (soA !== soB) return soA - soB;
            return (a.label ?? a.key).localeCompare(b.label ?? b.key);
        });
        return sorted;
    }
    const filtered = items.filter((r) => r.industry_id === industryId || r.industry_id == null);
    const byKey = new Map<string, T>();
    for (const r of filtered) {
        const existing = byKey.get(r.key);
        if (!existing || (r.industry_id === industryId && existing.industry_id !== industryId)) byKey.set(r.key, r);
    }
    const resolved = [...byKey.values()].sort((a, b) => {
        const soA = a.sort_order ?? 100;
        const soB = b.sort_order ?? 100;
        if (soA !== soB) return soA - soB;
        return (a.label ?? a.key).localeCompare(b.label ?? b.key);
    });
    return resolved;
}

/** Row shape used for vertical resolution (key, label, sort_order, vertical_id). Kept for secondary/legacy. */
export type VerticalOptionRow = { key: string; label: string | null; sort_order?: number; vertical_id?: string | null };

/**
 * Resolve options by vertical: keep rows where vertical_id = verticalId or vertical_id is null;
 * de-duplicate by key (prefer vertical-specific over universal); sort by sort_order then label.
 * If verticalId is null/empty, returns items as-is (only sorted). Secondary to industry.
 */
export function resolveOptionsByVertical<T extends VerticalOptionRow>(items: T[], verticalId: string | null): T[] {
    if (!verticalId || !items.length) {
        const sorted = [...items].sort((a, b) => {
            const soA = a.sort_order ?? 100;
            const soB = b.sort_order ?? 100;
            if (soA !== soB) return soA - soB;
            return (a.label ?? a.key).localeCompare(b.label ?? b.key);
        });
        return sorted;
    }
    const filtered = items.filter((r) => r.vertical_id === verticalId || r.vertical_id == null);
    const byKey = new Map<string, T>();
    for (const r of filtered) {
        const existing = byKey.get(r.key);
        if (!existing || (r.vertical_id === verticalId && existing.vertical_id !== verticalId)) byKey.set(r.key, r);
    }
    const resolved = [...byKey.values()].sort((a, b) => {
        const soA = a.sort_order ?? 100;
        const soB = b.sort_order ?? 100;
        if (soA !== soB) return soA - soB;
        return (a.label ?? a.key).localeCompare(b.label ?? b.key);
    });
    return resolved;
}

/**
 * Build dropdown options from role type items (e.g. from GET customer-person-role-types).
 * Use active_only=true when fetching for forms. Sorts by sort_order then label.
 */
export function customerPersonRoleOptions(
    items: { key: string; label: string | null; sort_order?: number }[]
): DropdownOption[] {
    const sorted = [...items].sort((a, b) => {
        const soA = a.sort_order ?? 100;
        const soB = b.sort_order ?? 100;
        if (soA !== soB) return soA - soB;
        return (a.label ?? a.key).localeCompare(b.label ?? b.key);
    });
    return sorted.map((item) => ({ value: item.key, label: item.label ?? item.key }));
}

/**
 * Build dropdown options from relationship type items (e.g. from GET person-relationship-type-settings).
 * Use active_only=true when fetching for forms. Sorts by sort_order then label.
 */
export function personRelationshipTypeOptions(
    items: { key: string; label: string | null; sort_order?: number }[]
): DropdownOption[] {
    const sorted = [...items].sort((a, b) => {
        const soA = a.sort_order ?? 100;
        const soB = b.sort_order ?? 100;
        if (soA !== soB) return soA - soB;
        return (a.label ?? a.key).localeCompare(b.label ?? b.key);
    });
    return sorted.map((item) => ({ value: item.key, label: item.label ?? item.key }));
}
