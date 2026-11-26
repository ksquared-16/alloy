/**
 * Trust Engine — evidence assembly.
 *
 * Assembles the evidence a trust evaluation requires and then applies the
 * semantics owned by Trust Governance. It does NOT own trust evaluation.
 *
 * @see docs/platform/trust/trust-runtime.md — Trust Engine
 */

import type { DecisionClassDefinitionV1, TrustReviewRequirement } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { ReasoningProposalV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import type { ReasoningContextV1 } from "@/lib/trust/privacy/privacyEngine";
import type { ValidationReport } from "@/lib/trust/validation/validationOrchestrator";
import type { TrustSemanticsV1, TrustVector } from "@/lib/trust/governance/trustGovernance";
import { TRUST_SEMANTICS_V1, scoreTrustVector } from "@/lib/trust/governance/trustGovernance";

export type TrustEvaluation = {
    readonly vector: TrustVector;
    readonly score: number;
    readonly semantics_version: string;
    readonly review_requirement: TrustReviewRequirement;
    readonly meets_class_threshold: boolean;
};

/**
 * Builds the Trust Vector from observed facts only.
 *
 * Every dimension is derived from something the runtime actually recorded —
 * never from the strategy's own confidence, which is a separate concept.
 */
export function assembleTrustEvidence(input: {
    decisionClass: DecisionClassDefinitionV1;
    context: ReasoningContextV1;
    proposal: ReasoningProposalV1;
    validation: ValidationReport;
    strategyKind: string;
    semantics?: TrustSemanticsV1;
}): TrustEvaluation {
    const semantics = input.semantics ?? TRUST_SEMANTICS_V1;

    // Grounding: did the proposal cite authoritative truth?
    const grounded = input.proposal.evidence.some(
        (e) => e.kind === "authoritative_record" || e.kind === "knowledge_asset",
    );

    // Privacy: reasoning saw a transformed context, and no prohibited class
    // reached it (a prohibited class refuses before this point).
    const minimized = input.context.redaction_steps.length > 0 || input.context.pii_mode === "strict";

    // Evidence: is the recommendation explainable at all?
    const explainable = input.proposal.evidence.length > 0 && input.proposal.explanation.trim().length > 0;

    // Reliability: a deterministic strategy is repeatable by construction.
    const deterministic = input.strategyKind === "deterministic";

    const vector: TrustVector = {
        grounding: grounded ? 1 : 0,
        privacy: minimized ? 1 : 0,
        evidence: explainable ? 1 : 0,
        validation: input.validation.passed ? 1 : 0,
        reliability: deterministic ? 1 : 0.5,
        // Oversight is a positive dimension: a class that requires human review
        // is SAFER, not less trustworthy.
        human_oversight: input.decisionClass.review_requirement === "automatic" ? 0.5 : 1,
    };

    const score = scoreTrustVector(vector, semantics);

    return {
        vector,
        score,
        semantics_version: semantics.version,
        review_requirement: input.decisionClass.review_requirement,
        meets_class_threshold: score >= input.decisionClass.trust_threshold,
    };
}
