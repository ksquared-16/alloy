/**
 * Capability contribution — processing source classification.
 *
 * The first capability adopted by the Trust Platform (Phase 1.1). It registers
 * a Decision Class, a deterministic Reasoning Strategy and a Validation Policy.
 * It does **not** register a privacy policy — those are platform-owned and
 * referenced by key (`privacy-runtime.md` §Privacy Policies).
 *
 * The validation policy calls out to the OWNER of the classification contract,
 * exactly as Trust Runtime V1's policy calls out to `lib/ai` for the enrichment
 * envelope. Trust does not restate classification vocabulary, and this module
 * contains no keyword, weight or rule.
 *
 * This module declares. It does not compose, and importing it registers nothing.
 *
 * @see docs/platform/trust/trust-runtime.md — Extension Points
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import { safeParseGovernedSourceClassificationV1 } from "@/lib/pos/processingCase/classification/governedClassificationSchema";
import {
    PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
    PROCESSING_SOURCE_CLASSIFICATION_INFORMATION_KEY,
    PROCESSING_SOURCE_CLASSIFICATION_VALIDATION_POLICY_KEY,
    PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY,
} from "@/lib/trust/capabilities/processingSourceClassification/keys";
import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { processingSourceClassificationDeterministicStrategy } from "@/lib/trust/reasoning/strategies/processingSourceClassificationDeterministic";
import type { TrustContribution } from "@/lib/trust/registry/trustRegistryTypes";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

const PROCESSING_SOURCE_CLASSIFICATION_CLASS: DecisionClassDefinitionV1 = {
    key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
    /**
     * `convenience`, not `mandatory`: the classification annotates a case for
     * operator orientation. It gates no commit, blocks no record and authorises
     * nothing. Identity resolution is the mandatory-tier class, and it is a
     * later slice.
     */
    risk_tier: "convenience",
    required_information: [PROCESSING_SOURCE_CLASSIFICATION_INFORMATION_KEY],
    knowledge_categories: [],
    privacy_policy_key: PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY,
    validation_policy_key: PROCESSING_SOURCE_CLASSIFICATION_VALIDATION_POLICY_KEY,
    strategy_preference: ["deterministic"],
    /**
     * The classifier's confidence is a bounded weight sum in `[0, 0.95]`, not a
     * calibrated probability, so it cannot carry a governance threshold. Review
     * is carried by `review_requirement` instead, which is deterministic.
     */
    trust_threshold: 0,
    review_requirement: "operator_review",
    learning_policy_key: "none_v1",
    /** Escalation 0 only. A deterministic adapter over an in-memory result. */
    economic_policy: { max_latency_ms: 2_000, max_escalation_level: 0 },
    /**
     * No AI feature gate applies: nothing here reasons probabilistically, calls
     * a provider or leaves the process. Gating a deterministic annotation behind
     * an AI policy flag would misrepresent what it does.
     */
    requires_allowed_feature: null,
};

const PROCESSING_SOURCE_CLASSIFICATION_VALIDATION: ValidationPolicyV1 = {
    key: PROCESSING_SOURCE_CLASSIFICATION_VALIDATION_POLICY_KEY,
    version: "1.0.0",
    callOuts: [
        {
            // The governed classification's shape and its confidence contract are
            // owned by Processing, which authored the classifier. Trust calls that
            // owner's parser; it does not restate the schema or the range.
            owner: "lib/pos/processingCase/classification/governedClassificationSchema",
            validator_key: "safeParseGovernedSourceClassificationV1",
            invoke(recommendation) {
                const parsed = safeParseGovernedSourceClassificationV1(recommendation);
                return parsed
                    ? { passed: true, detail: "Recommendation satisfies GovernedSourceClassificationV1." }
                    : {
                          passed: false,
                          detail:
                              "Recommendation does not satisfy GovernedSourceClassificationV1 — shape, status or confidence is outside the classifier's contract.",
                      };
            },
        },
    ],
};

export const PROCESSING_SOURCE_CLASSIFICATION_CONTRIBUTION: TrustContribution = {
    id: "capability.processing_source_classification",
    owner: "capability",
    decisionClasses: [PROCESSING_SOURCE_CLASSIFICATION_CLASS],
    reasoningStrategies: [processingSourceClassificationDeterministicStrategy],
    validationPolicies: [PROCESSING_SOURCE_CLASSIFICATION_VALIDATION],
};
