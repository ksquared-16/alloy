/**
 * BOS integration point for completion guardrails (Sprint B).
 *
 * Consumption pattern:
 * 1. Call `evaluateCompletionRequirements` or `evaluateCompletionRequirementsFromRecord`
 * 2. Pass result to `toBosCompletionRequirementPayload` for operator copy
 * 3. Use `result.blocking` for hard transition denial; warnings/recommendations for assist only
 *
 * Full BOS intelligence is deferred — this module exposes structured truth only.
 */

export {
    evaluateCompletionRequirements,
    evaluateCompletionRequirementsFromRecord,
    formatRequirementValidationSummary,
} from "@/lib/completion/evaluateCompletionRequirements";

export {
    toBosCompletionRequirementPayload,
    validateStatusTransitionStructured,
    type BosCompletionRequirementPayload,
} from "@/lib/completion/enforcePersonCompletionOnPatch";

export type {
    RequirementValidationResult,
    RequirementViolation,
    CompletionEvaluationPhase,
} from "@/lib/completion/requirementValidationTypes";
