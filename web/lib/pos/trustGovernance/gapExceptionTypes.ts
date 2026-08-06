/**
 * Trust governance-gap exception types, in one place.
 *
 * A governance gap records that a Decision Package could not be captured. It is
 * **not** a Processing exception: the Processing work committed and is
 * authoritative, and nothing about operator review, case readiness or identity
 * eligibility changed.
 *
 * Every projection that counts `processing_exceptions` must therefore exclude
 * these types, or a Trust outage would change what an operator sees — the exact
 * coupling AD-P1-8 forbids. This module exists so that exclusion is a single
 * list rather than a string repeated at each call site: adding a third
 * capability's gap type here updates every projection at once.
 *
 * The only genuinely shared primitive extracted for the second consumer. The
 * gap STORES stay capability-owned, because their durable snapshots differ in
 * shape and must be able to version independently.
 */

/** Phase 1.1 — source classification could not be governed. */
export const TRUST_SOURCE_CLASSIFICATION_GAP_TYPE = "trust_governance_gap" as const;

/** Phase 1.5 — one identity SUBJECT judgment could not be governed. */
export const TRUST_IDENTITY_RESOLUTION_GAP_TYPE = "trust_identity_resolution_governance_gap" as const;

/**
 * Phase 1.6 — a prior governed identity judgment could not be marked superseded.
 *
 * DISTINCT from the capture gap rather than a flag on it. The two carry
 * materially different replay material (a governed recommendation versus a
 * lineage claim) and reconcile through materially different paths (run the
 * capture seam versus append one observation). Overloading the capture parser
 * with lineage data is what the shared-infrastructure boundary forbids.
 */
export const TRUST_IDENTITY_LINEAGE_GAP_TYPE = "trust_identity_lineage_governance_gap" as const;

/**
 * Phase 1.7 — the outcome of an executed Commit Plan could not be observed.
 *
 * DISTINCT again, for the same reason: the replay material is an execution
 * claim bound to a durable commit attempt, and it reconciles by appending an
 * `executed`/`outcome` observation rather than by capturing a judgment or
 * asserting lineage. The Processing execution itself already committed and is
 * authoritative; only its Trust evidence is outstanding.
 */
export const TRUST_IDENTITY_EXECUTION_GAP_TYPE = "trust_identity_execution_governance_gap" as const;

/**
 * Every gap type. Exclude all of these from any exception count that feeds an
 * operator-visible projection.
 */
export const TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES: readonly string[] = [
    TRUST_SOURCE_CLASSIFICATION_GAP_TYPE,
    TRUST_IDENTITY_RESOLUTION_GAP_TYPE,
    TRUST_IDENTITY_LINEAGE_GAP_TYPE,
    TRUST_IDENTITY_EXECUTION_GAP_TYPE,
];

export function isTrustGovernanceGapExceptionType(exceptionType: string): boolean {
    return TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES.includes(exceptionType);
}
