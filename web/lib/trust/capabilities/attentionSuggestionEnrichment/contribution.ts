/**
 * Capability contribution — attention suggestion enrichment.
 *
 * The one capability whose ownership is already proven: it was implemented,
 * certified and merged as Trust Runtime V1 Slice 1, and it is the only
 * capability with a live operator surface today. Nothing else is given a
 * contribution module in this slice, because nothing else has earned one.
 *
 * Per `trust-runtime.md` §Extension Points a capability registers Decision
 * Classes, Reasoning Strategies and Validation Policies. It does **not**
 * register privacy policies — it references the platform's by key.
 *
 * This module declares. It does not compose, and importing it registers
 * nothing.
 *
 * @see docs/platform/trust/trust-runtime.md — Extension Points
 * @see certification/trust-runtime-v1/README.md
 */

import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import { resolveGovernedReasoningProviderPort } from "@/lib/ai/trust/governedReasoningProviderPort";
import {
    ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
    ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY,
    ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION_POLICY_KEY,
    ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY,
} from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import { createProviderBackedAttentionEnrichmentStrategy } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/providerBackedStrategy";
import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { attentionSuggestionEnrichmentDeterministicStrategy } from "@/lib/trust/reasoning/strategies/attentionSuggestionEnrichmentDeterministic";
import type { TrustContribution } from "@/lib/trust/registry/trustRegistryTypes";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

/**
 * Trust's own deadline for provider-backed enrichment, and the class's latency
 * ceiling. One number, declared once: a strategy whose wall differs from the
 * class's economic policy would let a decision exceed a budget the class says
 * it enforces.
 *
 * Chosen to match the ungoverned path's effective behaviour rather than to
 * change it — Phase 2.8 moves authority, not timeouts.
 */
const PROVIDER_BACKED_DEADLINE_MS = 20_000;

const ATTENTION_SUGGESTION_ENRICHMENT_CLASS: DecisionClassDefinitionV1 = {
    key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
    risk_tier: "convenience",
    required_information: ["deterministic_attention_suggestion"],
    knowledge_categories: [],
    privacy_policy_key: ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY,
    validation_policy_key: ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION_POLICY_KEY,
    strategy_preference: ["deterministic"],
    trust_threshold: 0.5,
    review_requirement: "operator_review",
    learning_policy_key: "none_v1",
    economic_policy: { max_latency_ms: 5_000, max_escalation_level: 0 },
    requires_allowed_feature: "draft_enrichment",
};

/**
 * The provider-backed class (Phase 2.8 Gate C).
 *
 * Read it against the class above: every governance field is IDENTICAL — same
 * privacy policy, same validation policy, same risk tier, same review
 * requirement, same trust threshold, same allowed feature. Only the escalation
 * budget differs, and that is the whole of the difference between the two
 * classes. Provider-backed enrichment is not less governed; it is the same
 * decision, permitted to spend more to reach an answer.
 *
 * `max_escalation_level: 3` is `small_reasoning`'s index on the ladder, not a
 * round number: it admits exactly this strategy and refuses
 * `large_reasoning`(4) and `human_review`(5) outright, so a future strategy
 * registered against this class cannot quietly escalate past what was approved.
 *
 * `required_information` is unchanged, and that matters. The runtime checks it
 * against `resolvedInformation` BEFORE any governed input is consulted, so
 * declaring it here is what keeps "no suggestion supplied" a
 * `refused_insufficient_information` on both paths rather than degrading into a
 * different refusal on this one.
 */
const ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS: DecisionClassDefinitionV1 = {
    key: ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY,
    risk_tier: "convenience",
    required_information: ["deterministic_attention_suggestion"],
    knowledge_categories: [],
    privacy_policy_key: ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY,
    validation_policy_key: ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION_POLICY_KEY,
    strategy_preference: ["small_reasoning"],
    trust_threshold: 0.5,
    review_requirement: "operator_review",
    learning_policy_key: "none_v1",
    economic_policy: { max_latency_ms: PROVIDER_BACKED_DEADLINE_MS, max_escalation_level: 3 },
    requires_allowed_feature: "draft_enrichment",
};

const ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION: ValidationPolicyV1 = {
    key: ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION_POLICY_KEY,
    version: "1.0.0",
    callOuts: [
        {
            // The enrichment envelope's shape is owned by lib/ai, which authored
            // the operator-facing contract. Trust calls that owner's parser; it
            // does not restate the schema.
            owner: "lib/ai/attentionSuggestionAiEnrichmentSchema",
            validator_key: "safeParseAttentionSuggestionAiEnrichmentV1",
            invoke(recommendation) {
                const parsed = safeParseAttentionSuggestionAiEnrichmentV1(recommendation);
                return parsed
                    ? { passed: true, detail: "Recommendation satisfies AttentionSuggestionAiEnrichmentV1." }
                    : { passed: false, detail: "Recommendation does not satisfy AttentionSuggestionAiEnrichmentV1." };
            },
        },
    ],
};

/**
 * The registered provider-backed strategy.
 *
 * Constructed once, at declaration, with STABLE configuration only: a resolver
 * and a deadline. No credential, no endpoint, no request state — the resolver is
 * called per execution and reads only configuration.
 *
 * Registering it is safe in isolation because it satisfies ONLY the
 * provider-backed class, and nothing selects that class except a capability
 * that has affirmatively established `provider_backed` authorization (D-42).
 * Registration alone reaches no provider; it makes a class satisfiable that
 * nothing yet submits.
 */
const ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_STRATEGY = createProviderBackedAttentionEnrichmentStrategy({
    resolvePort: resolveGovernedReasoningProviderPort,
    deadline_ms: PROVIDER_BACKED_DEADLINE_MS,
});

export const ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION: TrustContribution = {
    id: "capability.attention_suggestion_enrichment",
    owner: "capability",
    decisionClasses: [
        ATTENTION_SUGGESTION_ENRICHMENT_CLASS,
        ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS,
    ],
    reasoningStrategies: [
        attentionSuggestionEnrichmentDeterministicStrategy,
        ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_STRATEGY,
    ],
    // ONE validation policy, referenced by BOTH classes. The registered policy
    // is the single authority on whether an enrichment result is acceptable,
    // whether a fixed rule or a model produced it — which is exactly why the
    // provider-backed strategy no longer validates its own answer.
    validationPolicies: [ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION],
};
