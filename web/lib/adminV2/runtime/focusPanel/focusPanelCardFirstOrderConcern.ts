import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * FIRST-ORDER concern — one card declaration slice, owned by the first-order runtime.
 *
 * Added the way the registry's design law says a concern is added: a small, separately-typed
 * contract living in its own module, opted into by the cards that have something to say, read by
 * ONE composer. `CardDefinition` gains `Partial<CardFirstOrderFields>` and nothing else changes.
 *
 * ── WHY A CARD DECLARES A DEFAULT AT ALL, WHEN FIELD MEMBERSHIP IS CONFIGURATION ──
 *
 * Because today's published Enrollment configuration does not carry one for four of the six
 * cards. `defaultEvidenceGroupsForCard` seeds fields for `household` and `children` only; the
 * operational cards (Business Process, Attendance, Health & Safety, Financials) are
 * self-fetching and carry NO configured fields, so there is nothing on the published doc to
 * compile from. The honest options were to invent configuration on the tenant's behalf, or to let
 * each card declare what it answers by default and let configuration override it. This is the
 * second.
 *
 * CONFIGURATION WINS WHENEVER IT EXISTS. `resolveFirstOrderSurfaceConfiguration` reads a card's
 * configured collapsed fields first and consults this declaration only when the card configures
 * none. A tenant that authors first-order fields onto Attendance gets exactly those, in exactly
 * that order, with no code change — which is the property the whole compiler exists to provide.
 *
 * THIS IS NOT THE COMPOSER'S LIST. The composer must not know these keys, and a gate asserts it
 * contains no semantic-key literal. A default owned by the card is a platform declaration a
 * tenant can replace; a list owned by the composer is architecture nobody can reach.
 */
export type CardFirstOrderFields = {
    /**
     * Semantic keys this card answers at Stage 1, in reading order, when configuration declares
     * none. Every key must be registered in the first-order capability registry — a certification
     * gate proves it, so a typo becomes a failing build rather than a silently missing region.
     */
    firstOrderFields: readonly string[];
};

/** A card's declared default first-order semantic keys, or none. */
export function cardDefaultFirstOrderFields(
    definition: (Partial<CardFirstOrderFields> & { key: FocusPanelCardKey }) | undefined,
): readonly string[] {
    return definition?.firstOrderFields ?? [];
}
