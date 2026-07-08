import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

import { resolveStageWorkOutcomeCompletionState } from "./resolveStageWorkOutcomeCompletionState";

/** Right-rail keys that compete with Current Work primary completion / checklist handoffs. */
const RAIL_OPERATIONAL_DUPLICATE_KEYS = new Set([
    "quick_message",
    "send_message_placeholder",
    "close_lead",
    "update_lead_status",
    "complete_stage_contact_attempts",
    "contact_attempted",
]);

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

    return actions.filter((action) => !RAIL_OPERATIONAL_DUPLICATE_KEYS.has(action.key.trim()));
}
