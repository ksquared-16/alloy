export const PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES = new Set([
    "parent",
    "primary_contact",
    "primary",
    "guardian",
]);
export const PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES = new Set(["emergency_contact", "emergency"]);
export const PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES = new Set(["authorized_pickup", "pickup"]);

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
    return 3;
}
