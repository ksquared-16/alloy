/**
 * Patch a resolved stage-work slice (Tier-2) into an opportunity drawer VM in place — pure, so the
 * client runtime and tests share one merge. Sets the Current Work fields + `stage_work` load state.
 * Task summary stays unfiltered so Activity → Work Items keeps stage-work (Contact Family) visible
 * with the same operational_tasks identity as global Work Items.
 * Card order, geometry, and every other region are untouched — only the Current Work region changes.
 */

import type { OpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import type { OpportunityDrawerViewModel, StageWorkLoadState } from "@/lib/adminV2/viewModel/drawer/types";

export function stageWorkStateFromSlice(slice: OpportunityStageWorkSlice): StageWorkLoadState {
    return slice.stage_work_runtime
        ? { status: "ready", value: slice.stage_work_runtime }
        : { status: "empty" };
}

export function applyStageWorkSliceToVm(
    vm: OpportunityDrawerViewModel,
    slice: OpportunityStageWorkSlice,
): OpportunityDrawerViewModel {
    const tasks = vm.summaries.tasks;
    const record = { ...vm.above_fold.record };
    record._stage_work_runtime = slice.stage_work_runtime;
    record._work_intent_runtime = slice.work_intent_runtime;
    record._inquiry_summary_tasks = tasks;

    return {
        ...vm,
        workspace: {
            ...vm.workspace,
            stage_work_runtime: slice.stage_work_runtime,
            published_stage_inputs: slice.published_stage_inputs,
            work_intent_runtime: slice.work_intent_runtime,
            stage_work: stageWorkStateFromSlice(slice),
        },
        summaries: { ...vm.summaries, tasks },
        above_fold: { ...vm.above_fold, record },
    };
}

/** Mark stage work failed while retaining any prior resolved runtime (never blanks Current Work). */
export function markStageWorkErrorOnVm(
    vm: OpportunityDrawerViewModel,
): OpportunityDrawerViewModel {
    const retained = vm.workspace.stage_work_runtime ?? undefined;
    return {
        ...vm,
        workspace: {
            ...vm.workspace,
            stage_work: retained ? { status: "error", retained } : { status: "error" },
        },
    };
}
