/**
 * Legacy compatibility classification and write authority policy.
 */

export type LegacyMappingClass = "deterministic" | "inferred" | "ambiguous" | "incompatible";

export const PERSON_CHILD_LEGACY_WRITE_POLICY = {
    canonicalWriteAuthority: ["person_child_relationships", "person_child_relationship_roles", "field_values"],
    legacyReadSources: ["customer_member_contacts", "customer_persons", "opportunity_persons", "person_relationships"],
    legacyWriteAllowed: false,
    dualWrite: false,
    backfill: "deferred_manual_reconciliation",
    deprecationGate: "Focus Panel relationship-instance migration complete",
} as const;

/** Documented classification — implementation in legacy read adapter. */
export const LEGACY_SOURCE_CLASSIFICATION: Readonly<Record<string, LegacyMappingClass>> = {
    customer_member_contacts: "inferred",
    customer_persons: "ambiguous",
    opportunity_persons: "ambiguous",
    person_relationships: "incompatible",
};
