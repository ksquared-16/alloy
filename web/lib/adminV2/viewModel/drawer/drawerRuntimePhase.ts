import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

/** Authoritative drawer shell runtime phase (AdminDrawerContext + AdminEntityDrawer). */
export type DrawerRuntimePhase =
    | "idle"
    | "showing"
    | "opening_cold"
    | "swap_preparing"
    | "applying_vm"
    | "error";

export type DrawerRuntimeTransitionTarget = {
    entityType: AdminDrawerEntityType;
    entityId: string;
};

export type DrawerRuntimePhaseState = {
    phase: DrawerRuntimePhase;
    /** Monotonic per swap transition; resets when returning to showing/idle. */
    transitionId: number;
    target: DrawerRuntimeTransitionTarget | null;
    errorMessage: string | null;
    /**
     * When true, AdminEntityDrawer must run entity-open hydrate for target
     * (VM preload missed during swap).
     */
    swapFallbackFetch: boolean;
};

export const INITIAL_DRAWER_RUNTIME_PHASE_STATE: DrawerRuntimePhaseState = {
    phase: "idle",
    transitionId: 0,
    target: null,
    errorMessage: null,
    swapFallbackFetch: false,
};

export function isDrawerTransitionPhase(phase: DrawerRuntimePhase): boolean {
    return phase === "swap_preparing" || phase === "applying_vm";
}

/** Hold prior record visible — no full-body loader, no data clear. */
export function shouldHoldPriorDrawerContent(phase: DrawerRuntimePhase): boolean {
    return phase === "swap_preparing" || phase === "applying_vm";
}

/** Full-drawer loading shell forbidden during shell-pinned model swap. */
export function shouldSuppressFullDrawerLoading(phase: DrawerRuntimePhase): boolean {
    return shouldHoldPriorDrawerContent(phase);
}

/**
 * Cold-open loading allowed only when there is no visible drawer content yet
 * and we are not in an in-drawer swap transition.
 */
export function shouldAllowColdOpenLoading(params: {
    phase: DrawerRuntimePhase;
    hasVisibleDrawerContent: boolean;
}): boolean {
    if (shouldHoldPriorDrawerContent(params.phase)) return false;
    if (params.phase === "opening_cold") return !params.hasVisibleDrawerContent;
    if (params.phase === "idle") return !params.hasVisibleDrawerContent;
    return false;
}

/** Body may render stale `data` while target VM is preparing (id mismatch tolerated). */
export function shouldRenderHeldDrawerBody(params: {
    phase: DrawerRuntimePhase;
    dataMatchesDrawer: boolean;
    hasData: boolean;
}): boolean {
    if (params.dataMatchesDrawer) return true;
    return shouldHoldPriorDrawerContent(params.phase) && params.hasData;
}

export function drawerRuntimePhaseForSwapStart(
    prev: DrawerRuntimePhaseState,
    target: DrawerRuntimeTransitionTarget
): DrawerRuntimePhaseState {
    return {
        phase: "swap_preparing",
        transitionId: prev.transitionId + 1,
        target,
        errorMessage: null,
        swapFallbackFetch: false,
    };
}

export function drawerRuntimePhaseForApplyingVm(
    prev: DrawerRuntimePhaseState
): DrawerRuntimePhaseState {
    return {
        ...prev,
        phase: "applying_vm",
        errorMessage: null,
    };
}

export function drawerRuntimePhaseForShowing(
    prev: DrawerRuntimePhaseState
): DrawerRuntimePhaseState {
    return {
        phase: "showing",
        transitionId: prev.transitionId,
        target: null,
        errorMessage: null,
        swapFallbackFetch: false,
    };
}

export function drawerRuntimePhaseForSwapFallbackFetch(
    prev: DrawerRuntimePhaseState,
    target: DrawerRuntimeTransitionTarget
): DrawerRuntimePhaseState {
    return {
        phase: "showing",
        transitionId: prev.transitionId,
        target,
        errorMessage: null,
        swapFallbackFetch: true,
    };
}

export function drawerRuntimePhaseForOpeningCold(
    prev: DrawerRuntimePhaseState,
    target: DrawerRuntimeTransitionTarget | null
): DrawerRuntimePhaseState {
    return {
        phase: "opening_cold",
        transitionId: prev.transitionId,
        target,
        errorMessage: null,
        swapFallbackFetch: false,
    };
}

export function drawerRuntimePhaseForIdle(): DrawerRuntimePhaseState {
    return { ...INITIAL_DRAWER_RUNTIME_PHASE_STATE };
}

export function drawerRuntimePhaseForError(
    prev: DrawerRuntimePhaseState,
    message: string
): DrawerRuntimePhaseState {
    return {
        ...prev,
        phase: "error",
        errorMessage: message,
        swapFallbackFetch: false,
    };
}
