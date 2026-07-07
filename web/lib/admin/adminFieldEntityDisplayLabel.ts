import type { EntityLabelsMap } from "@/lib/admin/entityLabelDisplay";
import { CHILDCARE_FIELD_ENTITY_SINGULAR_LABELS } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { getEntityLabel } from "@/lib/admin/entityLabelDisplay";

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
    inquiry_child: "customer_members",
};

const STATIC_FIELD_ENTITY_SINGULAR_LABELS: Record<string, string> = {
    ...CHILDCARE_FIELD_ENTITY_SINGULAR_LABELS,
    customer_member: "Child",
};

export function adminFieldEntitySingularLabel(labels: EntityLabelsMap, entityTypeSingular: string): string {
    const normalized = entityTypeSingular.trim().toLowerCase();
    const staticLabel = STATIC_FIELD_ENTITY_SINGULAR_LABELS[normalized];
    if (staticLabel) return staticLabel;
    const pluralKey = ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY[entityTypeSingular] ?? entityTypeSingular;
    return getEntityLabel(labels, pluralKey, "singular");
}

export function adminFieldEntityPluralLabel(labels: EntityLabelsMap, entityTypeSingular: string): string {
    const normalized = entityTypeSingular.trim().toLowerCase();
    if (normalized === "inquiry_child" || normalized === "customer_member") return "Children";
    const pluralKey = ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY[entityTypeSingular] ?? entityTypeSingular;
    return getEntityLabel(labels, pluralKey, "plural");
}
