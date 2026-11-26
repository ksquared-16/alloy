import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { completionOutcomesForPicker } from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import { CURRENT_WORK_RECORD_OUTCOME_CTA } from "./currentWorkCopy";

function pickPrimaryOpenItem(runtime: StageWorkRuntimeProjection | null): StageWorkItemProjection | null {
    if (!runtime) return null;
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    return items.find((item) => item.state === "open") ?? items.find((item) => item.state === "planned") ?? null;
}

function findOpenItemForTemplate(
    runtime: StageWorkRuntimeProjection | null,
    templateKey: string,
): StageWorkItemProjection | null {
    if (!runtime) return null;
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    return items.find((item) => item.template_key === templateKey && item.state === "open") ?? null;
}

function resolveActionableWorkItem(
    runtime: StageWorkRuntimeProjection | null,
    primaryWorkItem: StageWorkItemProjection | null,
): StageWorkItemProjection | null {
    if (!primaryWorkItem) return null;
    if (primaryWorkItem.state === "open") return primaryWorkItem;
    return findOpenItemForTemplate(runtime, primaryWorkItem.template_key);
}

/** Shared gate — Current Work owns primary completion when this is true. */
export function resolveStageWorkOutcomeCompletionState(args: {
    stageWorkRuntime: StageWorkRuntimeProjection | null | undefined;
    canMutate: boolean;
}): {
    ownsPrimaryCompletion: boolean;
    actionableWorkItem: StageWorkItemProjection | null;
    primaryActionLabel: string | null;
} {
    const runtime = args.stageWorkRuntime ?? null;
    const primaryWorkItem = pickPrimaryOpenItem(runtime);
    const actionableWorkItem = resolveActionableWorkItem(runtime, primaryWorkItem);
    const pickerOutcomes =
        actionableWorkItem ? completionOutcomesForPicker(actionableWorkItem) : [];

    const ownsPrimaryCompletion = Boolean(
        actionableWorkItem
        && actionableWorkItem.state === "open"
        && actionableWorkItem.requires_outcome_picker
        && pickerOutcomes.length > 0
        && args.canMutate,
    );

    let primaryActionLabel: string | null = null;
    if (actionableWorkItem?.state === "open" && pickerOutcomes.length > 0 && actionableWorkItem.requires_outcome_picker) {
        primaryActionLabel = CURRENT_WORK_RECORD_OUTCOME_CTA;
    }

    return { ownsPrimaryCompletion, actionableWorkItem, primaryActionLabel };
}
