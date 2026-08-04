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
import {
    ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
    ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION_POLICY_KEY,
    ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY,
} from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { attentionSuggestionEnrichmentDeterministicStrategy } from "@/lib/trust/reasoning/strategies/attentionSuggestionEnrichmentDeterministic";
import type { TrustContribution } from "@/lib/trust/registry/trustRegistryTypes";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

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

export const ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION: TrustContribution = {
    id: "capability.attention_suggestion_enrichment",
    owner: "capability",
    decisionClasses: [ATTENTION_SUGGESTION_ENRICHMENT_CLASS],
    reasoningStrategies: [attentionSuggestionEnrichmentDeterministicStrategy],
    validationPolicies: [ATTENTION_SUGGESTION_ENRICHMENT_VALIDATION],
};
