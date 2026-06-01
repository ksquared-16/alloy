import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { effectiveLifecycleProgressionRequirementsForStage } from "@/lib/completion/lifecycleProgressionRequirementsConfig";

export function effectiveRequirementLabelsForDepartment(
    stage: LifecycleOperatorStage,
    departmentMetadata: Record<string, unknown> | null | undefined
): { required_labels: string[]; recommended_labels: string[] } {
    const effective = effectiveLifecycleProgressionRequirementsForStage(stage, departmentMetadata ?? null);
    return {
        required_labels: effective.required.map((r) => r.label),
        recommended_labels: effective.recommended.map((r) => r.label),
    };
}
