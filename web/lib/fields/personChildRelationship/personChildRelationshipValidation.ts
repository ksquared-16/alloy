/**
 * Boundary and Choice Option validation for relationship writes.
 */

import { PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY } from "./personChildRelationshipEntity";
import { isPersonChildOperationalRoleKey } from "./personChildRelationshipOperationalRoles";

export type OptionSetItemRow = { item_key: string; label: string; is_active?: boolean | null };

export function validateRelationshipTypeAgainstOptionSet(
    value: unknown,
    items: readonly OptionSetItemRow[],
): { ok: true; value: string } | { ok: false; reason: string } {
    if (value == null || value === "") return { ok: true, value: "" };
    const key = String(value).trim().toLowerCase();
    const match = items.find((i) => i.item_key.trim().toLowerCase() === key);
    if (!match) {
        return { ok: false, reason: `relationship_type "${key}" is not in option set ${PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY}.` };
    }
    return { ok: true, value: match.item_key };
}

export function validateOperationalRoleKey(roleKey: string): { ok: true; value: string } | { ok: false; reason: string } {
    const key = roleKey.trim().toLowerCase();
    if (!isPersonChildOperationalRoleKey(key)) {
        return { ok: false, reason: `Unsupported operational role "${roleKey}".` };
    }
    return { ok: true, value: key };
}

export function validateRelationshipStatus(value: unknown): "active" | "inactive" | null {
    if (value == null || value === "") return null;
    const s = String(value).trim().toLowerCase();
    if (s === "active" || s === "inactive") return s;
    return null;
}
