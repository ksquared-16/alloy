/**
 * Keys owned by the processing-source-classification capability.
 *
 * A leaf module with no imports, matching the proven Phase 0 shape: the
 * strategy, the contribution and the consumer each name a key without importing
 * one another, which keeps the composition graph acyclic.
 *
 * No `_v1` suffix on the DECISION CLASS key — class versioning is carried by
 * `DECISION_CLASS_REGISTRY_VERSION`, which is pinned into every contract for
 * replay. The suffix belongs on the validation and privacy policy keys, which
 * version independently.
 */

export const PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY = "processing_source_classification" as const;

export const PROCESSING_SOURCE_CLASSIFICATION_DETERMINISTIC_STRATEGY_KEY =
    "processing_source_classification_deterministic" as const;

export const PROCESSING_SOURCE_CLASSIFICATION_VALIDATION_POLICY_KEY =
    "processing_source_classification_v1" as const;

/**
 * The platform privacy policy this capability REFERENCES. It does not own it —
 * privacy policies are platform-owned (`privacy-runtime.md` §Privacy Policies).
 */
export const PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY = "processing_source_minimization_v1" as const;

/** The single information element the Decision Class requires. */
export const PROCESSING_SOURCE_CLASSIFICATION_INFORMATION_KEY = "processing_source_classification_result" as const;
