/**
 * Layout runtime read-only reasons for fields without save adapters.
 */

import { isContactRoleAddressLayoutRefKey } from "@/lib/layout/personDrawerAddressLayoutRefs";
import { HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS } from "@/lib/layout/runtime/resolveHouseholdAddressFieldValues";
import { layoutRuntimeContactRoleFieldReadOnlyReason } from "@/lib/layout/runtime/layoutRuntimeContactRoleFieldCapability";

export function layoutRuntimeFieldReadOnlyReason(refKey: string): string | null {
    const trimmed = refKey.trim();
    if (!trimmed) return null;

    const contactReason = layoutRuntimeContactRoleFieldReadOnlyReason(trimmed);
    if (contactReason) return contactReason;

    if ((HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS as readonly string[]).includes(trimmed)) {
        return "Household address is read-only until a household address save adapter is available.";
    }

    if (isContactRoleAddressLayoutRefKey(trimmed)) {
        return "Contact role address fields are read-only on the opportunity drawer until role-scoped person address save is available.";
    }

    return null;
}
