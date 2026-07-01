import { PERSON_DRAWER_PARENT_ADDRESS_FIELD_KEYS } from "@/lib/admin/person/personDrawerParentAddressFields";
import { PERSON_DRAWER_PARENT_OPERATING_SUMMARY_KEYS } from "@/lib/admin/person/personDrawerPresentationProfile";

/** Overview section keys suppressed when parent operating chrome is active. */
export const PERSON_DRAWER_PARENT_SUPPRESSED_SECTION_KEYS = new Set([
    "basic_info",
    "basic",
    "profile",
    "preferred_name",
    "contact_info",
    "contact",
    "consent",
    "enrollment",
    "enrollment_opportunities",
    "enrollment_activity",
    "relationships",
    "record_info",
    "identity",
    "guardian_profile",
    "emergency",
    "medical",
    "child_profile",
    "address",
    "employee_placement",
    "custom_property_fields",
]);

/** Field keys owned by dedicated parent operating panels — never duplicate in config overview. */
export const PERSON_DRAWER_PARENT_DEDICATED_FIELD_KEYS = new Set([
    ...PERSON_DRAWER_PARENT_OPERATING_SUMMARY_KEYS,
    ...PERSON_DRAWER_PARENT_ADDRESS_FIELD_KEYS,
]);

export function filterPersonDrawerParentOverviewSections<T extends { key: string; fields?: { key: string }[] }>(
    sections: T[]
): T[] {
    return sections
        .filter((section) => !PERSON_DRAWER_PARENT_SUPPRESSED_SECTION_KEYS.has(section.key))
        .map((section) => ({
            ...section,
            fields: (section.fields ?? []).filter((f) => !PERSON_DRAWER_PARENT_DEDICATED_FIELD_KEYS.has(f.key)),
        }))
        .filter((section) => (section.fields?.length ?? 0) > 0);
}
