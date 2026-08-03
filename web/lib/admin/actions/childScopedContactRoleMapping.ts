/**
 * Maps legacy customer_member_contacts role keys to canonical PCR operational roles.
 *
 * Derives from the canonical relationship definitions — see
 * docs/platform/core/data/relationship-model.md.
 */

import {
    RELATIONSHIP_DEFINITIONS,
    relationshipDefinitionForCommandKey,
} from "@/lib/fields/relationship/relationshipDefinitions";

/**
 * Legacy tenant role aliases that have no relationship definition (financial roles, and the
 * primary/secondary contact wording). Definition-backed aliases are derived below, so a new
 * relationship's candidate keys map automatically.
 */
const NATIVE_MEMBER_ROLE_TO_OPERATIONAL: Record<string, string> = {
    primary_contact: "parent",
    parent: "parent",
    billing_contact: "billing_contact",
    payer: "billing_contact",
    billing: "billing_contact",
    billing_responsible: "billing_contact",
};

/** Every `role_key_candidate` a definition declares maps to that definition's operational role. */
function derivedRoleAliases(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const def of RELATIONSHIP_DEFINITIONS) {
        for (const candidate of def.role_key_candidates) {
            out[candidate.trim().toLowerCase()] = def.operational_role_key;
        }
        out[def.operational_role_key.trim().toLowerCase()] = def.operational_role_key;
    }
    return out;
}

// Natives first so derived definition aliases win on conflict — the relationship model is the
// authority for any role it declares.
const MEMBER_ROLE_TO_OPERATIONAL: Record<string, string> = {
    ...NATIVE_MEMBER_ROLE_TO_OPERATIONAL,
    ...derivedRoleAliases(),
};

export function mapMemberContactRoleToOperational(roleKey: string): string | null {
    const key = roleKey.trim().toLowerCase();
    return MEMBER_ROLE_TO_OPERATIONAL[key] ?? null;
}

/**
 * Whether child-scoped role rows go to `person_child_relationships` rather than the legacy
 * `customer_member_contacts` table.
 *
 * Definition-backed commands answer from their own `persists_to` column — which is why
 * `add_parent_guardian` still lands on CMC (it always has; that behaviour is now explicit config
 * rather than an implicit consequence of its executor kind). Commands with no definition keep the
 * original executor-kind rule.
 */
export function shouldWriteChildScopedRelationshipsToPcr(args: {
    executorKind: string;
    roleKey: string | null;
    actionKey?: string;
}): boolean {
    const roleMaps = Boolean(args.roleKey && mapMemberContactRoleToOperational(args.roleKey));
    if (!roleMaps) return false;

    const def = args.actionKey ? relationshipDefinitionForCommandKey(args.actionKey) : undefined;
    if (def) return def.persists_to === "person_child_relationships";

    return args.executorKind === "child_scoped_contact" || args.executorKind === "link_person";
}
