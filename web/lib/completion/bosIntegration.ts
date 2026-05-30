/**
 * BOS integration point for Completion Guardrails Foundation (Sprint B).
 *
 * Sprint B is infrastructure + bootstrap rules — not admin-configured required-field policy.
 * Do not add broad hard_block rules without product review (see policy doc).
 *
 * Consumption pattern:
 * 1. Call `evaluateCompletionRequirements` or `evaluateCompletionRequirementsFromRecord`
 * 2. Pass result to `toBosCompletionRequirementPayload` for operator copy
 * 3. Use `result.blocking` for hard transition denial; warnings/recommendations for assist only
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
