"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { registerDrawerOperatingEditSection } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import {
    EDITABLE_CARD_INITIAL_STATE,
    editableCardReducer,
    runEditableCardSaveLifecycle,
    type EditableCardState,
} from "@/lib/experience/editing/editableCardRuntime";

/**
 * React binding for the canonical Editable Card Runtime.
 *
 * Drives the {@link editableCardReducer} state machine and registers the card with the ONE
 * save coordinator (`drawerOperatingSaveCoordinator`) — for Save-All and the universal
 * unsaved-change guard. There is no second coordinator (Runtime Convergence rule).
 *
 * - **Card Runtime** (this hook + reducer): edit lifecycle.
 * - **Record Runtime** (`applyOptimistic`/`rollbackOptimistic`/`save`): truth + optimistic patch.
 * - **Interaction Runtime** (`onAcknowledge`): the single saved-acknowledgement.
 * - **Motion** (`acknowledgeMs`): timing only.
 */
export type EditableCardSaveResult = { ok: boolean; error?: string };

export type UseEditableCardRuntimeOptions = {
    /** Whether the working value currently differs from the saved baseline (Record truth). */
    dirty: boolean;
    /** Performs the mutation. Resolve `{ ok: false, error }` (or throw) on failure. */
    save: () => Promise<EditableCardSaveResult>;
    /** Record Runtime: apply the change locally before the server confirms (optimistic mode). */
    applyOptimistic?: () => void;
    /** Record Runtime: restore the pre-optimistic value on failure. */
    rollbackOptimistic?: () => void;
    /** Section id for the ONE save coordinator (Save-All + dirty guard). Omit to opt out. */
    sectionId?: string;
    /** Interaction Runtime: how long the saved acknowledgement shows (Motion `micro`/`standard`). */
    acknowledgeMs?: number;
    /** Interaction Runtime: side-effect when the save is acknowledged (e.g. notify parent). */
    onAcknowledge?: () => void;
    /**
     * Coordinated mode: the card owns edit state, but Save-All (the coordinator) owns commit
     * timing. When true, `drawerOperatingSaveAll()` drives this card's phase machine
     * (saving → saved, or rollback → dirty + error). `commit()` is not used in this mode.
     * Requires `sectionId`. Self-saving cards leave this false and call `commit()` themselves.
     */
    coordinated?: boolean;
};

export type EditableCardRuntime = {
    state: EditableCardState;
    onFocus: () => void;
    onBlur: () => void;
    /** Report a value change with its dirtiness vs the saved baseline. */
    notifyChange: (dirty: boolean) => void;
    /** Run the save lifecycle now: optimistic apply → confirm → acknowledge / rollback. */
    commit: () => Promise<void>;
    reset: () => void;
};

export function useEditableCardRuntime(
    opts: UseEditableCardRuntimeOptions,
): EditableCardRuntime {
    const [state, dispatch] = useReducer(editableCardReducer, EDITABLE_CARD_INITIAL_STATE);
    const ackTimerRef = useRef<number | null>(null);
    const savingRef = useRef(false);
    const coordErrorRef = useRef<string | null>(null);
    const optsRef = useRef(opts);
    optsRef.current = opts;

    const clearAck = useCallback(() => {
        if (ackTimerRef.current != null) {
            window.clearTimeout(ackTimerRef.current);
            ackTimerRef.current = null;
        }
    }, []);

    const commit = useCallback(async () => {
        const o = optsRef.current;
        if (savingRef.current || !o.dirty) return;
        savingRef.current = true;
        let succeeded = false;
        try {
            await runEditableCardSaveLifecycle({
                dirty: o.dirty,
                save: o.save,
                applyOptimistic: o.applyOptimistic,
                rollbackOptimistic: o.rollbackOptimistic,
                emit: (event) => {
                    if (event.type === "saveSuccess") succeeded = true;
                    dispatch(event);
                },
            });
        } finally {
            savingRef.current = false;
        }
        // Interaction Runtime: hold the saved acknowledgement for the Motion interval, then settle.
        if (succeeded) {
            clearAck();
            ackTimerRef.current = window.setTimeout(() => {
                dispatch({ type: "acknowledged" });
                optsRef.current.onAcknowledge?.();
            }, optsRef.current.acknowledgeMs ?? 2000);
        }
    }, [clearAck]);

    // Register with the ONE save coordinator so Save-All and the universal dirty guard see this card.
    // In coordinated mode, Save-All (`drawerOperatingSaveAll`) also drives this card's phase machine.
    const sectionId = opts.sectionId;
    const coordinated = opts.coordinated ?? false;
    useEffect(() => {
        if (!sectionId) return;
        registerDrawerOperatingEditSection(sectionId, {
            isDirty: () => optsRef.current.dirty,
            applyOptimistic: () => {
                // Save-All begins committing this dirty section.
                if (coordinated) dispatch({ type: "saveStart" });
                optsRef.current.applyOptimistic?.();
            },
            rollbackOptimistic: () => {
                optsRef.current.rollbackOptimistic?.();
                if (coordinated) {
                    dispatch({ type: "saveFailure", error: coordErrorRef.current ?? "Save failed" });
                }
                coordErrorRef.current = null;
            },
            save: async () => {
                const result = await optsRef.current.save();
                if (!result.ok) {
                    // Signal failure so the coordinator rolls this section back. (Previously the
                    // result was awaited and discarded — a silent-failure bug; failures never
                    // reached rollback.)
                    coordErrorRef.current = result.error ?? "Save failed";
                    throw new Error(coordErrorRef.current);
                }
                coordErrorRef.current = null;
                if (coordinated) {
                    dispatch({ type: "saveSuccess" });
                    clearAck();
                    ackTimerRef.current = window.setTimeout(() => {
                        dispatch({ type: "acknowledged" });
                        optsRef.current.onAcknowledge?.();
                    }, optsRef.current.acknowledgeMs ?? 2000);
                }
            },
        });
        return () => registerDrawerOperatingEditSection(sectionId, null);
    }, [sectionId, coordinated, clearAck]);

    useEffect(() => () => clearAck(), [clearAck]);

    return {
        state,
        onFocus: () => dispatch({ type: "focus" }),
        onBlur: () => dispatch({ type: "blur" }),
        notifyChange: (dirty: boolean) => dispatch({ type: "change", dirty }),
        commit,
        reset: () => {
            clearAck();
            dispatch({ type: "reset" });
        },
    };
}
