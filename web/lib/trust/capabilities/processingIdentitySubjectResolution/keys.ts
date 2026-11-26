/**
 * Keys owned by the processing-identity-subject-resolution capability.
 *
 * A leaf module with no imports, matching the proven shape: the strategy, the
 * contribution and the dry run each name a key without importing one another.
 *
 * No `_v1` on the DECISION CLASS key — class versioning rides on
 * `DECISION_CLASS_REGISTRY_VERSION`. The suffix belongs on validation and
 * privacy policy keys, which version independently.
 */

export const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY =
    "processing_identity_subject_resolution" as const;

export const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_DETERMINISTIC_STRATEGY_KEY =
    "processing_identity_subject_resolution_deterministic" as const;

export const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION_POLICY_KEY =
    "processing_identity_subject_resolution_v1" as const;

/**
 * The platform privacy policy this capability REFERENCES. It does not own it —
 * privacy policies are platform-owned (`privacy-runtime.md` §Privacy Policies).
 */
export const PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY = "processing_identity_minimization_v1" as const;

/** The single information element the Decision Class requires. */
export const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_INFORMATION_KEY =
    "processing_identity_subject_material" as const;
