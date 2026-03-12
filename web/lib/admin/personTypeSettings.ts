/**
 * Configurable person model settings: customer person roles and person relationship types.
 * Use these APIs for dropdowns in forms; store the key in customer_persons.role or
 * person_relationships.relationship_type. Current text values remain compatible.
 *
 * API paths:
 * - GET/POST /api/admin/customer-person-role-types (?active_only=true&vertical_id= for dropdowns)
 * - PATCH /api/admin/customer-person-role-types/[id]
 * - GET/POST /api/admin/person-relationship-type-settings (?active_only=true&vertical_id= for dropdowns)
 * - PATCH /api/admin/person-relationship-type-settings/[id]
 *
 * Vertical resolution: when loading options for a given org + vertical, pass ?vertical_id=.
 * The API returns active rows for that vertical + universal (vertical_id null), de-duped by key
 * (vertical-specific wins), sorted by sort_order then label.
 */

export const CUSTOMER_PERSON_ROLE_TYPES_API = "/api/admin/customer-person-role-types";
export const PERSON_RELATIONSHIP_TYPE_SETTINGS_API = "/api/admin/person-relationship-type-settings";

/** Options list shape for dropdowns: value = key stored in DB, label = display. */
export type DropdownOption = { value: string; label: string };

/** Row shape used for vertical resolution (key, label, sort_order, vertical_id). */
export type VerticalOptionRow = { key: string; label: string | null; sort_order?: number; vertical_id?: string | null };

/**
 * Resolve options by vertical: keep rows where vertical_id = verticalId or vertical_id is null;
 * de-duplicate by key (prefer vertical-specific over universal); sort by sort_order then label.
 * If verticalId is null/empty, returns items as-is (only sorted).
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
