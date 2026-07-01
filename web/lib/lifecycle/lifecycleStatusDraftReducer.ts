import {
    mergeStatusDraftToggle,
    normalizeLifecycleBuilderStageKey,
    shouldApplyServerStatusKeysForStage,
    shouldSyncStatusDraftForStage,
    writeStatusDraftForStage,
    type StatusDraftByStageKey,
} from "@/lib/lifecycle/lifecycleStatusStepDraft";

export type LifecycleStatusDraftState = {
    draftByStage: StatusDraftByStageKey;
    savedByStage: StatusDraftByStageKey;
    dirtyByStage: Record<string, boolean>;
};

export const INITIAL_LIFECYCLE_STATUS_DRAFT_STATE: LifecycleStatusDraftState = {
    draftByStage: {},
    savedByStage: {},
    dirtyByStage: {},
};

export type LifecycleStatusDraftAction =
    | { type: "reset" }
    | { type: "toggle"; stageKey: string; statusKey: string; selected: boolean }
    | { type: "syncFromServer"; stageKey: string; keys: readonly string[] }
    | { type: "commitSaved"; stageKey: string; keys: readonly string[] }
    | { type: "setKeys"; stageKey: string; keys: readonly string[] }
    | { type: "clearStageDraft"; stageKey: string };

export function lifecycleStatusDraftReducer(
    state: LifecycleStatusDraftState,
    action: LifecycleStatusDraftAction
): LifecycleStatusDraftState {
    switch (action.type) {
        case "reset":
            return INITIAL_LIFECYCLE_STATUS_DRAFT_STATE;
        case "toggle": {
            const sk = normalizeLifecycleBuilderStageKey(action.stageKey);
            const status = action.statusKey.trim();
            if (!sk || !status) return state;
            return {
                ...state,
                draftByStage: mergeStatusDraftToggle(
                    state.draftByStage,
                    sk,
                    status,
                    action.selected
                ),
                dirtyByStage: { ...state.dirtyByStage, [sk]: true },
            };
        }
        case "syncFromServer": {
            const sk = normalizeLifecycleBuilderStageKey(action.stageKey);
            if (!sk) return state;
            if (!shouldSyncStatusDraftForStage(state.dirtyByStage, sk)) return state;
            if (
                !shouldApplyServerStatusKeysForStage(
                    state.draftByStage,
                    state.savedByStage,
                    sk,
                    action.keys
                )
            ) {
                return state;
            }
            const dirtyByStage = { ...state.dirtyByStage };
            delete dirtyByStage[sk];
            return {
                draftByStage: writeStatusDraftForStage(state.draftByStage, sk, action.keys),
                savedByStage: writeStatusDraftForStage(state.savedByStage, sk, action.keys),
                dirtyByStage,
            };
        }
        case "setKeys": {
            const sk = normalizeLifecycleBuilderStageKey(action.stageKey);
            if (!sk) return state;
            return {
                ...state,
                draftByStage: writeStatusDraftForStage(state.draftByStage, sk, action.keys),
                dirtyByStage: { ...state.dirtyByStage, [sk]: true },
            };
        }
        case "commitSaved": {
            const sk = normalizeLifecycleBuilderStageKey(action.stageKey);
            if (!sk || action.keys.length < 1) return state;
            const dirtyByStage = { ...state.dirtyByStage };
            delete dirtyByStage[sk];
            return {
                draftByStage: writeStatusDraftForStage(state.draftByStage, sk, action.keys),
                savedByStage: writeStatusDraftForStage(state.savedByStage, sk, action.keys),
                dirtyByStage,
            };
        }
        case "clearStageDraft": {
            const sk = normalizeLifecycleBuilderStageKey(action.stageKey);
            if (!sk) return state;
            const dirtyByStage = { ...state.dirtyByStage };
            delete dirtyByStage[sk];
            return {
                ...state,
                draftByStage: writeStatusDraftForStage(state.draftByStage, sk, []),
                dirtyByStage,
            };
        }
        default:
            return state;
    }
}

/** Apply reducer and return next state (for ref sync before React re-render). */
export function applyLifecycleStatusDraftAction(
    state: LifecycleStatusDraftState,
    action: LifecycleStatusDraftAction
): LifecycleStatusDraftState {
    return lifecycleStatusDraftReducer(state, action);
}
