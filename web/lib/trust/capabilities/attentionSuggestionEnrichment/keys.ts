/**
 * Keys owned by the attention-suggestion-enrichment capability.
 *
 * A leaf module with no imports. Keys live here rather than beside the
 * definitions that use them so that the strategy, the contribution and the
 * consumer can each name a key without importing one another — which is what
 * keeps the composition graph acyclic.
 */

export const ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY = "attention_suggestion_enrichment" as const;

export const ATTENTION_SUGGESTION_ENRICHMENT_DETERMINISTIC_STRATEGY_KEY =
    "attention_suggestion_enrichment_deterministic" as const;

export const ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION_POLICY_KEY = "attention_suggestion_enrichment_v1" as const;

/**
 * The platform privacy policy this capability REFERENCES. It does not own it —
 * privacy policies are platform-owned (`privacy-runtime.md` §Privacy Policies).
 */
export const ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY = "attention_suggestion_minimization_v1" as const;
