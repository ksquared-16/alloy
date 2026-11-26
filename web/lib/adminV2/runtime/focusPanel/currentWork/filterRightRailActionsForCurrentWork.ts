import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

import { actionCompetesWithCurrentWorkOnRail } from "./currentWorkActionSurfacePolicy";
import { resolveStageWorkOutcomeCompletionState } from "./resolveStageWorkOutcomeCompletionState";

/**
 * When Current Work owns primary completion, demote competing operational actions
 * from the work-unit right rail. Admin / assist actions (schedule tour, add child) remain.
 */
export function filterRightRailActionsForCurrentWork(
    actions: ResolvedActionForClient[],
    args: {
        stageWorkRuntime: StageWorkRuntimeProjection | null | undefined;
        canMutate: boolean;
    },
): ResolvedActionForClient[] {
    const { ownsPrimaryCompletion } = resolveStageWorkOutcomeCompletionState({
        stageWorkRuntime: args.stageWorkRuntime,
        canMutate: args.canMutate,
    });
    if (!ownsPrimaryCompletion) return actions;

    return actions.filter((action) => !actionCompetesWithCurrentWorkOnRail(action.key.trim()));
}
