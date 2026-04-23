import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import { getEntityLabel } from "@/contexts/EntityLabelsContext";

/**
 * field_definitions / field_section_definitions use singular API entity_type
 * (person, customer, …). EntityLabelsContext + industry defaults use plural keys
 * (persons, customers, …) as in AdminEntityDrawer / status definitions.
 */
export const ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY: Record<string, string> = {
    person: "persons",
    customer: "customers",
    location: "locations",
    job: "jobs",
    opportunity: "opportunities",
    vendor: "vendors",
    schedule: "schedules",
};

export function adminFieldEntitySingularLabel(labels: EntityLabelsMap, entityTypeSingular: string): string {
    const pluralKey = ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY[entityTypeSingular] ?? entityTypeSingular;
    return getEntityLabel(labels, pluralKey, "singular");
}

export function adminFieldEntityPluralLabel(labels: EntityLabelsMap, entityTypeSingular: string): string {
    const pluralKey = ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY[entityTypeSingular] ?? entityTypeSingular;
    return getEntityLabel(labels, pluralKey, "plural");
}
