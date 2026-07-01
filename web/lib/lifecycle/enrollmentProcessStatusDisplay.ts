import {
    LIFECYCLE_STAGE_LABELS,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { effectiveEnrollmentOperatorStage } from "@/lib/lifecycle/enrollmentOperatorStage";

/** Operator-facing enrollment process stage label for a status row. */
export function enrollmentProcessStageDisplayLabel(
    statusKey: string,
    metadata: Record<string, unknown> | null | undefined
): string {
    const { stage } = effectiveEnrollmentOperatorStage(statusKey, metadata);
    return stage ? LIFECYCLE_STAGE_LABELS[stage] : "Unassigned";
}

export function enrollmentProcessStageSelectOptions(): { value: LifecycleOperatorStage | ""; label: string }[] {
    return [
        { value: "", label: "Unassigned" },
        ...Object.entries(LIFECYCLE_STAGE_LABELS).map(([value, label]) => ({
            value: value as LifecycleOperatorStage,
            label,
        })),
    ];
}
