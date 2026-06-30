/**
 * Canonical Editable Card Runtime — the one edit-lifecycle state machine for Alloy.
 *
 * Doctrine:      docs/platform/experience/editable-card-runtime.md
 * Architecture:  docs/platform/foundation/runtime-architecture-map.md
 *
 * Ownership (no overlap):
 * - **Card Runtime** owns this state machine and the user-facing edit lifecycle.
 * - **Record Runtime** owns the optimistic patch, rollback, propagation, and truth.
 * - **Interaction Runtime** owns the acknowledgement / feedback primitive.
 * - **Motion** owns timing/choreography only.
 *
 * The machine is a pure reducer so the contract is verifiable without a DOM. The React hook
 * `useEditableCardRuntime` wires it to the ONE save coordinator (`drawerOperatingSaveCoordinator`)
 * — there is no second coordinator.
 *
 *   viewing → focused → editing → dirty → saving → saved → viewing
 *                                   ↑        │
 *                                   └────────┘  (save failure → rollback to dirty + legible error)
 */

export type EditableCardPhase =
    | "viewing"
    | "focused"
    | "editing"
    | "dirty"
    | "saving"
    | "saved";

export type EditableCardState = {
    phase: EditableCardPhase;
    /** True when the working value differs from the saved baseline. */
    dirty: boolean;
    /** Legible, consistent error from a failed save; null otherwise. */
    error: string | null;
};

export const EDITABLE_CARD_INITIAL_STATE: EditableCardState = {
    phase: "viewing",
    dirty: false,
    error: null,
};

export type EditableCardEvent =
    | { type: "focus" }
    /** Caller computes `dirty` against the saved baseline (Record truth) and reports it. */
    | { type: "change"; dirty: boolean }
    | { type: "blur" }
    | { type: "saveStart" }
    | { type: "saveSuccess" }
    | { type: "saveFailure"; error: string }
    /** The acknowledgement interval (Motion timing) has elapsed — settle back to viewing. */
    | { type: "acknowledged" }
    | { type: "reset" };

/**
 * The canonical transition table. Pure: (state, event) → state. This IS the editing contract.
 */
export function editableCardReducer(
    state: EditableCardState,
    event: EditableCardEvent,
): EditableCardState {
    switch (event.type) {
        case "focus":
            // Focus never interrupts an in-flight save.
            if (state.phase === "saving") return state;
            return { ...state, phase: state.dirty ? "dirty" : "focused", error: null };
        case "change":
            // A change clears any prior error and reflects dirtiness vs the baseline.
            return { phase: event.dirty ? "dirty" : "editing", dirty: event.dirty, error: null };
        case "blur":
            // Blur with unsaved changes holds `dirty` (the guard/save still apply); clean → viewing.
            if (state.phase === "saving") return state;
            return { ...state, phase: state.dirty ? "dirty" : "viewing" };
        case "saveStart":
            // Nothing to save when not dirty — no-op (idempotent).
            if (!state.dirty) return state;
            return { ...state, phase: "saving", error: null };
        case "saveSuccess":
            return { phase: "saved", dirty: false, error: null };
        case "saveFailure":
            // Optimistic rollback returns to `dirty` (the operator's changes are still present)
            // with a legible, consistent error — never a silent loss.
            return { phase: "dirty", dirty: true, error: event.error };
        case "acknowledged":
            if (state.phase !== "saved") return state;
            return EDITABLE_CARD_INITIAL_STATE;
        case "reset":
            return EDITABLE_CARD_INITIAL_STATE;
        default:
            return state;
    }
}

// --- Derived selectors — one place, so every editable card reads status identically ---

export function editableCardIsSaving(state: EditableCardState): boolean {
    return state.phase === "saving";
}

export function editableCardShowsSavedAck(state: EditableCardState): boolean {
    return state.phase === "saved";
}

export function editableCardIsDirty(state: EditableCardState): boolean {
    return state.dirty;
}

/** True when leaving must trigger the unsaved-change guard (dirty or mid-save). */
export function editableCardBlocksExit(state: EditableCardState): boolean {
    return state.dirty || state.phase === "saving";
}

/**
 * Pure save-lifecycle orchestration: emit `saveStart` → optimistic apply → confirm →
 * `saveSuccess` or (rollback +) `saveFailure`. Shared by the React hook and tested directly,
 * so the lifecycle is verifiable without a DOM. `emit` receives the canonical events.
 */
export async function runEditableCardSaveLifecycle(args: {
    dirty: boolean;
    save: () => Promise<{ ok: boolean; error?: string }>;
    applyOptimistic?: () => void;
    rollbackOptimistic?: () => void;
    emit: (event: EditableCardEvent) => void;
}): Promise<void> {
    if (!args.dirty) return;
    args.emit({ type: "saveStart" });
    args.applyOptimistic?.();
    try {
        const result = await args.save();
        if (result.ok) {
            args.emit({ type: "saveSuccess" });
        } else {
            args.rollbackOptimistic?.();
            args.emit({ type: "saveFailure", error: result.error ?? "Save failed" });
        }
    } catch (e) {
        args.rollbackOptimistic?.();
        args.emit({ type: "saveFailure", error: e instanceof Error ? e.message : "Save failed" });
    }
}

export type EditableCardStatusLabel = "saving" | "saved" | "error" | "unsaved" | null;

/** The single status-label vocabulary every editable card shares (no per-card flash strings). */
export function editableCardStatusLabel(state: EditableCardState): EditableCardStatusLabel {
    if (state.error) return "error";
    if (state.phase === "saving") return "saving";
    if (state.phase === "saved") return "saved";
    if (state.dirty) return "unsaved";
    return null;
}
