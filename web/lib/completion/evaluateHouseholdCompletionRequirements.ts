import {
    buildRequirementValidationResult,
    makeRequirementViolation,
} from "@/lib/completion/requirementValidationResult";
import type {
    CompletionEvaluationContext,
    RequirementValidationResult,
} from "@/lib/completion/requirementValidationTypes";
import { trimOrNull } from "@/lib/completion/valueEmpty";

/**
 * Household-scoped rules (primary contact per customer/household).
 */
export function evaluateHouseholdCompletionRequirements(
    ctx: CompletionEvaluationContext
): RequirementValidationResult {
    const customerId = trimOrNull(ctx.related?.customer_id);
    if (!customerId) return buildRequirementValidationResult([]);

    const guardianCount = ctx.related?.household_guardian_count ?? 0;
    const hasPrimary = ctx.related?.household_has_primary_contact === true;

    if (guardianCount > 0 && !hasPrimary) {
        return buildRequirementValidationResult([
            makeRequirementViolation({
                entity_type: "customer",
                entity_id: customerId,
                label: "Primary contact",
                requirement_type: "always_required",
                blocking_level: ctx.phase === "preview" ? "soft_warning" : "hard_block",
                missing_reason: "Household must have one primary contact designated.",
                context: {
                    surface: ctx.surface,
                    status_to: trimOrNull(ctx.status_to) ?? undefined,
                },
            }),
        ]);
    }

    return buildRequirementValidationResult([]);
}
