/**
 * Route-level reveal policy — composer-owned page/queue behavior (not per-section).
 */

export type { WorkUnitPageRevealInput } from "@/lib/adminV2/workUnitPageRevealPolicy";
export {
    workUnitKpiStripShowsPlaceholder,
    workUnitPageContentReady,
    workUnitPageShowsLoadingGate,
} from "@/lib/adminV2/workUnitPageRevealPolicy";

export type { WorkUnitQueueLaneRevealState } from "@/lib/workspace/workUnitQueueLaneRevealState";
export {
    resolveWorkUnitQueueLaneRevealState,
    workUnitQueueLaneMayPaintRows,
    workUnitQueueLaneRevealSettled,
} from "@/lib/workspace/workUnitQueueLaneRevealState";

import type { AdminV2QueueLaneRevealState } from "@/lib/adminV2/runtime/contract/types";
import { workUnitQueueLaneRevealSettled } from "@/lib/workspace/workUnitQueueLaneRevealState";

export type AdminV2RouteRevealMode = "full_page_gate" | "composed_page";

export type AdminV2QueueLaneDisplayDecision = {
    mode: "hold" | "rows" | "empty" | "error";
    revealState: AdminV2QueueLaneRevealState;
};

/** Queue lanes never paint row skeleton as the visible settled state. */
export function adminV2QueueLaneDisplayDecision(
    revealState: AdminV2QueueLaneRevealState
): AdminV2QueueLaneDisplayDecision {
    if (revealState === "ready_error") {
        return { mode: "error", revealState };
    }
    if (revealState === "ready_empty") {
        return { mode: "empty", revealState };
    }
    if (revealState === "ready_with_rows" || revealState === "ready_with_cache") {
        return { mode: "rows", revealState };
    }
    return { mode: "hold", revealState };
}

export function adminV2QueueMustHoldLane(revealState: AdminV2QueueLaneRevealState): boolean {
    return !workUnitQueueLaneRevealSettled(revealState);
}

export function adminV2QueueMayShowRowSkeleton(revealState: AdminV2QueueLaneRevealState): boolean {
    return false;
}

export type AdminV2WorkUnitRouteRevealInput = {
    shell_ready: boolean;
    initial_lane_reveal_settled: boolean;
    lane_reveal_state: AdminV2QueueLaneRevealState;
};

export function adminV2WorkUnitRouteRevealMode(input: AdminV2WorkUnitRouteRevealInput): AdminV2RouteRevealMode {
    const laneSettled = workUnitQueueLaneRevealSettled(input.lane_reveal_state);
    if (!input.shell_ready) return "full_page_gate";
    if (!input.initial_lane_reveal_settled && !laneSettled) return "full_page_gate";
    return "composed_page";
}
