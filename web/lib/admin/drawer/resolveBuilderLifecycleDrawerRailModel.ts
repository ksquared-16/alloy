import type {
    RecordLifecycleRailModel,
    RecordLifecycleRailStep,
    RecordLifecycleRailStepState,
} from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";

export type BuilderLifecycleRailStage = {
    key: string;
    label: string;
};

function stepState(index: number, currentIndex: number): RecordLifecycleRailStepState {
    if (currentIndex < 0) return "unknown";
    if (index < currentIndex) return "complete";
    if (index === currentIndex) return "current";
    return "future";
}

/**
 * Lifecycle rail from /settings/lifecycle builder stage order (same order as dept work-unit pills).
 */
export function resolveBuilderLifecycleDrawerRailModel(input: {
    stages: readonly BuilderLifecycleRailStage[];
    currentStageKey: string | null | undefined;
}): RecordLifecycleRailModel | null {
    const stages = input.stages
        .map((s) => ({
            key: String(s.key ?? "").trim(),
            label: String(s.label ?? "").trim() || String(s.key ?? "").trim(),
        }))
        .filter((s) => s.key);
    if (stages.length < 2) return null;

    const currentKey = input.currentStageKey?.trim() ?? "";
    const currentIndex = currentKey ? stages.findIndex((s) => s.key === currentKey) : -1;

    const steps: RecordLifecycleRailStep[] = stages.map((stage, index) => ({
        key: stage.key,
        label: stage.label,
        state: stepState(index, currentIndex),
    }));

    return { steps, currentIndex };
}
