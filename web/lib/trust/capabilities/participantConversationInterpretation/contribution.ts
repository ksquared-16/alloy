/**
 * Capability contribution — participant conversation interpretation (V1.1).
 *
 * Registers ONE provider-backed Decision Class, its strategy and its validation policy. It does not
 * register a privacy policy: those are platform-owned and referenced by key
 * (`privacy-runtime.md` §Privacy Policies). The policy referenced here is the D-101/D-102 one.
 *
 * There is deliberately no deterministic sibling class. The deterministic interpreter already exists
 * inside Participant Runtime and never leaves the process, so it needs no governed class, no privacy
 * transform and no Decision Package. Giving it one would imply an egress surface it does not have.
 *
 * This module declares. It does not compose, and importing it registers nothing.
 */

import { safeParseParticipantInterpretation } from "@/lib/ai/participantInterpretationSchema";
import { resolveGovernedReasoningProviderPort } from "@/lib/ai/trust/governedReasoningProviderPort";
import {
    PARTICIPANT_CONVERSATION_ADMISSION_POLICY_KEY,
    PARTICIPANT_CONVERSATION_INTERPRETATION_INFORMATION_KEY,
    PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY,
    PARTICIPANT_CONVERSATION_INTERPRETATION_VALIDATION_POLICY_KEY,
} from "@/lib/trust/capabilities/participantConversationInterpretation/keys";
import { createParticipantInterpretationStrategy } from "@/lib/trust/capabilities/participantConversationInterpretation/providerBackedStrategy";
import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { TrustContribution } from "@/lib/trust/registry/trustRegistryTypes";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

/**
 * A participant is waiting on this turn, so the wall is short.
 *
 * Trust enforces the deadline itself and quarantines a late adapter, so an overrunning provider
 * cannot hold the participant's request open — it simply loses, and the deterministic interpreter
 * answers instead.
 */
const PARTICIPANT_INTERPRETATION_DEADLINE_MS = 8_000;

const PARTICIPANT_CONVERSATION_INTERPRETATION_CLASS: DecisionClassDefinitionV1 = {
    key: PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY,
    /**
     * `fallback`, not `mandatory`. Interpretation is ADVISORY: it changes how a participant's words
     * are read, never what is required of them, and the deterministic interpreter answers whenever
     * this does not. A mandatory tier would claim Enrollment depends on it, which is precisely the
     * dependency the fallback exists to prevent.
     */
    risk_tier: "fallback",
    required_information: [PARTICIPANT_CONVERSATION_INTERPRETATION_INFORMATION_KEY],
    knowledge_categories: [],
    privacy_policy_key: PARTICIPANT_CONVERSATION_ADMISSION_POLICY_KEY,
    validation_policy_key: PARTICIPANT_CONVERSATION_INTERPRETATION_VALIDATION_POLICY_KEY,
    strategy_preference: ["small_reasoning"],
    /**
     * Zero. An interpretation carries no calibrated probability — the strategy reports `confidence:
     * null` rather than invent one — so a threshold here would gate on a number that means nothing.
     * What actually gates the result is Participant Runtime's own validation, downstream.
     */
    trust_threshold: 0,
    /**
     * `automatic` — no human review. This is a participant-facing reading of a participant's own sentence, and
     * its consequence is bounded: a candidate that survives goes to deterministic validation, and a
     * wrong one is refused there or corrected by the participant on the next turn. Queuing an
     * operator for every conversational turn would make the runtime unusable and would imply the
     * interpretation has authority it does not have.
     */
    review_requirement: "automatic",
    learning_policy_key: "none_v1",
    economic_policy: { max_latency_ms: PARTICIPANT_INTERPRETATION_DEADLINE_MS, max_escalation_level: 1 },
    /**
     * Provider participation is gated by the platform's AI feature policy, like every other class
     * that leaves the process. An org without it keeps the deterministic path and loses nothing it
     * needs to enrol.
     */
    requires_allowed_feature: "participant_conversation_interpretation",
};

const PARTICIPANT_CONVERSATION_INTERPRETATION_VALIDATION: ValidationPolicyV1 = {
    key: PARTICIPANT_CONVERSATION_INTERPRETATION_VALIDATION_POLICY_KEY,
    version: "1.0.0",
    callOuts: [
        {
            /**
             * ENVELOPE ONLY, and the boundary is the point.
             *
             * This asks "is this a structurally valid interpretation result?" — the contract owner's
             * question. It does NOT ask whether the value suits the current need; that is Participant
             * Runtime's `disposeParticipantCandidate`, against the authored control's type.
             *
             * So a provider returning `corrected_value: "banana"` for a date PASSES here and is
             * REFUSED downstream, and those two answers stay in two places on purpose. Collapsing
             * them would put domain validation inside the provider contract, where a future edit
             * could weaken it without touching anything that looks like a validator.
             */
            owner: "lib/ai/participantInterpretationSchema",
            validator_key: "safeParseParticipantInterpretation",
            invoke(recommendation) {
                const parsed = safeParseParticipantInterpretation(recommendation);
                return parsed.ok
                    ? { passed: true, detail: "Recommendation satisfies the participant interpretation contract." }
                    : { passed: false, detail: parsed.detail };
            },
        },
    ],
};

const PARTICIPANT_CONVERSATION_INTERPRETATION_STRATEGY = createParticipantInterpretationStrategy({
    resolvePort: resolveGovernedReasoningProviderPort,
    deadline_ms: PARTICIPANT_INTERPRETATION_DEADLINE_MS,
});

export const PARTICIPANT_CONVERSATION_INTERPRETATION_CONTRIBUTION: TrustContribution = {
    id: "capability.participant_conversation_interpretation",
    owner: "capability",
    decisionClasses: [PARTICIPANT_CONVERSATION_INTERPRETATION_CLASS],
    reasoningStrategies: [PARTICIPANT_CONVERSATION_INTERPRETATION_STRATEGY],
    validationPolicies: [PARTICIPANT_CONVERSATION_INTERPRETATION_VALIDATION],
};
