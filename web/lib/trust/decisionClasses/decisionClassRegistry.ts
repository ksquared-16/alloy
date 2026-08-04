/**
 * Decision Classes — definition contract and lookup.
 *
 * A Decision Class declares the governance a decision is subject to. It never
 * executes anything. Capabilities extend the Trust Runtime by registering a
 * class; they never modify the Decision Contract specification.
 *
 * The class DEFINITIONS live in their owning capability's contribution module,
 * and the composition root composes them (Slice 0.2). This module owns the
 * definition type and the lookup, not the entries.
 *
 * @see docs/platform/trust/decision-contract.md
 * @see lib/trust/registry/trustRegistry.ts — the composition root
 */

import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";

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

/**
 * Re-exported from the owning capability so every existing import path keeps
 * working. The key itself now lives in a leaf module, which is what lets the
 * strategy, the contribution and the consumer each name it without importing
 * one another.
 */
export { ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";

/** Bumped whenever a class definition changes; pinned into every contract for replay. */
export const DECISION_CLASS_REGISTRY_VERSION = "trust-decision-classes-v1.0.0" as const;

/**
 * Absent returns `null`, deliberately. An unregistered Decision Class is an
 * OPERATIONAL condition: the runtime turns it into a
 * `refused_unsupported_class` Decision Package. It is never an exception.
 */
export function resolveDecisionClass(key: string): DecisionClassDefinitionV1 | null {
    return TRUST_REGISTRY.getDecisionClass(key);
}

/** Registered keys, in composition order. */
export function listDecisionClassKeys(): readonly string[] {
    return TRUST_REGISTRY.listDecisionClassKeys();
}

export function isRegisteredDecisionClass(key: string): boolean {
    return TRUST_REGISTRY.getDecisionClass(key) !== null;
}
