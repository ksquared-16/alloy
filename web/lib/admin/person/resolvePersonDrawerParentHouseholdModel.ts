import {
    resolvePersonDrawerHouseholdModel,
    stampPersonDrawerHouseholdHeaderContext,
    type PersonDrawerHouseholdChildMember,
    type PersonDrawerHouseholdMember,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

/** @deprecated Use PersonDrawerHousehold* types — kept for parent drawer imports during migration. */
export type PersonDrawerParentHouseholdPerson = PersonDrawerHouseholdMember;

/** @deprecated Use PersonDrawerHouseholdChildMember. */
export type PersonDrawerParentLinkedChild = PersonDrawerHouseholdChildMember;

export type PersonDrawerParentHouseholdGroup = {
    customer_id: string;
    household_label: string | null;
    primary_guardian_name: string | null;
    primary_guardian_role_label: string | null;
    children: PersonDrawerHouseholdChildMember[];
    emergency_contacts: PersonDrawerHouseholdMember[];
    authorized_pickups: PersonDrawerHouseholdMember[];
    other_adults: PersonDrawerHouseholdMember[];
};

export type PersonDrawerParentHouseholdModel = {
    groups: PersonDrawerParentHouseholdGroup[];
};

/** Parent-facing household projection — delegates to shared household model. */
export function resolvePersonDrawerParentHouseholdModel(
    record: Record<string, unknown>
): PersonDrawerParentHouseholdModel {
    const model = resolvePersonDrawerHouseholdModel(record, {
        viewing_person_id:
            typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : null,
    });
    return {
        groups: model.groups.map((group) => {
            const primary =
                group.guardians.find((g) => g.is_primary) ?? group.guardians[0] ?? null;
            return {
                customer_id: group.customer_id,
                household_label: group.household_label,
                primary_guardian_name: primary?.display_name ?? null,
                primary_guardian_role_label: primary?.is_primary
                    ? primary.role_label ?? "Primary guardian"
                    : primary?.role_label ?? null,
                children: group.children,
                emergency_contacts: group.emergency_contacts,
                authorized_pickups: group.authorized_pickups,
                other_adults: group.other_household_members,
            };
        }),
    };
}

/** Stamp primary household/child labels on record for header first paint. */
export function stampPersonDrawerParentHeaderContext(
    record: Record<string, unknown>
): Record<string, unknown> {
    return stampPersonDrawerHouseholdHeaderContext(record);
}
