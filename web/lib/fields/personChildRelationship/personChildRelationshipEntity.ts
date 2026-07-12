/**
 * Canonical Person ↔ Child relationship instance entity.
 *
 * Alex → Person identity
 * Alex ↔ Mia → relationship instance
 * Emergency Contact → operational role on that instance
 * Aunt → relationship_type (kinship) on that instance
 */

export const PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE = "person_child_relationship" as const;

export type PersonChildRelationshipEntityType = typeof PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE;

export type PersonChildRelationshipStatus = "active" | "inactive";

/** Stable operational role keys — not kinship types. */
export const PERSON_CHILD_OPERATIONAL_ROLE_KEYS = [
    "parent",
    "guardian",
    "emergency_contact",
    "authorized_pickup",
    "billing_contact",
    "communication_recipient",
    "financial_responsibility",
] as const;

export type PersonChildOperationalRoleKey = (typeof PERSON_CHILD_OPERATIONAL_ROLE_KEYS)[number];

const OPERATIONAL_ROLE_SET = new Set<string>(PERSON_CHILD_OPERATIONAL_ROLE_KEYS);

export function isPersonChildOperationalRoleKey(value: string): value is PersonChildOperationalRoleKey {
    return OPERATIONAL_ROLE_SET.has(value.trim().toLowerCase());
}

/** Platform starter kinship option keys (labels tenant-configurable via option set). */
export const PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY = "person_child_relationship_type" as const;

export const PERSON_CHILD_RELATIONSHIP_TYPE_STARTER_KEYS = [
    "mother",
    "father",
    "stepparent",
    "grandparent",
    "aunt",
    "uncle",
    "sibling",
    "foster_parent",
    "family_friend",
    "other",
] as const;

export type PersonChildRelationshipTypeKey = (typeof PERSON_CHILD_RELATIONSHIP_TYPE_STARTER_KEYS)[number];

export type PersonChildRelationshipRecord = {
    id: string;
    org_id: string;
    customer_id: string;
    customer_member_id: string;
    person_id: string;
    relationship_type: string | null;
    priority: number | null;
    status: PersonChildRelationshipStatus;
    metadata?: Record<string, unknown>;
};

export type PersonChildRelationshipRoleAssignment = {
    id: string;
    org_id: string;
    relationship_id: string;
    role_key: string;
    is_active: boolean;
};

export type PersonChildRelationshipInstance = PersonChildRelationshipRecord & {
    operational_roles: readonly string[];
    person?: Record<string, unknown> | null;
    custom_field_values?: Record<string, unknown>;
};

export type PersonChildRelationshipContext = {
    organization_id: string;
    customer_id: string;
    customer_member_id: string;
    relationship_id: string;
    person_id: string;
    operational_roles: readonly string[];
};

export type PersonChildRelationshipResolveStatus =
    | "resolved"
    | "empty"
    | "inactive"
    | "missing_person"
    | "invalid_context"
    | "unauthorized"
    | "legacy_only"
    | "unsupported";

export type PersonChildRelationshipCollectionResult = {
    status: PersonChildRelationshipResolveStatus;
    items: readonly PersonChildRelationshipInstance[];
    reason?: string;
};
