import type { CompletionEvaluationPhase } from "@/lib/completion/requirementValidationTypes";
import type { EffectiveRequirementTrigger } from "@/lib/completion/effectiveRequirementsTypes";

export function effectiveTriggerToCompletionPhase(
    trigger: EffectiveRequirementTrigger
): CompletionEvaluationPhase {
    switch (trigger) {
        case "layout_save":
            return "save";
        case "action_execute":
            return "action";
        case "status_transition":
            return "status_change";
        case "bos_scan":
            return "preview";
        default:
            return "preview";
    }
}
