/**
 * Canonical provider metadata for Person ↔ Child relationship instances.
 */

import { PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE } from "./personChildRelationshipEntity";
import {
    PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_MANIFEST,
    PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST,
    personChildRelationshipProviderRef,
} from "./personChildRelationshipFieldRegistry";

export type PersonChildRelationshipProviderDefinition = {
    refKey: string;
    kind: "relationship_instance_field";
    owner_entity_type: typeof PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE;
    source_entity_type: "person";
    target_entity_type: "customer_member";
    field_key: string;
    value_type: string;
    option_set_key?: string;
    reporting_grain: "relationship_instance";
    required_context_keys: readonly ["customer_member_id", "relationship_id"];
};

export const PERSON_CHILD_RELATIONSHIP_PROVIDER_DEFINITIONS: readonly PersonChildRelationshipProviderDefinition[] = [
    ...PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST.map((row) => ({
        refKey: personChildRelationshipProviderRef(row.field_key),
        kind: "relationship_instance_field" as const,
        owner_entity_type: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
        source_entity_type: "person" as const,
        target_entity_type: "customer_member" as const,
        field_key: row.field_key,
        value_type: row.field_type,
        option_set_key: typeof row.config?.option_set_key === "string" ? row.config.option_set_key : undefined,
        reporting_grain: "relationship_instance" as const,
        required_context_keys: ["customer_member_id", "relationship_id"] as const,
    })),
    ...PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_MANIFEST.map((row) => ({
        refKey: personChildRelationshipProviderRef(row.field_key),
        kind: "relationship_instance_field" as const,
        owner_entity_type: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
        source_entity_type: "person" as const,
        target_entity_type: "customer_member" as const,
        field_key: row.field_key,
        value_type: row.field_type,
        reporting_grain: "relationship_instance" as const,
        required_context_keys: ["customer_member_id", "relationship_id"] as const,
    })),
];

export function findPersonChildRelationshipProvider(refKey: string): PersonChildRelationshipProviderDefinition | undefined {
    return PERSON_CHILD_RELATIONSHIP_PROVIDER_DEFINITIONS.find((p) => p.refKey === refKey.trim());
}
