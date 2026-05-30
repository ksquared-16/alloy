import {
    resolvePersonDrawerHouseholdModel,
    type PersonDrawerHouseholdMember,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

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

function toFamilyAdult(row: PersonDrawerHouseholdMember): PersonDrawerChildFamilyAdult {
    return {
        person_id: row.person_id,
        display_name: row.display_name,
        role_label: row.role_label,
        role_type: row.role_type,
        is_primary: row.is_primary,
        source: "household_account",
    };
}

/**
 * Family section model — delegates to shared household model (household customer_persons only).
 */
export function resolvePersonDrawerChildFamilyModel(
    record: Record<string, unknown>
): PersonDrawerChildFamilyModel {
    const model = resolvePersonDrawerHouseholdModel(record, {
        viewing_person_id:
            typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : null,
    });
    const group = model.groups[0];
    if (!group) {
        return {
            household_label: null,
            parents_guardians: [],
            emergency_contacts: [],
            other_household_adults: [],
            source_note: null,
        };
    }

    return {
        household_label: group.household_label,
        parents_guardians: group.guardians.map(toFamilyAdult),
        emergency_contacts: group.emergency_contacts.map(toFamilyAdult),
        other_household_adults: [],
        source_note: null,
    };
}
