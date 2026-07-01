/**
 * Person-scoped mailing address layout refKeys — backed by field_definitions / field_values on `person`.
 *
 * Distinct from:
 * - `location.household_address_*` — customer household mailing address (locations table)
 * - `location.address1` / site refs — school/campus site address (read-only display)
 */

import type { LayoutEditorContactResolutionRole } from "@/lib/layout/layoutEditorContactRoles";

export const PERSON_ADDRESS_VALUE_KEYS = [
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postal_code",
] as const;

export type PersonAddressValueKey = (typeof PERSON_ADDRESS_VALUE_KEYS)[number];

export const PERSON_ADDRESS_LAYOUT_REF_KEYS = [
    "person.address_line1",
    "person.address_line2",
    "person.city",
    "person.state",
    "person.postal_code",
] as const;

export type PersonAddressLayoutRefKey = (typeof PERSON_ADDRESS_LAYOUT_REF_KEYS)[number];

const CONTACT_ROLE_ADDRESS_PREFIX: Record<LayoutEditorContactResolutionRole, string> = {
    primary: "person.primary_address",
    parents: "person.secondary_address",
    billing: "person.billing_address",
    emergency: "person.emergency_address",
    any: "person.contact_address",
};

export const CONTACT_ROLE_ADDRESS_LAYOUT_REF_KEYS: readonly string[] = (
    Object.values(CONTACT_ROLE_ADDRESS_PREFIX).flatMap((prefix) =>
        PERSON_ADDRESS_VALUE_KEYS.map((key) => `${prefix}_${key.replace("address_", "")}`),
    )
);

/** e.g. person.primary_address_line1 */
export function contactRoleAddressLayoutRefKey(
    role: LayoutEditorContactResolutionRole,
    valueKey: PersonAddressValueKey,
): string {
    const suffix = valueKey === "address_line1" ? "line1" : valueKey === "address_line2" ? "line2" : valueKey;
    return `${CONTACT_ROLE_ADDRESS_PREFIX[role]}_${suffix}`;
}

export function contactRoleAddressLayoutRefKeys(role: LayoutEditorContactResolutionRole): string[] {
    return PERSON_ADDRESS_VALUE_KEYS.map((key) => contactRoleAddressLayoutRefKey(role, key));
}

export function isPersonAddressLayoutRefKey(refKey: string): boolean {
    return (PERSON_ADDRESS_LAYOUT_REF_KEYS as readonly string[]).includes(refKey);
}

export function isContactRoleAddressLayoutRefKey(refKey: string): boolean {
    return CONTACT_ROLE_ADDRESS_LAYOUT_REF_KEYS.includes(refKey);
}

export function personAddressValueKeyFromLayoutRefKey(refKey: string): PersonAddressValueKey | null {
    if (isPersonAddressLayoutRefKey(refKey)) {
        return refKey.slice("person.".length) as PersonAddressValueKey;
    }
    for (const prefix of Object.values(CONTACT_ROLE_ADDRESS_PREFIX)) {
        if (!refKey.startsWith(`${prefix}_`)) continue;
        const tail = refKey.slice(prefix.length + 1);
        const mapped =
            tail === "line1" ? "address_line1"
            : tail === "line2" ? "address_line2"
            : (tail as PersonAddressValueKey);
        if ((PERSON_ADDRESS_VALUE_KEYS as readonly string[]).includes(mapped)) return mapped;
    }
    return null;
}

export function contactRoleFromAddressLayoutRefKey(refKey: string): LayoutEditorContactResolutionRole | null {
    for (const [role, prefix] of Object.entries(CONTACT_ROLE_ADDRESS_PREFIX) as [
        LayoutEditorContactResolutionRole,
        string,
    ][]) {
        if (refKey.startsWith(`${prefix}_`)) return role;
    }
    return null;
}
