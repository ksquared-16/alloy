/**
 * Maps legacy customer_member_contacts role keys to canonical PCR operational roles.
 */

const MEMBER_ROLE_TO_OPERATIONAL: Record<string, string> = {
    guardian: "guardian",
    primary_contact: "parent",
    parent: "parent",
    secondary_guardian: "guardian",
    secondary: "guardian",
    emergency_contact: "emergency_contact",
    emergency: "emergency_contact",
    authorized_pickup: "authorized_pickup",
    pickup: "authorized_pickup",
    billing_contact: "billing_contact",
    payer: "billing_contact",
    billing: "billing_contact",
    billing_responsible: "billing_contact",
};

export function mapMemberContactRoleToOperational(roleKey: string): string | null {
    const key = roleKey.trim().toLowerCase();
    return MEMBER_ROLE_TO_OPERATIONAL[key] ?? null;
}

/** Child-scoped relationship writes that map to PCR should never use legacy tables. */
export function shouldWriteChildScopedRelationshipsToPcr(args: {
    executorKind: string;
    roleKey: string | null;
}): boolean {
    if (args.executorKind === "child_scoped_contact" || args.executorKind === "link_person") {
        return Boolean(args.roleKey && mapMemberContactRoleToOperational(args.roleKey));
    }
    return false;
}
