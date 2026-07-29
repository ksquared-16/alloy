/**
 * Relationship Action Framework — role key resolution with org-config fallbacks.
 */

import {
    loadActiveMemberContactRoleKeys,
    pickFirstAvailableMemberContactRoleKey,
    resolveBillingMemberContactRoleKey,
} from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import { relationshipDefinitionForCommandKey } from "@/lib/fields/relationship/relationshipDefinitions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelationshipActionKey, RelationshipRoleKey } from "@/lib/admin/relationship/relationshipActionContract";

/**
 * Candidates for the NATIVE commands that have no relationship definition.
 * Definition-backed commands resolve from their own `role_resolution` / `role_key_candidates`.
 */
const NATIVE_ROLE_CANDIDATES_BY_ACTION: Partial<Record<RelationshipActionKey, readonly string[]>> = {
    add_billing_contact: ["billing_contact", "payer", "billing", "billing_responsible"],
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

    // ── definition-backed commands resolve from the relationship model, not a per-action switch ──
    const def = relationshipDefinitionForCommandKey(input.actionKey);
    if (def) {
        const policy = def.role_resolution;
        const candidates = policy?.primary_candidates && input.isPrimaryGuardian
            ? policy.primary_candidates
            : policy?.default_candidates ?? def.role_key_candidates;
        const picked = pickFirstAvailableMemberContactRoleKey(candidates, input.activeRoleKeys);
        if (picked) return picked;
        if (!policy?.required) return null;
        // "required" policy: never return null — fall back to the canonical guardian key, then any
        // active role, else surface the org-config error. Mirrors resolveGuardianMemberContactRoleKey.
        if (input.activeRoleKeys.has("guardian")) return "guardian";
        const first = [...input.activeRoleKeys][0];
        if (!first) {
            throw new Error(
                "No active customer_member_contact_roles configured for this org. Seed guardian/emergency/billing role keys before creating leads.",
            );
        }
        return first;
    }

    // ── native commands (no definition row) ──
    switch (input.actionKey) {
        case "add_billing_contact":
            return resolveBillingMemberContactRoleKey(input.activeRoleKeys);
        case "link_existing_person":
            return requested ?? null;
        default:
            break;
    }

    const candidates = NATIVE_ROLE_CANDIDATES_BY_ACTION[input.actionKey];
    if (candidates?.length) {
        return pickFirstAvailableMemberContactRoleKey(candidates, input.activeRoleKeys);
    }
    return requested ?? null;
}

export function relationshipRoleConfigError(actionKey: RelationshipActionKey, roleLabel: string): string {
    return `No ${roleLabel} role is configured for this organization. Add a matching key to customer_member_contact_roles before running ${actionKey.replace(/_/g, " ")}.`;
}
