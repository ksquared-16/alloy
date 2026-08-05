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
 * Every gap type. Exclude all of these from any exception count that feeds an
 * operator-visible projection.
 */
export const TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES: readonly string[] = [
    TRUST_SOURCE_CLASSIFICATION_GAP_TYPE,
    TRUST_IDENTITY_RESOLUTION_GAP_TYPE,
];

export function isTrustGovernanceGapExceptionType(exceptionType: string): boolean {
    return TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES.includes(exceptionType);
}
