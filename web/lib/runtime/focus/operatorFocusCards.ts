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
} = {
    children: "children",
    household: "household",
    /** "Assignments" in the operator's vocabulary — placement / schedule work. */
    assignment: "scheduling",
    /** "What's Next" — where process participation is worked. */
    currentWork: "current_work",
};
