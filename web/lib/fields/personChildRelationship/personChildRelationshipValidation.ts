/**
 * Boundary and Choice Option validation for relationship writes.
 */

import { PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY } from "./personChildRelationshipEntity";
import { isOperationalRoleKey } from "./personChildRelationshipOperationalRoles";

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
    /*
     * THE FULL VOCABULARY — platform-fixed roles PLUS every configured relationship definition.
     *
     * This validated against `isPersonChildOperationalRoleKey`, the platform-FIXED set, so a role
     * declared by a definition row was refused at the write boundary: `child_physicians` and
     * `child_dentists` have been full definitions all along and `addPersonChildRelationshipRole`
     * answered "Unsupported operational role \"physician\"." That contradicts the promise the
     * definitions module makes in its own header — adding a collectable role must be ONE definition
     * row, never new code — and the module this import comes from says so explicitly: consumers
     * needing the full vocabulary must read `isOperationalRoleKey`, not the fixed constant.
     *
     * Found by attaching a physician through the canonical service, not by reading the code.
     */
    const key = roleKey.trim().toLowerCase();
    if (!isOperationalRoleKey(key)) {
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
