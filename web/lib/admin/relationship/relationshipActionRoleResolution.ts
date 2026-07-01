/**
 * Relationship Action Framework — role key resolution with org-config fallbacks.
 */

import {
    loadActiveMemberContactRoleKeys,
    pickFirstAvailableMemberContactRoleKey,
    resolveBillingMemberContactRoleKey,
    resolveEmergencyMemberContactRoleKey,
    resolveGuardianMemberContactRoleKey,
} from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelationshipActionKey, RelationshipRoleKey } from "@/lib/admin/relationship/relationshipActionContract";

const AUTHORIZED_PICKUP_ROLE_CANDIDATES = ["authorized_pickup", "pickup"] as const;

const ROLE_CANDIDATES_BY_ACTION: Partial<Record<RelationshipActionKey, readonly string[]>> = {
    add_emergency_contact: ["emergency_contact", "emergency"],
    add_authorized_pickup: AUTHORIZED_PICKUP_ROLE_CANDIDATES,
    add_billing_contact: ["billing_contact", "payer", "billing", "billing_responsible"],
    add_parent_guardian: ["guardian", "parent_guardian", "parent", "secondary_guardian"],
    link_existing_person: [],
};

export async function loadRelationshipActionRoleKeys(
    supabase: SupabaseClient,
    orgId: string,
): Promise<Set<string>> {
    return loadActiveMemberContactRoleKeys(supabase, orgId);
}

export function resolveRelationshipRoleKeyForAction(input: {
    actionKey: RelationshipActionKey;
    activeRoleKeys: Set<string>;
    requestedRoleKey?: RelationshipRoleKey | null;
    isPrimaryGuardian?: boolean;
}): string | null {
    const requested = input.requestedRoleKey?.trim();
    if (requested) {
        if (input.activeRoleKeys.has(requested)) return requested;
        const normalized = requested.toLowerCase().replace(/\s+/g, "_");
        if (input.activeRoleKeys.has(normalized)) return normalized;
    }

    switch (input.actionKey) {
        case "add_emergency_contact":
            return resolveEmergencyMemberContactRoleKey(input.activeRoleKeys);
        case "add_authorized_pickup":
            return pickFirstAvailableMemberContactRoleKey(AUTHORIZED_PICKUP_ROLE_CANDIDATES, input.activeRoleKeys);
        case "add_billing_contact":
            return resolveBillingMemberContactRoleKey(input.activeRoleKeys);
        case "add_parent_guardian":
            return resolveGuardianMemberContactRoleKey(Boolean(input.isPrimaryGuardian), input.activeRoleKeys);
        case "link_existing_person":
            return requested ?? null;
        default:
            break;
    }

    const candidates = ROLE_CANDIDATES_BY_ACTION[input.actionKey];
    if (candidates?.length) {
        return pickFirstAvailableMemberContactRoleKey(candidates, input.activeRoleKeys);
    }
    return requested ?? null;
}

export function relationshipRoleConfigError(actionKey: RelationshipActionKey, roleLabel: string): string {
    return `No ${roleLabel} role is configured for this organization. Add a matching key to customer_member_contact_roles before running ${actionKey.replace(/_/g, " ")}.`;
}
