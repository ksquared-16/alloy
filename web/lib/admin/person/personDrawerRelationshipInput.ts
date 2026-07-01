import type {
    PersonHouseholdAdultLinkRow,
    PersonHouseholdChildLinkRow,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";
import type { PersonRelationshipGroupsInput } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";

/** Normalize person GET payload into relationship group builder input. */
export function personDrawerRelationshipInputFromRecord(
    record: Record<string, unknown>
): PersonRelationshipGroupsInput {
    return {
        person_id: String(record.id ?? ""),
        customer_persons:
            (record._customer_persons as PersonRelationshipGroupsInput["customer_persons"]) ?? [],
        person_relationships:
            (record._person_relationships as PersonRelationshipGroupsInput["person_relationships"]) ?? [],
        sibling_links: (record._sibling_links as PersonSiblingLinkRow[]) ?? [],
        household_adult_links: (record._household_adult_links as PersonHouseholdAdultLinkRow[]) ?? [],
        household_child_links: (record._household_child_links as PersonHouseholdChildLinkRow[]) ?? [],
    };
}
