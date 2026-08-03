/**
 * The operational role VOCABULARY — platform-fixed roles plus roles declared by relationship
 * definitions. Kinship types must never appear here.
 *
 * This module sits one level above `personChildRelationshipEntity` precisely so it may import the
 * definition registry; the entity module may not (cycle). Consumers that need the full vocabulary —
 * including configured roles — must read it from here, not from the platform-fixed constant.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { PERSON_CHILD_OPERATIONAL_ROLE_KEYS, isPersonChildOperationalRoleKey } from "./personChildRelationshipEntity";
import { RELATIONSHIP_DEFINITIONS } from "@/lib/fields/relationship/relationshipDefinitions";

export { PERSON_CHILD_OPERATIONAL_ROLE_KEYS, isPersonChildOperationalRoleKey };

/** Labels for the platform-fixed roles. Configured roles label themselves via their definition. */
export const PERSON_CHILD_OPERATIONAL_ROLE_LABELS: Readonly<Record<string, string>> = {
    parent: "Parent",
    guardian: "Guardian",
    emergency_contact: "Emergency Contact",
    authorized_pickup: "Authorized Pickup",
    billing_contact: "Billing Contact",
    communication_recipient: "Communication Recipient",
    financial_responsibility: "Financial Responsibility",
};

/** Every operational role the runtime accepts: platform-fixed + every configured definition's role. */
export function operationalRoleVocabulary(): string[] {
    const seen = new Set<string>(PERSON_CHILD_OPERATIONAL_ROLE_KEYS);
    for (const def of RELATIONSHIP_DEFINITIONS) seen.add(def.operational_role_key.trim().toLowerCase());
    return [...seen];
}

/** Whether a role key is valid — platform-fixed OR declared by a relationship definition. */
export function isOperationalRoleKey(value: string): boolean {
    const key = value.trim().toLowerCase();
    if (isPersonChildOperationalRoleKey(key)) return true;
    return RELATIONSHIP_DEFINITIONS.some((d) => d.operational_role_key.trim().toLowerCase() === key);
}

/**
 * Operator label for a role. Platform-fixed labels win (they are the established wording); a
 * configured role falls back to its definition's label, so a new role is never rendered as a raw key.
 */
export function operationalRoleLabel(roleKey: string): string {
    const key = roleKey.trim().toLowerCase();
    const fixed = PERSON_CHILD_OPERATIONAL_ROLE_LABELS[key];
    if (fixed) return fixed;
    const def = RELATIONSHIP_DEFINITIONS.find((d) => d.operational_role_key.trim().toLowerCase() === key);
    return def?.label ?? roleKey;
}
