/**
 * Decision Class Registry — code-owned and closed.
 *
 * A Decision Class declares the governance a decision is subject to. It never
 * executes anything. Capabilities extend the Trust Runtime by registering a
 * class; they never modify the Decision Contract specification.
 *
 * V1 registers exactly one class.
 *
 * @see docs/platform/trust/decision-contract.md
 */

/** Risk tier — the first-class axis `AI_ALLOWED_FEATURES` lacked. */
export const TRUST_RISK_TIERS = ["mandatory", "fallback", "convenience", "prohibited"] as const;
export type TrustRiskTier = (typeof TRUST_RISK_TIERS)[number];

/** Deterministic review requirement. Reasoning never decides this. */
export const TRUST_REVIEW_REQUIREMENTS = [
    "automatic",
    "operator_review",
    "compliance_review",
    "financial_review",
    "administrative_review",
] as const;
export type TrustReviewRequirement = (typeof TRUST_REVIEW_REQUIREMENTS)[number];

export type DecisionClassDefinitionV1 = {
    readonly key: string;
    readonly risk_tier: TrustRiskTier;
    /** Information requirements the runtime must satisfy before reasoning. */
    readonly required_information: readonly string[];
    /** Knowledge categories. Empty in V1 — the Knowledge Platform is Phase 4. */
    readonly knowledge_categories: readonly string[];
    readonly privacy_policy_key: string;
    readonly validation_policy_key: string;
    /** Ordered strategy preference — least expensive sufficient strategy first. */
    readonly strategy_preference: readonly string[];
    /** Minimum trust score for the recommendation to be presented without review. */
    readonly trust_threshold: number;
    readonly review_requirement: TrustReviewRequirement;
    readonly learning_policy_key: string;
    readonly economic_policy: {
        readonly max_latency_ms: number;
        readonly max_escalation_level: number;
    };
    /** The org `ai_policy.allowed_features` entry this class maps to, when one applies. */
    readonly requires_allowed_feature: string | null;
};

export const ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY = "attention_suggestion_enrichment" as const;

const ATTENTION_SUGGESTION_ENRICHMENT: DecisionClassDefinitionV1 = {
    key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
    risk_tier: "convenience",
    required_information: ["deterministic_attention_suggestion"],
    knowledge_categories: [],
    privacy_policy_key: "attention_suggestion_minimization_v1",
    validation_policy_key: "attention_suggestion_enrichment_v1",
    strategy_preference: ["deterministic"],
    trust_threshold: 0.5,
    review_requirement: "operator_review",
    learning_policy_key: "none_v1",
    economic_policy: { max_latency_ms: 5_000, max_escalation_level: 0 },
    requires_allowed_feature: "draft_enrichment",
};

const REGISTRY: ReadonlyMap<string, DecisionClassDefinitionV1> = new Map([
    [ATTENTION_SUGGESTION_ENRICHMENT.key, ATTENTION_SUGGESTION_ENRICHMENT],
]);

/** Bumped whenever a class definition changes; pinned into every contract for replay. */
export const DECISION_CLASS_REGISTRY_VERSION = "trust-decision-classes-v1.0.0" as const;

export function resolveDecisionClass(key: string): DecisionClassDefinitionV1 | null {
    return REGISTRY.get(key) ?? null;
}

export function listDecisionClassKeys(): readonly string[] {
    return [...REGISTRY.keys()];
}

export function isRegisteredDecisionClass(key: string): boolean {
    return REGISTRY.has(key);
}
