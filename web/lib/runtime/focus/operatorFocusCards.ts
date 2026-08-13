import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * The Focus Panel cards an operator gesture can name, in ONE place.
 *
 * Every migrated drawer caller answers the same question — "which card should the operator land on?"
 * — and before this they answered it with a bare string each. A card rename then silently broke the
 * destination: an unknown key is ignored by the grid, so the panel composes correctly and simply does
 * not elevate, which reads as "nothing happened" rather than as an error.
 *
 * The `FocusPanelCardKey` annotation is the guard. A renamed or removed card fails the build here,
 * once, instead of degrading every caller at runtime. `assignment` is the operator's word for the
 * `scheduling` card — the vocabulary gap is real, and this is where it is reconciled rather than in
 * each caller.
 */
export const OPERATOR_FOCUS_CARDS: {
    children: FocusPanelCardKey;
    household: FocusPanelCardKey;
    assignment: FocusPanelCardKey;
    currentWork: FocusPanelCardKey;
    tour: FocusPanelCardKey;
    documents: FocusPanelCardKey;
    employment: FocusPanelCardKey;
} = {
    children: "children",
    household: "household",
    /** "Assignments" in the operator's vocabulary — placement / schedule work. */
    assignment: "scheduling",
    /**
     * "What's Next" — where process participation is worked, and where the per-child Decision
     * paths and Close family live. A gesture that means "act on this work" names this card.
     */
    currentWork: "current_work",
    /** Tour state and its scheduling actions. */
    tour: "tour_summary",
    /** Uploaded documents — the packet a review action acts on. */
    documents: "documents",
    /**
     * Whether this person works here, and in what capacity. The card a STAFF gesture names —
     * a roster or attendance surface pointing at a staff member means "show me this person's
     * standing here", which is the employment answer, not the family's enrollment work.
     */
    employment: "employment",
};
