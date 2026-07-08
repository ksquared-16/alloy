/**
 * Focus Panel cross-card coordination — PURE MODEL (types, constants, helpers).
 *
 * No React. Safe to import from server / App Route code (validators, layout-doc
 * model, entity-layout routes, Experience Builder model). The React hooks that
 * orchestrate this state live in the client-only `useFocusPanelCoordination.ts`.
 *
 * NOT a new architecture or interaction primitive — this is the shape of the
 * EXISTING local perspective state the Core Four own. It lets a card that only
 * *references* a fact (e.g. Readiness "Program missing") hand off to the card that
 * *owns* that fact (Children → focused child), expressed as a Perspective Change on
 * the owner card. No fetch, no route, no Subject Change, no new context.
 *
 * @see docs/platform/operator/card-language.md (Perspective Change)
 * @see ./useFocusPanelCoordination.ts (client hooks)
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

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

/**
 * One entry in the card-depth history — where a card-to-card handoff ORIGINATED, so
 * Back can return to that exact prior focus (e.g. Household focused-evidence → Child
 * → Back → Household focused-evidence). Local Focus Panel state only: NOT routing,
 * NOT drawer navigation. `focus` is the source card's own focus id (group key /
 * null) the host re-issues to restore it.
 */
export type FocusPanelDepthEntry = {
    card: FocusPanelCardKey;
    focus: string | null;
};

export type FocusPanelCoordination = {
    /** Card types mounted and visible in the active mode grid (handoff guard). */
    focusTargets?: ReadonlySet<FocusPanelCardKey>;
    /** Switch Focus Panel mode (e.g. Activity for communications). */
    openFocusPanelMode?: (mode: FocusPanelMode) => void;
    /** Invoke a registry header action (composer / send). */
    invokeHeaderAction?: (action: ResolvedActionForClient) => void;
    /** Resolve a send/composer action for outreach handoff fallback. */
    resolveCommunicationsComposerAction?: () => ResolvedActionForClient | null;
    /** The current handoff request, or null. */
    request: FocusPanelFocusRequest | null;
    /**
     * A referencing card emits a handoff to the owner card. `source` records where
     * the handoff originated (the caller's current card + focus) so Back can return
     * there — pushed onto the depth history.
     */
    requestFocus: (card: FocusPanelCardKey, focus: string | null, source?: FocusPanelDepthEntry) => void;
    /** Which card (if any) is currently raised in the depth layer. */
    activeDepth?: FocusPanelActiveDepth | null;
    /** A card reports its current perspective depth (orchestration, not a primitive). */
    reportPerspective?: (card: FocusPanelCardKey, level: FocusPanelPerspectiveLevel) => void;
    /** The active "return to base" signal (backdrop click / ESC), or null. */
    dismissed?: FocusPanelDismissSignal | null;
    /** Ask the active focused/edit card to collapse back to its base surface. */
    dismiss?: (card: FocusPanelCardKey) => void;
    /** Top of the depth history — the focus a handoff came FROM, or null at the root. */
    previousFocus?: FocusPanelDepthEntry | null;
    /** Pop the depth history and return to the prior card/focus. No-op when empty. */
    back?: () => void;
};

/** Operator-facing label for a card (used in "← Back to {label}" affordances). */
export function focusPanelCardBackLabel(card: FocusPanelCardKey): string {
    switch (card) {
        case "household":
            return "Household";
        case "children":
            return "Children";
        case "communications":
            return "Communications";
        case "documents":
            return "Documents";
        case "current_work":
            return "Current Work";
        default:
            return "panel";
    }
}

/** A perspective level that raises the card above the surface (depth layer). */
export function isElevatedLevel(level: FocusPanelPerspectiveLevel): boolean {
    return level === "focused" || level === "edit";
}

/**
 * Operational-truth cards OWN editable truth (Household, Children, and — as they
 * land — Billing, Schedule, Staff, Documents, Communications). When they go deeper
 * than Evidence they become the centered Focus Card (elevate + recede the rest).
 *
 * Diagnostic cards (Readiness) do NOT own truth: they diagnose or route. Work-owning
 * cards (Current Work) own completion interaction and may elevate to Focus. Truth cards
 * own entity fields. This is the canvas rule, not a new primitive.
 *
 * @see docs/sprints/06_2026/focus-panel-canvas-finalization
 */
const OPERATIONAL_TRUTH_CARDS: ReadonlySet<FocusPanelCardKey> = new Set<FocusPanelCardKey>([
    "household",
    "children",
    "billing_preview",
    "documents",
    "communications",
]);

/** Work-owning cards reach Focus to run completion — not because they store entity truth. */
const WORK_OWNING_CARDS: ReadonlySet<FocusPanelCardKey> = new Set<FocusPanelCardKey>(["current_work"]);

/** True when this card may elevate into a centered Focus Card. */
export function isOperationalTruthCard(card: FocusPanelCardKey): boolean {
    return OPERATIONAL_TRUTH_CARDS.has(card);
}

/** True when this card owns stage work completion inside Focus. */
export function isWorkOwningCard(card: FocusPanelCardKey): boolean {
    return WORK_OWNING_CARDS.has(card);
}

/** True when a card may report focused/edit depth (centered Focus Card). */
export function isFocusElevatingCard(card: FocusPanelCardKey): boolean {
    return isOperationalTruthCard(card) || isWorkOwningCard(card);
}

/**
 * Clamp a reported depth to the canvas rule: diagnostic cards never elevate past
 * Evidence (they expand in place / hand off). Operational-truth cards pass through.
 */
export function clampPerspectiveForCard(
    card: FocusPanelCardKey,
    level: FocusPanelPerspectiveLevel,
): FocusPanelPerspectiveLevel {
    if (isFocusElevatingCard(card)) return level;
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
 * Map an active card TYPE to the grid cell key that hosts it. `activeDepth` reports
 * card types; grid cells use `instanceKey` when the layout doc assigns one.
 */
export function resolveElevatedCellKey(
    activeCard: FocusPanelCardKey | null | undefined,
    cellResolution: ReadonlyMap<string, { typeKey: FocusPanelCardKey }>,
): string | null {
    if (!activeCard) return null;
    for (const [cellKey, { typeKey }] of cellResolution) {
        if (typeKey === activeCard) return cellKey;
    }
    return activeCard;
}
