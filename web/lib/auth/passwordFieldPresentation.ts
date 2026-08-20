/**
 * W-30 / `IA-R10`, `07/AU-2` — the show/hide baseline, as semantics rather than as markup.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §18.
 *
 * §18 verified *"three password inputs… **zero** reveal toggles"* and calls this *"the cheapest item
 * in the corpus"*, unscheduled for eight days *"not because it was hard or blocked, but because the
 * wave it belonged to did not exist."* Re-verified this session at the same three inputs
 * (`login/page.tsx:205`, `reset-password/page.tsx:157`, `:175`).
 *
 * The requirements `04…§6.2` states are all semantic — *defaults hidden; the toggle is a real button
 * with an accessible label, keyboard reachable; never auto-reveals; revealed state never persisted
 * or logged* — so they live here, where they can be asserted without a browser, instead of only
 * inside a component whose behaviour would then be provable only by rendering it. `IA-7`'s lesson in
 * this initiative is that a fact which exists only in presentation is a fact nothing can check.
 */

/** Everything the field renders that depends on whether the value is currently revealed. */
export type PasswordFieldPresentation = {
    /** `password` when hidden. The reveal is a type swap, not a second input holding the value. */
    inputType: "password" | "text";
    /** The toggle's accessible name. States the ACTION, which is what a screen reader needs. */
    toggleLabel: string;
    /** The visible text on the toggle. */
    toggleText: string;
    /** `aria-pressed`, so assistive tech can read the current state and not just the action. */
    ariaPressed: "true" | "false";
};

/** The initial state of every password field in the product. Named so no caller can start revealed. */
export const PASSWORD_FIELD_STARTS_HIDDEN = false;

/**
 * The presentation for a given reveal state.
 *
 * Total over the two states and pure, so "defaults hidden" is a property of the default argument
 * rather than of a `useState` call some future caller could initialise differently.
 */
export function passwordFieldPresentation(
    revealed: boolean = PASSWORD_FIELD_STARTS_HIDDEN,
): PasswordFieldPresentation {
    return revealed
        ? {
              inputType: "text",
              toggleLabel: "Hide password",
              toggleText: "Hide",
              ariaPressed: "true",
          }
        : {
              inputType: "password",
              toggleLabel: "Show password",
              toggleText: "Show",
              ariaPressed: "false",
          };
}

/**
 * The next reveal state for a toggle press.
 *
 * Exists as a named function so *"never auto-reveals"* is checkable: the only transition into a
 * revealed state in the product is this one, and it takes an explicit press to reach.
 */
export function togglePasswordReveal(revealed: boolean): boolean {
    return !revealed;
}
