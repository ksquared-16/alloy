import type { PersonHouseholdAdultLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

const PARENT_GUARDIAN_ROLE_KEYS = new Set(["parent", "primary_contact", "primary", "guardian"]);
const EMERGENCY_ROLE_KEYS = new Set(["emergency_contact", "emergency"]);

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
    return 3;
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
    parents_guardians: PersonDrawerChildFamilyAdult[];
    emergency_contacts: PersonDrawerChildFamilyAdult[];
    other_household_adults: PersonDrawerChildFamilyAdult[];
    source_note: string | null;
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

function sortAdults(rows: PersonDrawerChildFamilyAdult[]): PersonDrawerChildFamilyAdult[] {
    return [...rows].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return rolePrecedence(a.role_type) - rolePrecedence(b.role_type);
    });
}

function dedupeAdults(rows: PersonDrawerChildFamilyAdult[]): PersonDrawerChildFamilyAdult[] {
    const seen = new Set<string>();
    const out: PersonDrawerChildFamilyAdult[] = [];
    for (const row of rows) {
        const key = row.person_id ?? row.display_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

/**
 * Family section model — household customer_persons only (not person_relationships).
 * Opportunity drawer shows primary contact; person drawer shows household caregivers.
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
        .filter((row): row is PersonDrawerChildFamilyAdult => row != null);

    const parents_guardians = dedupeAdults(
        sortAdults(
            links.filter((row) => PARENT_GUARDIAN_ROLE_KEYS.has(normRole(row.role_type)))
        )
    );
    const emergency_contacts = dedupeAdults(
        sortAdults(links.filter((row) => EMERGENCY_ROLE_KEYS.has(normRole(row.role_type))))
    );
    const other_household_adults = dedupeAdults(
        links.filter((row) => {
            const role = normRole(row.role_type);
            return (
                role.length > 0 &&
                !PARENT_GUARDIAN_ROLE_KEYS.has(role) &&
                !EMERGENCY_ROLE_KEYS.has(role)
            );
        })
    );

    const hasExtraAdults = other_household_adults.length > 0;

    return {
        household_label: householdLabel,
        parents_guardians,
        emergency_contacts,
        other_household_adults,
        source_note: hasExtraAdults
            ? "Includes adults linked on the household account, not only the family lead contact."
            : null,
    };
}
