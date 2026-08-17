/**
 * HOUSEHOLD-GRAIN CARD MODELS.
 *
 * ── IT BUILDS NO CARD MODEL OF ITS OWN ──
 *
 * The Household card model comes from `buildHouseholdCardModel` — the SAME builder both case-grain
 * producers already call, described in its own docblock as "SHARED by both Focus Panel Work-mode
 * producers … so the card is identical". Calling it from a third producer is the point: a durable
 * household and a case must not be able to disagree about what the Household card says, and the only
 * way to guarantee that is for there to be one builder rather than three that look alike.
 *
 * So this module is a GATE and a call, nothing else. What varies between the surfaces is the record
 * handed in, which is the composer's job (`composeDurableHouseholdSubject`), not this one's.
 *
 * ── WHY THERE IS NO CHILDREN CARD HERE, AND THAT IS NOT AN OMISSION ──
 *
 * `buildChildrenCardModel` reads `_inquiry_children` — the case's projection of a family's children,
 * shaped by one enrollment. A durable household knows its children through `customer_members`, which
 * is the canonical edge and a different (wider) set: it includes children no enrollment ever touched.
 *
 * Filling `_inquiry_children` from `customer_members` to make that card render would be exactly the
 * case-shaped truth this grain exists to stop copying — the card would claim enrollment framing for
 * children that have none. So the household's children ride on the SUBJECT
 * (`DurableHouseholdSubject.children`, from `customer_members`), and a `children` card at this grain
 * waits for a builder that reads the canonical edge. Silence here is the registry's rule working
 * correctly: an undeclared grain is not an offer.
 */

import { cardAppliesToGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { buildHouseholdCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type {
    FocusPanelCardKey,
    FocusPanelCardModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { DurableHouseholdSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableHouseholdSubjectModel";

export type DeriveHouseholdFocusPanelCardsInput = {
    subject: DurableHouseholdSubject;
};

/**
 * Every household-grain card model, keyed by card.
 *
 * Only keys the registry declares for `household` are built, so "which cards exist on this surface"
 * has ONE authority rather than two that can drift.
 */
export function deriveHouseholdFocusPanelCards(
    input: DeriveHouseholdFocusPanelCardsInput,
): Map<FocusPanelCardKey, FocusPanelCardModel> {
    const cards = new Map<FocusPanelCardKey, FocusPanelCardModel>();
    if (cardAppliesToGrain("household", "household")) {
        cards.set("household", buildHouseholdCardModel(input.subject.truth, input.subject.label));
    }
    return cards;
}
