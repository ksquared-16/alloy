/**
 * Keys owned by the attention-suggestion-enrichment capability.
 *
 * A leaf module with no imports. Keys live here rather than beside the
 * definitions that use them so that the strategy, the contribution and the
 * consumer can each name a key without importing one another — which is what
 * keeps the composition graph acyclic.
 */

export const ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY = "attention_suggestion_enrichment" as const;

/**
 * The SECOND decision class — provider-backed enrichment (Phase 2.8 Gate C).
 *
 * A second class rather than a widened first one, and the reason is structural.
 * `selectStrategy` reads `strategy_preference` and `max_escalation_level` off
 * the class and nothing else: there is no per-request input, deliberately
 * (D-65). Raising the deterministic class's ceiling to admit a `small_reasoning`
 * strategy would therefore not make provider-backed reasoning *available* — it
 * would make it **mandatory**, because the registry would prefer it for every
 * execution of that class, including the deterministic path certified in
 * Phase 1. That breaks D-42 in the worst possible direction: the provider would
 * be reached by default.
 *
 * Two classes keep selection authority in the registry where D-65 puts it, and
 * put the affirmative choice where authorization already lives — the capability
 * chooses WHICH class to submit, from
 * `permitsReasoningMode(authorization, "provider_backed")`. Nothing selects a
 * provider; a class that only provider-backed reasoning can satisfy is
 * selected, and the registry then does exactly what it always does.
 *
 * Both classes reference the SAME privacy policy and the SAME validation
 * policy. The governance is identical; only the escalation budget differs.
 */
export const ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY =
    "attention_suggestion_enrichment_provider_backed" as const;

export const ATTENTION_SUGGESTION_ENRICHMENT_DETERMINISTIC_STRATEGY_KEY =
    "attention_suggestion_enrichment_deterministic" as const;

export const ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION_POLICY_KEY = "attention_suggestion_enrichment_v1" as const;

/**
 * The platform privacy policy this capability REFERENCES. It does not own it —
 * privacy policies are platform-owned (`privacy-runtime.md` §Privacy Policies).
 */
export const ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY = "attention_suggestion_minimization_v1" as const;
