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

/**
 * PLATFORM-FIXED operational role keys — not kinship types, and NOT the whole vocabulary.
 *
 * These roles carry code meaning beyond configuration (billing/financial subsystems, communication
 * recipients, the guardian write path), so they stay enumerated here. CONFIGURED roles are declared by
 * relationship definitions and are not listed here — this module is deliberately low-level and must
 * not import the definition registry (that would be an import cycle, since definitions type their
 * role against this module).
 *
 * For the full runtime vocabulary (platform-fixed + configured) use `operationalRoleVocabulary()` in
 * `personChildRelationshipOperationalRoles.ts`.
 */
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

/**
 * An operational role key that MAY be configured rather than platform-fixed.
 *
 * Open by design: a relationship definition can declare a role the platform has never heard of
 * (physician, attorney, case worker). The `(string & {})` arm keeps editor autocomplete for the
 * platform-fixed keys while accepting any configured key — this is what makes "adding Physician is one
 * definition row" possible at the type level. Validate at runtime with `isOperationalRoleKey()`.
 */
export type OperationalRoleKey = PersonChildOperationalRoleKey | (string & {});

const OPERATIONAL_ROLE_SET = new Set<string>(PERSON_CHILD_OPERATIONAL_ROLE_KEYS);

/** Platform-fixed roles ONLY. For configured roles use `isOperationalRoleKey()`. */
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
    /** Valid items were returned, but one or more rows were skipped — see `warnings`. */
    | "resolved_with_warnings"
    | "empty"
    /** A systemic failure (query/schema), NOT a single bad row. */
    | "failed"
    | "inactive"
    | "missing_person"
    | "invalid_context"
    | "unauthorized"
    | "legacy_only"
    | "unsupported";

/** Why one relationship row could not be normalized. Never silently swallowed. */
export type PersonChildRelationshipWarning = {
    relationship_id: string;
    person_id: string | null;
    reason: string;
    /** Whether re-running could succeed once the underlying data is fixed. */
    recoverable: boolean;
    source: "person_child_relationships" | "customer_member_contacts";
};

export type PersonChildRelationshipCollectionResult = {
    status: PersonChildRelationshipResolveStatus;
    items: readonly PersonChildRelationshipInstance[];
    reason?: string;
    /** Present when individual rows were skipped; callers can distinguish partial from empty. */
    warnings?: readonly PersonChildRelationshipWarning[];
};
