/**
 * Platform-fixed operational role keys with tenant-configurable labels elsewhere.
 * Kinship types must never appear here.
 */

import { PERSON_CHILD_OPERATIONAL_ROLE_KEYS, isPersonChildOperationalRoleKey } from "./personChildRelationshipEntity";

export { PERSON_CHILD_OPERATIONAL_ROLE_KEYS, isPersonChildOperationalRoleKey };

export const PERSON_CHILD_OPERATIONAL_ROLE_LABELS: Readonly<Record<string, string>> = {
    parent: "Parent",
    guardian: "Guardian",
    emergency_contact: "Emergency Contact",
    authorized_pickup: "Authorized Pickup",
    billing_contact: "Billing Contact",
    communication_recipient: "Communication Recipient",
    financial_responsibility: "Financial Responsibility",
};

export function operationalRoleLabel(roleKey: string): string {
    const key = roleKey.trim().toLowerCase();
    return PERSON_CHILD_OPERATIONAL_ROLE_LABELS[key] ?? roleKey;
}
