"use client";

import type { DragEvent, ReactNode } from "react";

import type { FocusPanelEditSurface } from "@/lib/adminV2/runtime/focusPanel/focusPanelEditMode";
import type { FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

/** Structure operations for one card (local working copy only). */
export type FocusPanelCardStructureControls = {
    span: FocusPanelCardSpan;
    canMovePrev: boolean;
    canMoveNext: boolean;
    onMovePrev: () => void;
    onMoveNext: () => void;
    onCycleSpan: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
};

/** Drag-and-drop reorder wiring (local working copy only). */
export type FocusPanelCardDragControls = {
    dragging: boolean;
    dropTarget: boolean;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
};

type Props = {
    cardKey: string;
    /** Deprecated: editing is no longer split into Structure/Content modes. Ignored. */
    editSurface?: FocusPanelEditSurface;
    selected: boolean;
    onSelect: (cardKey: string) => void;
    children: ReactNode;
    /** When provided, renders move/resize/duplicate/remove structure controls. */
    structureControls?: FocusPanelCardStructureControls;
    /** When provided, enables drag-and-drop reorder. */
    dragControls?: FocusPanelCardDragControls;
};

function spanLabel(span: FocusPanelCardSpan): string {
    if (span === "row") return "Full";
    return span === 2 ? "Wide" : "1×";
}

/**
 * Additive edit affordance wrapper for a single Focus Panel Summary card (C1).
 *
 * Visual parity is the contract: the card (`children`) renders byte-identically to
 * viewing mode. This frame only adds an overlay — a hover/selected outline ring and
 * an edit handle — positioned absolutely so it never shifts the card's box model.
 * It mutates nothing; `onSelect` sets local, non-persistent selection state.
 */
const CONTROL_BTN =
    "inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-alloy-pine/30 bg-white/95 px-1.5 text-[11px] font-semibold text-alloy-pine shadow-sm transition-colors hover:bg-alloy-pine/10 disabled:cursor-not-allowed disabled:opacity-35";

export default function FocusPanelEditableCardFrame({
    cardKey,
    selected,
    onSelect,
    children,
    structureControls,
    dragControls,
}: Props) {
    const showStructureControls = Boolean(structureControls);
    const dragEnabled = Boolean(dragControls);
    return (
        <div
            className="group/fp-edit relative h-full"
            data-focus-panel-editable-card={cardKey}
            data-focus-panel-edit-selected={selected ? "true" : "false"}
            onClick={() => onSelect(cardKey)}
            data-focus-panel-card-dragging={dragControls?.dragging ? "true" : undefined}
            data-focus-panel-card-drop-target={dragControls?.dropTarget ? "true" : undefined}
            draggable={dragEnabled || undefined}
            onDragStart={dragEnabled ? dragControls!.onDragStart : undefined}
            onDragEnd={dragEnabled ? dragControls!.onDragEnd : undefined}
            onDragOver={dragEnabled ? dragControls!.onDragOver : undefined}
            onDrop={dragEnabled ? dragControls!.onDrop : undefined}
            style={dragControls?.dragging ? { opacity: 0.5 } : undefined}
        >
            {children}

            {/* Outline ring — overlay only, never intercepts pointer events on the card. */}
            <span
                aria-hidden
                className={[
                    "pointer-events-none absolute inset-0 rounded-xl ring-1 transition-colors",
                    selected
                        ? "ring-2 ring-alloy-pine"
                        : "ring-transparent group-hover/fp-edit:ring-alloy-pine/40",
                ].join(" ")}
            />

            {/* Drop indicator — left edge bar shown while a dragged card hovers this slot. */}
            {dragControls?.dropTarget ?
                <span
                    aria-hidden
                    data-focus-panel-card-drop-indicator={cardKey}
                    className="pointer-events-none absolute inset-y-1 -left-1 w-1 rounded-full bg-alloy-pine"
                />
            :   null}

            {showStructureControls && structureControls ?
                <div
                    data-focus-panel-card-structure-controls={cardKey}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-alloy-pine/25 bg-white/95 p-1 shadow-sm opacity-0 transition-opacity group-hover/fp-edit:opacity-100 focus-within:opacity-100"
                >
                    {dragEnabled ?
                        <span
                            data-focus-panel-card-drag-handle={cardKey}
                            aria-label={`Drag ${cardKey} to reorder`}
                            className={`${CONTROL_BTN} cursor-grab active:cursor-grabbing`}
                        >
                            ⠿
                        </span>
                    :   null}
                    <button
                        type="button"
                        data-focus-panel-card-move-prev={cardKey}
                        aria-label={`Move ${cardKey} earlier`}
                        disabled={!structureControls.canMovePrev}
                        onClick={structureControls.onMovePrev}
                        className={CONTROL_BTN}
                    >
                        ◀
                    </button>
                    <button
                        type="button"
                        data-focus-panel-card-move-next={cardKey}
                        aria-label={`Move ${cardKey} later`}
                        disabled={!structureControls.canMoveNext}
                        onClick={structureControls.onMoveNext}
                        className={CONTROL_BTN}
                    >
                        ▶
                    </button>
                    <button
                        type="button"
                        data-focus-panel-card-span={cardKey}
                        data-focus-panel-card-span-value={String(structureControls.span)}
                        aria-label={`Resize ${cardKey} (currently ${spanLabel(structureControls.span)})`}
                        onClick={structureControls.onCycleSpan}
                        className={CONTROL_BTN}
                    >
                        {spanLabel(structureControls.span)}
                    </button>
                    <button
                        type="button"
                        data-focus-panel-card-duplicate={cardKey}
                        aria-label={`Duplicate ${cardKey}`}
                        onClick={structureControls.onDuplicate}
                        className={CONTROL_BTN}
                    >
                        ⧉
                    </button>
                    <button
                        type="button"
                        data-focus-panel-card-remove={cardKey}
                        aria-label={`Remove ${cardKey}`}
                        onClick={structureControls.onRemove}
                        className={`${CONTROL_BTN} text-red-600 border-red-300 hover:bg-red-50`}
                    >
                        ✕
                    </button>
                </div>
            :   null}

            {/* Inspect handle — selecting opens the contextual Inspector (canvas stays). */}
            <button
                type="button"
                data-focus-panel-edit-handle={cardKey}
                aria-label={`Inspect ${cardKey}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(cardKey);
                }}
                className={[
                    "absolute right-2 top-2 z-10 rounded-md border border-alloy-pine/30 bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-alloy-pine shadow-sm transition-opacity",
                    selected ? "opacity-100" : "opacity-0 group-hover/fp-edit:opacity-100",
                ].join(" ")}
            >
                Inspect
            </button>
        </div>
    );
}
