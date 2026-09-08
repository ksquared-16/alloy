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
import {
    cardDefinition,
    cardSuccessor,
    cardTitle,
    resolveCardIdentity,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
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

/**
 * Intent applied when the Focus Panel canvas becomes the Current Work workspace.
 * Cleared after the workspace host consumes it once.
 */
export type FocusPanelCurrentWorkWorkspaceIntent =
    | { kind: "drill_in" }
    | { kind: "record_outcome" }
    | { kind: "action"; actionKey: string };

export type FocusPanelCurrentWorkWorkspaceState = {
    open: boolean;
    intent: FocusPanelCurrentWorkWorkspaceIntent | null;
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
    /**
     * Current Work operational workspace replaces the summary card grid (not a modal).
     * @see OpportunityFocusPanelModeGrid
     */
    currentWorkWorkspace?: FocusPanelCurrentWorkWorkspaceState;
    /** Open the full Current Work Focus workspace for the active record. */
    openCurrentWorkWorkspace?: (intent?: FocusPanelCurrentWorkWorkspaceIntent | null) => void;
    /** Restore the configured summary card workspace. */
    closeCurrentWorkWorkspace?: () => void;
    /** Clear a one-shot workspace open intent after the workspace host consumes it. */
    clearCurrentWorkWorkspaceIntent?: () => void;
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

/**
 * Operator-facing label for a card (used in "← Back to {label}" affordances).
 *
 * ── THE REGISTRY OWNS CARD NAMES ──
 *
 * This was a switch over five card keys: one of the central per-card lists the registry's IDENTITY
 * concern exists to retire, and it had already drifted off the one it duplicated. It knew nothing
 * of `business_process`, so a handoff back to the panel's largest card read "← Back to panel" while
 * the Surface Builder, the reserved cell and the card's own header all called it Business Process —
 * the same predecessor/successor naming drift that made the successor render under "What's Next".
 *
 * Reading `cardTitle` keeps ONE answer to "what is this card called". The five keys it used to
 * name resolve to the identical strings they returned before, so no existing affordance changes;
 * every other registered card now gets its real name instead of the generic fallback, and a card
 * that renders its own title (no declared `title`) still falls back to "panel".
 */
export function focusPanelCardBackLabel(card: FocusPanelCardKey): string {
    return cardTitle(card) ?? "panel";
}

/** A perspective level that raises the card above the surface (depth layer). */
export function isElevatedLevel(level: FocusPanelPerspectiveLevel): boolean {
    return level === "focused" || level === "edit";
}

/**
 * LIFECYCLE concern contract — owned by this coordination / canvas-elevation composer (Runtime V1
 * Certification, card-registry design law: compose small, independently-evolvable concern contracts,
 * each defined in its owning module). A card OPTS IN to elevation ownership; the two composers below
 * read it from the card registry, so which cards own truth / work is declared ONCE per card (its
 * registry entry) instead of in central membership sets here.
 *
 * Operational-truth cards OWN editable truth (Household, Children, Billing, Scheduling, Documents,
 * Communications). When they go deeper than Evidence they become the centered Focus Card (elevate +
 * recede the rest). Diagnostic cards (Readiness) do NOT own truth: they diagnose or route. Work-owning
 * cards (Current Work) own stage-work completion and may elevate to Focus. This is the canvas rule,
 * not a new primitive.
 *
 * @see docs/sprints/archive/06_2026/focus-panel-canvas-finalization
 */
export type CardLifecycle = {
    /** Owns editable entity truth → may elevate into a centered Focus Card. */
    ownsOperationalTruth?: boolean;
    /** Owns stage-work completion inside Focus (the centered Focus Card, Slice A). */
    ownsWorkCompletion?: boolean;
};

/** True when this card may elevate into a centered Focus Card (declared via the registry lifecycle concern). */
export function isOperationalTruthCard(card: FocusPanelCardKey): boolean {
    return cardDefinition(card)?.ownsOperationalTruth === true;
}

/** True when this card owns stage work completion inside Focus (declared via the registry lifecycle concern). */
export function isWorkOwningCard(card: FocusPanelCardKey): boolean {
    return cardDefinition(card)?.ownsWorkCompletion === true;
}

/**
 * True when a card may report focused/edit depth (centered Focus Card). Operational-truth
 * cards and the work-owning card (Current Work, Slice A) elevate through the same path.
 */
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
 *
 * ── A SUPERSEDED CARD ELEVATES ON ITS SUCCESSOR'S CELL ──
 *
 * A published layout composes the successor, so the predecessor's key matches no cell and the
 * lookup fell through to the key itself — which no cell answers to, so nothing was raised. The
 * request is still legitimate: the successor is where that card's depth now lives, which is exactly
 * what supersession means. Consulting the registry here keeps that in one place rather than making
 * every caller translate keys before asking.
 */
/**
 * The cell a surface can ACTUALLY raise, out of the cells it actually renders.
 *
 * `resolveElevatedCellKey` answers "which cell does this card want", and ends by returning
 * the card key itself when the resolution map knows nothing about it. That answer is a
 * request, not a fact, and a renderer that treats it as a fact activates its depth layer
 * for a cell that does not exist: the scrim paints and NOTHING carries `data-fp-elevated`,
 * so every cell falls under the receded rule (`opacity` + `filter` + `pointer-events:none`).
 * Opacity and filter each open a stacking context, so the cell hosting the command the
 * operator just launched cannot rise above the scrim at ANY z-index — the command surface
 * renders behind its own backdrop, dimmed and inert.
 *
 * Measured on Send Tour Invitation: the requested key was `current_work` while the surface
 * rendered `business_process, financials, attendance, children, household, health_safety`.
 * `current_work` is `supersededBy: "business_process"` in the card registry and the Process
 * card is where its command surface is hosted, so the request resolves onto that cell
 * through the supersession the registry already declares — no second notion of identity.
 *
 * Returning `null` when nothing matches is the invariant: never dim a canvas without
 * raising something out of it.
 */
export function resolveRaisedCellKey(
    requestedCellKey: string | null | undefined,
    renderedCellKeys: readonly string[],
): string | null {
    if (!requestedCellKey) return null;
    if (renderedCellKeys.includes(requestedCellKey)) return requestedCellKey;
    const wanted = resolveCardIdentity(requestedCellKey as FocusPanelCardKey);
    for (const key of renderedCellKeys) {
        if (resolveCardIdentity(key as FocusPanelCardKey) === wanted) return key;
    }
    return null;
}

export function resolveElevatedCellKey(
    activeCard: FocusPanelCardKey | null | undefined,
    cellResolution: ReadonlyMap<string, { typeKey: FocusPanelCardKey }>,
): string | null {
    if (!activeCard) return null;
    for (const [cellKey, { typeKey }] of cellResolution) {
        if (typeKey === activeCard) return cellKey;
    }
    const successor = cardSuccessor(activeCard);
    if (successor) {
        for (const [cellKey, { typeKey }] of cellResolution) {
            if (typeKey === successor) return cellKey;
        }
    }
    return activeCard;
}
