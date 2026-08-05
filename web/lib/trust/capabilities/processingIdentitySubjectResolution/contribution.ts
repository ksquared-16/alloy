/**
 * Capability contribution — processing identity subject resolution.
 *
 * Registers a Decision Class, a deterministic Reasoning Strategy and a
 * Validation Policy. It does **not** register a privacy policy — those are
 * platform-owned and referenced by key.
 *
 * **Dormant.** Registering a class makes it *available*; nothing in production
 * submits a contract for it. A structural test asserts no production module
 * imports the dry-run path.
 *
 * The validation policy calls out to the OWNER of the identity contract, exactly
 * as Phase 1.1's policy calls out to Processing for the classification envelope.
 * Trust does not restate identity vocabulary, and this module contains no
 * matching rule, weight or band logic.
 *
 * @see docs/platform/trust/trust-runtime.md — Extension Points
 */

import { safeParseGovernedIdentitySubjectRecommendationV1 } from "@/lib/pos/processingIdentity/trustAdapter/governedIdentitySchema";
import {
    PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_INFORMATION_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION_POLICY_KEY,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { processingIdentitySubjectResolutionDeterministicStrategy } from "@/lib/trust/reasoning/strategies/processingIdentitySubjectResolutionDeterministic";
import type { TrustContribution } from "@/lib/trust/registry/trustRegistryTypes";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS: DecisionClassDefinitionV1 = {
    key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    /**
     * `mandatory`: identity resolution is the highest-consequence proposal in
     * the platform. It gates nothing here — the class is dormant — but the tier
     * must describe the decision, not its current wiring.
     */
    risk_tier: "mandatory",
    required_information: [PROCESSING_IDENTITY_SUBJECT_RESOLUTION_INFORMATION_KEY],
    knowledge_categories: [],
    privacy_policy_key: PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY,
    validation_policy_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION_POLICY_KEY,
    strategy_preference: ["deterministic"],
    /**
     * A COMPATIBILITY SENTINEL, not a calibrated threshold.
     *
     * `trust_threshold` is compared against the Trust VECTOR score in
     * `assembleTrustEvidence` — never against the strategy's confidence, which
     * that module's own comment calls "a separate concept". The comparison
     * result, `meets_class_threshold`, has **zero consumers**: it reaches no
     * package field, no route and no metric.
     *
     * So `0` cannot mark a null-confidence decision "automatically trusted"; it
     * is inert. Certified by test, not asserted here.
     */
    trust_threshold: 0,
    /**
     * The class default, and the strictest value available. A per-result
     * refinement travels inside the recommendation and can only tighten this —
     * see `resolveEffectiveReviewRequirement`.
     */
    review_requirement: "operator_review",
    learning_policy_key: "none_v1",
    /** Escalation 0 only: a deterministic adapter over an in-memory judgment. */
    economic_policy: { max_latency_ms: 5_000, max_escalation_level: 0 },
    /**
     * No AI feature gate applies. Nothing here reasons probabilistically, calls
     * a provider or leaves the process.
     */
    requires_allowed_feature: null,
};

const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION: ValidationPolicyV1 = {
    key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION_POLICY_KEY,
    version: "1.0.0",
    callOuts: [
        {
            // The governed identity contract — its closed shape, its category
            // vocabularies, its PII patterns and its exclusion of case-level
            // readiness gates — is owned by Processing, which authored the
            // engine. Trust calls that owner's parser.
            owner: "lib/pos/processingIdentity/trustAdapter/governedIdentitySchema",
            validator_key: "safeParseGovernedIdentitySubjectRecommendationV1",
            invoke(recommendation) {
                const parsed = safeParseGovernedIdentitySubjectRecommendationV1(recommendation);
                return parsed
                    ? { passed: true, detail: "Recommendation satisfies GovernedIdentitySubjectRecommendationV1." }
                    : {
                          passed: false,
                          detail:
                              "Recommendation does not satisfy GovernedIdentitySubjectRecommendationV1 — shape, vocabulary, case-level readiness, explanation provenance or PII screening rejected it.",
                      };
            },
        },
    ],
};

export const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION: TrustContribution = {
    id: "capability.processing_identity_subject_resolution",
    owner: "capability",
    decisionClasses: [PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS],
    reasoningStrategies: [processingIdentitySubjectResolutionDeterministicStrategy],
    validationPolicies: [PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION],
};
