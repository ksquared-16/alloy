import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import type { DrawerRuntimePhaseState } from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
import {
    drawerRuntimeTransitionTargetKey,
    isSameDrawerRuntimeTransitionTarget,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";

export type DrawerVmSwapTarget = {
    entityType: AdminDrawerState["type"];
    entityId: string;
};

/** Visible drawer record — unchanged during swap_preparing until VM payload is ready. */
export function resolveDrawerVmRenderDrawer(
    drawer: AdminDrawerState,
    phase: DrawerRuntimePhaseState
): AdminDrawerState {
    if (phase.phase === "swap_preparing") {
        return drawer;
    }
    return drawer;
}

export function resolvePendingDrawerVmSwapTarget(
    phase: DrawerRuntimePhaseState
): DrawerVmSwapTarget | null {
    if (phase.phase !== "swap_preparing" || !phase.target) return null;
    const entityType = phase.target.entityType;
    const entityId = phase.target.entityId.trim();
    if (!entityType || !entityId) return null;
    return { entityType, entityId };
}

export function canCommitDrawerVmSwap(params: {
    phase: DrawerRuntimePhaseState;
    pendingTarget: DrawerVmSwapTarget | null;
    hasPreload: boolean;
}): boolean {
    if (!params.hasPreload || !params.pendingTarget) return false;
    if (params.phase.phase !== "swap_preparing") return false;
    return isSameDrawerRuntimeTransitionTarget(params.phase.target, params.pendingTarget);
}

export function drawerVmSwapCommitKey(target: DrawerVmSwapTarget, hasPreload: boolean): string {
    return `${drawerRuntimeTransitionTargetKey(target) ?? "unknown"}:${hasPreload ? "ready" : "miss"}`;
}
