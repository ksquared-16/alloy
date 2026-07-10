/** How a relationship target was chosen — not display identity. */
export type RelationshipResolutionSource =
    | "canonical_pointer"
    | "legacy_fallback"
    | "role_assignment"
    | "derived";

/** Non-blocking reconciliation signals for operator surfaces. */
export type RelationshipResolutionDiagnostic =
    | "relationship_data_conflict"
    | "canonical_pointer_invalid"
    | "legacy_reconciliation_required";
