/**
 * Focus Panel Card Links — reusable in-panel navigation between cards.
 *
 * Platform owns navigation, history, back/forward, and deep linking between cards.
 * Configuration owns which fields/buttons target which card (Surface Builder later).
 *
 * This is NOT a page/workspace navigation. It changes the active Focus Panel card via the
 * existing FocusPanelCoordination.requestFocus path.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

/** Configured link from a field/control on one card to another card in the same Focus Panel. */
export type FocusPanelCardLink = {
    /** Stable config id (Surface Builder / published metadata). */
    id: string;
    /** Source card that owns the linking control. */
    fromCard: FocusPanelCardKey;
    /** Destination card to raise. */
    toCard: FocusPanelCardKey;
    /** Optional field/control key on the source card that triggers the link. */
    fromFieldKey?: string | null;
    /** Operator-facing label for the link control. */
    label?: string | null;
    /** Destination presentation: base summary vs focused detail. */
    destinationOpen?: "base" | "detail" | null;
    /**
     * Subject resolver for the destination card.
     * `this_child` / `current_schedule` → source item id (child/member).
     */
    destinationSubject?:
        | "this_child"
        | "selected_person"
        | "household"
        | "current_enrollment"
        | "current_schedule"
        | null;
};

export type FocusPanelCardLinkHistoryEntry = {
    card: FocusPanelCardKey;
    focus: string | null;
    at: number;
};

/**
 * Navigate to a Focus Panel card through the shared coordination owner.
 * Returns false when coordination is unavailable or the target card is not in layout.
 *
 * `destinationFocus` targets the destination card; `sourceFocus` is what Back restores
 * on the source card (defaults to null = expand source card only).
 */
export function navigateFocusPanelCardLink(
    coordination: FocusPanelCoordination | undefined,
    link: Pick<FocusPanelCardLink, "toCard" | "fromCard">,
    destinationFocus: string | null = null,
    sourceFocus: string | null = null,
): boolean {
    if (!coordination) return false;
    if (coordination.focusTargets && !coordination.focusTargets.has(link.toCard)) return false;
    coordination.requestFocus(link.toCard, destinationFocus, {
        card: link.fromCard,
        focus: sourceFocus,
    });
    return true;
}

/** Resolve the link configured for a source field on a card (first match). */
export function resolveFocusPanelCardLinkForField(
    links: readonly FocusPanelCardLink[] | null | undefined,
    fromCard: FocusPanelCardKey,
    fieldKey: string,
): FocusPanelCardLink | null {
    if (!links?.length) return null;
    const key = fieldKey.trim();
    if (!key) return null;
    return (
        links.find(
            (link) => link.fromCard === fromCard && (link.fromFieldKey?.trim() || "") === key,
        ) ?? null
    );
}

/** Pure history helper — push destination after a successful card-link navigation. */
export function pushFocusPanelCardLinkHistory(
    history: readonly FocusPanelCardLinkHistoryEntry[],
    entry: FocusPanelCardLinkHistoryEntry,
    limit = 32,
): FocusPanelCardLinkHistoryEntry[] {
    const next = [...history, entry];
    return next.length > limit ? next.slice(next.length - limit) : next;
}

export function peekFocusPanelCardLinkBack(
    history: readonly FocusPanelCardLinkHistoryEntry[],
): FocusPanelCardLinkHistoryEntry | null {
    if (history.length < 2) return null;
    return history[history.length - 2] ?? null;
}
