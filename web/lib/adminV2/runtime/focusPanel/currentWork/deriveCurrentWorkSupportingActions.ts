import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";

import { classifyRecordHeaderActionsForCurrentWork } from "./classifyCurrentWorkActions";

/**
 * Registry-backed supporting actions for Current Work Focus.
 * Uses record_header primary/secondary/header slots — not Manage overflow.
 */
export function deriveCurrentWorkSupportingActions(args: {
    recordHeaderSlots: ResolvedActionsBySlot | null | undefined;
    showOutcomeCompletion: boolean;
    primaryActionLabel: string | null;
}): ResolvedActionForClient[] {
    const classified = classifyRecordHeaderActionsForCurrentWork(args);
    return classified.supporting
        .map((action) => action.resolved)
        .filter((action): action is ResolvedActionForClient => action != null);
}
