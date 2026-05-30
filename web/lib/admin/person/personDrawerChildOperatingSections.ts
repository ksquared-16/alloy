import { PERSON_DRAWER_PARENT_ADDRESS_FIELD_KEYS } from "@/lib/admin/person/personDrawerParentAddressFields";
import {
    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY,
    PERSON_DRAWER_CHILD_START_DATE_KEY,
} from "@/lib/admin/person/personDrawerChildLifecycleFields";

/** Overview section keys suppressed on child lifecycle operating surface. */
export const PERSON_DRAWER_CHILD_SUPPRESSED_SECTION_KEYS = new Set([
    "basic_info",
    "basic",
    "profile",
    "preferred_name",
    "child_profile",
    "contact_info",
    "contact",
    "record_info",
    "identity",
    "relationships",
    "enrollment",
    "enrollment_opportunities",
    "employee_placement",
    "address",
]);

/** Field keys owned by Child Summary — never duplicate in config overview. */
export const PERSON_DRAWER_CHILD_DEDICATED_FIELD_KEYS = new Set([
    "first_name",
    "last_name",
    "full_name",
    "date_of_birth",
    "dob",
    "gender",
    "gender_key",
    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY,
    PERSON_DRAWER_CHILD_START_DATE_KEY,
    ...PERSON_DRAWER_PARENT_ADDRESS_FIELD_KEYS,
]);

export function filterPersonDrawerChildOverviewSections<T extends { key: string; fields?: { key: string }[] }>(
    sections: T[]
): T[] {
    return sections
        .filter((section) => !PERSON_DRAWER_CHILD_SUPPRESSED_SECTION_KEYS.has(section.key))
        .map((section) => ({
            ...section,
            fields: (section.fields ?? []).filter((f) => !PERSON_DRAWER_CHILD_DEDICATED_FIELD_KEYS.has(f.key)),
        }))
        .filter((section) => (section.fields?.length ?? 0) > 0);
}
