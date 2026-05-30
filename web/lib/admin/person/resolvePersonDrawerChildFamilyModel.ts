import type { PersonHouseholdAdultLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

const CAREGIVER_ROLE_KEYS = new Set([
    "parent",
    "primary_contact",
    "primary",
    "guardian",
    "emergency_contact",
    "emergency",
]);

function normRole(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function rolePrecedence(roleType: string | null): number {
    const role = normRole(roleType);
    if (role === "primary_contact" || role === "primary") return 0;
    if (role === "parent") return 1;
    if (role === "guardian") return 2;
    if (role === "emergency_contact" || role === "emergency") return 3;
    return 4;
}

export type PersonDrawerChildFamilyAdult = {
    person_id: string | null;
    display_name: string;
    role_label: string | null;
    role_type: string | null;
    is_primary: boolean;
    source: "household_account";
};

export type PersonDrawerChildFamilyModel = {
    household_label: string | null;
    primary_adult: PersonDrawerChildFamilyAdult | null;
    other_adults: PersonDrawerChildFamilyAdult[];
    source_note: string;
};

function toFamilyAdult(row: PersonHouseholdAdultLinkRow): PersonDrawerChildFamilyAdult | null {
    const name = String(row.display_name ?? "").trim();
    if (!name && !row.person_id) return null;
    return {
        person_id: row.person_id ?? null,
        display_name: name || "Unnamed",
        role_label: row.role_label?.trim() || row.role_type?.trim() || null,
        role_type: row.role_type ?? null,
        is_primary: Boolean(row.is_primary),
        source: "household_account",
    };
}

function isCaregiverRole(roleType: string | null | undefined): boolean {
    const role = normRole(roleType);
    if (!role) return false;
    return CAREGIVER_ROLE_KEYS.has(role);
}

/**
 * Family section model — household customer_persons only (not person_relationships).
 * Opportunity drawer shows primary contact; person drawer shows full household caregivers.
 */
export function resolvePersonDrawerChildFamilyModel(
    record: Record<string, unknown>
): PersonDrawerChildFamilyModel {
    const householdLabel =
        String(
            (record._household_context as { customer_name?: string }[] | undefined)?.[0]?.customer_name ?? ""
        ).trim() || null;

    const links = ((record._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? [])
        .map(toFamilyAdult)
        .filter((row): row is PersonDrawerChildFamilyAdult => row != null)
        .filter((row) => isCaregiverRole(row.role_type));

    const sorted = [...links].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return rolePrecedence(a.role_type) - rolePrecedence(b.role_type);
    });

    const primary =
        sorted.find((row) => row.is_primary) ??
        sorted.find((row) => {
            const role = normRole(row.role_type);
            return role === "parent" || role === "primary" || role === "primary_contact";
        }) ??
        sorted[0] ??
        null;

    const other_adults = primary
        ? sorted.filter((row) => row.person_id !== primary.person_id)
        : sorted.slice(1);

    return {
        household_label: householdLabel,
        primary_adult: primary,
        other_adults,
        source_note:
            "From household account — may include more adults than the linked family lead contact.",
    };
}
