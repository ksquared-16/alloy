/**
 * Configurable person model settings: customer person roles and person relationship types.
 * Use these APIs for dropdowns in forms; store the key in customer_persons.role or
 * person_relationships.relationship_type. Current text values remain compatible.
 *
 * API paths:
 * - GET/POST /api/admin/customer-person-role-types (?active_only=true for dropdowns)
 * - PATCH /api/admin/customer-person-role-types/[id]
 * - GET/POST /api/admin/person-relationship-type-settings (?active_only=true for dropdowns)
 * - PATCH /api/admin/person-relationship-type-settings/[id]
 */

export const CUSTOMER_PERSON_ROLE_TYPES_API = "/api/admin/customer-person-role-types";
export const PERSON_RELATIONSHIP_TYPE_SETTINGS_API = "/api/admin/person-relationship-type-settings";

/** Options list shape for dropdowns: value = key stored in DB, label = display. */
export type DropdownOption = { value: string; label: string };

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
