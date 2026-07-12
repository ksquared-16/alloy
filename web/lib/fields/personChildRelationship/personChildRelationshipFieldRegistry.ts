/**
 * Person ↔ Child relationship field registry — native + config fields on edge grain.
 */

import { PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE } from "./personChildRelationshipEntity";
import { PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY } from "./personChildRelationshipEntity";

export { PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE };

/** Native columns on person_child_relationships — not custom field_definitions. */
export const PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS = [
    "relationship_type",
    "priority",
    "status",
    "person_id",
    "customer_id",
    "customer_member_id",
] as const;

/** Starter configurable relationship-owned fields (native + seeded config). */
export const PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_KEYS = [
    "authorized_pickup",
    "legal_guardian",
    "lives_with_child",
    "financial_responsibility",
    "custody_notes",
    "pickup_instructions",
] as const;

export type PersonChildRelationshipConfigFieldKey =
    (typeof PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_KEYS)[number];

export type PersonChildRelationshipNativeFieldManifestRow = {
    field_key: (typeof PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS)[number];
    field_type: "select" | "number" | "text";
    label: string;
    section_key: string;
    sort_order: number;
    config?: Record<string, unknown>;
};

export const PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST: PersonChildRelationshipNativeFieldManifestRow[] = [
    {
        field_key: "relationship_type",
        field_type: "select",
        label: "Relationship to Child",
        section_key: "family_relationships",
        sort_order: 10,
        config: { option_set_key: PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY },
    },
    {
        field_key: "priority",
        field_type: "number",
        label: "Priority",
        section_key: "family_relationships",
        sort_order: 20,
    },
    {
        field_key: "status",
        field_type: "text",
        label: "Status",
        section_key: "family_relationships",
        sort_order: 30,
    },
];

export const PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_MANIFEST = [
    {
        field_key: "authorized_pickup",
        field_type: "text" as const,
        label: "Authorized pickup",
        section_key: "family_relationships",
        sort_order: 40,
    },
    {
        field_key: "legal_guardian",
        field_type: "text" as const,
        label: "Legal guardian",
        section_key: "family_relationships",
        sort_order: 50,
    },
    {
        field_key: "lives_with_child",
        field_type: "text" as const,
        label: "Lives with child",
        section_key: "family_relationships",
        sort_order: 60,
    },
    {
        field_key: "financial_responsibility",
        field_type: "text" as const,
        label: "Financial responsibility",
        section_key: "family_relationships",
        sort_order: 70,
    },
    {
        field_key: "custody_notes",
        field_type: "text" as const,
        label: "Custody notes",
        section_key: "family_relationships",
        sort_order: 80,
    },
    {
        field_key: "pickup_instructions",
        field_type: "text" as const,
        label: "Pickup instructions",
        section_key: "family_relationships",
        sort_order: 90,
    },
];

const NATIVE_SET = new Set<string>(PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS);
const CONFIG_SET = new Set<string>(PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_KEYS);

export function isPersonChildRelationshipNativeColumnKey(fieldKey: string): boolean {
    return NATIVE_SET.has(fieldKey.trim());
}

export function isPersonChildRelationshipConfigFieldKey(
    fieldKey: string,
): fieldKey is PersonChildRelationshipConfigFieldKey {
    return CONFIG_SET.has(fieldKey.trim());
}

/** Canonical provider ref namespace. */
export function personChildRelationshipProviderRef(fieldKey: string): string {
    return `person_child_relationship.${fieldKey.trim()}`;
}
