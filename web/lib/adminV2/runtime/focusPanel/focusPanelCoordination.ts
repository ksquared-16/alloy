/**
 * Focus Panel cross-card coordination.
 *
 * NOT a new architecture or interaction primitive — this is orchestration of the
 * EXISTING local perspective state the Core Four already own. It lets a card that
 * only *references* a fact (e.g. Readiness "Program missing") hand off to the card
 * that *owns* that fact (Children → focused child), expressed as a Perspective
 * Change on the owner card. No fetch, no route, no Subject Change, no new context.
 *
 * Flow: a referencing card calls `requestFocus(ownerCard, focus)`. The Focus Panel
 * host records the request (with a monotonic nonce so repeats re-trigger), scrolls
 * the owner card into view, and the owner card observes the request and opens the
 * matching evidence/focused perspective.
 *
 * @see docs/platform/operator/card-language.md (Perspective Change)
 * @see docs/sprints/06_2026/core-four-product-review (Readiness pointer model)
 */

import { useEffect, useRef } from "react";

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/** "Open card X and focus target Y (a group key / child id / item id)." */
export type FocusPanelFocusRequest = {
    card: FocusPanelCardKey;
    /** Owner-defined focus id; null = just expand the card. */
    focus: string | null;
    /** Monotonic nonce so repeat requests to the same target re-apply. */
    nonce: number;
};

/**
 * The depth a card currently occupies within the in-panel layer model:
 * Overview (`base`) → Evidence → Focused → Edit. `focused` and `edit` are the
 * "deep" layers that bring the card forward and recede the rest of the surface.
 */
export type FocusPanelPerspectiveLevel = "base" | "evidence" | "focused" | "edit";

/** A card raised above the grid (focused/edit) while the rest recedes. */
export type FocusPanelActiveDepth = {
    card: FocusPanelCardKey;
    level: FocusPanelPerspectiveLevel;
};

/** "Return card X to its base Work surface" (scrim click / ESC). */
export type FocusPanelDismissSignal = {
    card: FocusPanelCardKey;
    /** Monotonic nonce so repeat dismissals re-apply. */
    nonce: number;
};

export type FocusPanelCoordination = {
    /** The current handoff request, or null. */
    request: FocusPanelFocusRequest | null;
    /** A referencing card emits a handoff to the owner card. */
    requestFocus: (card: FocusPanelCardKey, focus: string | null) => void;
    /** Which card (if any) is currently raised in the depth layer. */
    activeDepth?: FocusPanelActiveDepth | null;
    /** A card reports its current perspective depth (orchestration, not a primitive). */
    reportPerspective?: (card: FocusPanelCardKey, level: FocusPanelPerspectiveLevel) => void;
    /** The active "return to base" signal (backdrop click / ESC), or null. */
    dismissed?: FocusPanelDismissSignal | null;
    /** Ask the active focused/edit card to collapse back to its base surface. */
    dismiss?: (card: FocusPanelCardKey) => void;
};

/** A perspective level that raises the card above the surface (depth layer). */
export function isElevatedLevel(level: FocusPanelPerspectiveLevel): boolean {
    return level === "focused" || level === "edit";
}

/**
 * Operational-truth cards OWN editable truth (Household, Children, and — as they
 * land — Billing, Schedule, Staff, Documents, Communications). When they go deeper
 * than Evidence they become the centered Focus Card (elevate + recede the rest).
 *
 * Diagnostic / coordinating cards (Readiness, Current Work, Attention) do NOT own
 * truth: they diagnose or route. They must never become a Focus Card workspace —
 * they expand in place (Evidence inline) or hand off attention to the owner card
 * via `requestFocus`. This is the canvas rule, not a new primitive.
 *
 * @see docs/sprints/06_2026/focus-panel-canvas-finalization
 */
const OPERATIONAL_TRUTH_CARDS: ReadonlySet<FocusPanelCardKey> = new Set<FocusPanelCardKey>([
    "household",
    "children",
    "documents",
    "communications",
]);

/** True when this card may elevate into a centered Focus Card. */
export function isOperationalTruthCard(card: FocusPanelCardKey): boolean {
    return OPERATIONAL_TRUTH_CARDS.has(card);
}

/**
 * Clamp a reported depth to the canvas rule: diagnostic cards never elevate past
 * Evidence (they expand in place / hand off). Operational-truth cards pass through.
 */
export function clampPerspectiveForCard(
    card: FocusPanelCardKey,
    level: FocusPanelPerspectiveLevel,
): FocusPanelPerspectiveLevel {
    if (isOperationalTruthCard(card)) return level;
    return isElevatedLevel(level) ? "evidence" : level;
}

/** True when a coordination request currently targets this card. */
export function isFocusRequestFor(
    coordination: FocusPanelCoordination | undefined,
    card: FocusPanelCardKey,
): boolean {
    return coordination?.request?.card === card;
}

/**
 * Report a card's current perspective depth to the host so it can apply the
 * in-panel depth layer (raise this card, recede the rest). Resets to `base` on
 * unmount. `reportPerspective` is captured via ref so the effect does not re-fire
 * when the coordination object identity changes (e.g. on every handoff request).
 */
export function useReportPerspective(
    coordination: FocusPanelCoordination | undefined,
    card: FocusPanelCardKey,
    level: FocusPanelPerspectiveLevel,
): void {
    const reportRef = useRef(coordination?.reportPerspective);
    reportRef.current = coordination?.reportPerspective;

    // Diagnostic cards never elevate: clamp so they only ever report base/evidence.
    const effective = clampPerspectiveForCard(card, level);

    useEffect(() => {
        reportRef.current?.(card, effective);
    }, [card, effective]);

    useEffect(() => {
        return () => {
            reportRef.current?.(card, "base");
        };
    }, [card]);
}

/**
 * Run `reset` when the host dismisses this card's depth layer (backdrop click or
 * ESC). The card collapses back to its base Work surface. Keyed by card so only the
 * active focused/edit card responds. `reset` is captured via ref to keep the effect
 * gated solely on the dismissal nonce.
 */
export function useDismissSignal(
    coordination: FocusPanelCoordination | undefined,
    card: FocusPanelCardKey,
    reset: () => void,
): void {
    const resetRef = useRef(reset);
    resetRef.current = reset;
    const dismissed = coordination?.dismissed;
    const nonce = dismissed?.card === card ? dismissed.nonce : null;

    useEffect(() => {
        if (nonce == null) return;
        resetRef.current();
    }, [nonce]);
}
