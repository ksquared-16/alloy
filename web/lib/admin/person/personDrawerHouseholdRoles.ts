export const PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES = new Set([
    "parent",
    "primary_contact",
    "primary",
    "guardian",
    "secondary_guardian",
    "secondary",
    "secondary_contact",
    "co_parent",
    "coparent",
    "spouse",
    "partner",
    // Create Lead / Processing often links secondary adults as opportunity family_member.
    "family_member",
]);
export const PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES = new Set(["emergency_contact", "emergency"]);
export const PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES = new Set(["authorized_pickup", "pickup"]);
export const PERSON_DRAWER_HOUSEHOLD_BILLING_ROLES = new Set([
    "payer",
    "billing",
    "billing_responsible",
    "billing_contact",
]);

export function normPersonDrawerHouseholdRole(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

export function guardianRolePrecedence(roleType: string | null): number {
    const role = normPersonDrawerHouseholdRole(roleType);
    if (role === "primary_contact" || role === "primary") return 0;
    if (role === "parent") return 1;
    if (role === "guardian") return 2;
    if (role === "secondary_guardian" || role === "secondary") return 3;
    return 4;
}
