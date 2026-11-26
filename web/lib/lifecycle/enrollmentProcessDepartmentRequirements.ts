/**
 * Enrollment stage requirements for a department.
 *
 * Delegation to the one effective resolver (D-92). Before Phase 1 each helper called a
 * different legacy resolver directly, so the enrollment surfaces read
 * `lifecycle_progression_requirements_v1` and `lifecycle_builder_stage_field_rules_v1`
 * on their own terms. They now share one precedence rule: canonical business-process
 * requirements first, legacy compatibility projection only where a stage has never been
 * authored canonically.
 *
 * The exported signatures and return shapes are deliberately unchanged — both callers
 * destructure them — so this slice changes WHICH AUTHORITY answers, not what a consumer
 * has to handle.
 *
 * @see lib/lifecycle/effectiveStageRequirements.ts
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleRequirementsSource } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { resolveEffectiveStageRequirementsForDepartment } from "@/lib/lifecycle/effectiveStageRequirements";

export function effectiveRequirementLabelsForDepartment(
    stage: LifecycleOperatorStage,
    departmentMetadata: Record<string, unknown> | null | undefined
): { required_labels: string[]; recommended_labels: string[] } {
    const effective = resolveEffectiveStageRequirementsForDepartment(stage, departmentMetadata);
    return {
        required_labels: effective.legacy.required.map((r) => r.label),
        recommended_labels: effective.legacy.recommended.map((r) => r.label),
    };
}

export function effectiveFieldRulesForDepartment(
    stage: LifecycleOperatorStage,
    departmentMetadata: Record<string, unknown> | null | undefined
): { rules: LifecycleStageFieldRules; source: LifecycleRequirementsSource } {
    const effective = resolveEffectiveStageRequirementsForDepartment(stage, departmentMetadata);
    return {
        rules: effective.legacy.rules,
        // The canonical source is reported as `department`: to a caller asking "is this
        // tenant-configured or platform default?", a business-process requirement is
        // tenant configuration. Widening this union is a separate, visible change.
        source: effective.source === "platform" ? "platform" : "department",
    };
}
