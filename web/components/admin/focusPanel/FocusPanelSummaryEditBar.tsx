"use client";

import type { FocusPanelEditSurface } from "@/lib/adminV2/runtime/focusPanel/focusPanelEditMode";

type Props = {
    /** Deprecated: editing is no longer split into Structure/Content modes. */
    editSurface?: FocusPanelEditSurface;
    /** Deprecated no-op kept for backward compatibility with the operator grid. */
    onEditSurfaceChange?: (surface: FocusPanelEditSurface) => void;
    /** When provided, renders a Done control (e.g. exit edit mode / return to gallery). */
    onExit?: () => void;
    /** Undo the last local structure change (working copy only). */
    onUndo?: () => void;
    canUndo?: boolean;
    /** Reset the working copy to the published default. */
    onReset?: () => void;
};

/**
 * Edit Mode chrome for the Focus Panel Summary.
 *
 * Doctrine (Convergence Sprint): there is no separate "Content Mode". Editing is
 * contextual — selecting a card opens the Inspector beside the canvas. The bar now
 * carries the working-copy indicator and the local history controls (Undo / Reset),
 * plus an optional Done. Structure controls live on each card; the Inspector owns
 * content/appearance/bindings/conditions.
 */
export default function FocusPanelSummaryEditBar({ onExit, onUndo, canUndo = false, onReset }: Props) {
    return (
        <div
            data-testid="focus-panel-summary-edit-bar"
            data-focus-panel-edit-bar="true"
            className="flex flex-wrap items-center gap-3"
        >
            <span
                data-focus-panel-working-copy-indicator="true"
                className="config-typo-field-label inline-flex items-center gap-1.5 text-alloy-pine"
            >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-alloy-pine" />
                Working copy
            </span>

            <span className="config-typo-sublabel">Hover a card to arrange · select a card to inspect</span>

            <div className="ml-auto flex items-center gap-2">
                {onUndo ?
                    <button
                        type="button"
                        data-testid="focus-panel-edit-undo"
                        data-focus-panel-edit-undo="true"
                        onClick={onUndo}
                        disabled={!canUndo}
                        className="config-secondary-btn config-primary-btn--sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Undo
                    </button>
                :   null}
                {onReset ?
                    <button
                        type="button"
                        data-testid="focus-panel-edit-reset"
                        data-focus-panel-edit-reset="true"
                        onClick={onReset}
                        className="config-secondary-btn config-primary-btn--sm"
                    >
                        Reset to default
                    </button>
                :   null}
                {onExit ?
                    <button
                        type="button"
                        data-testid="focus-panel-edit-done"
                        data-focus-panel-edit-done="true"
                        onClick={onExit}
                        className="config-secondary-btn config-primary-btn--sm"
                    >
                        Done
                    </button>
                :   null}
            </div>
        </div>
    );
}
