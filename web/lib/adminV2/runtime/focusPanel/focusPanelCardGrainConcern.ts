/**
 * CARD CONCERN: SUBJECT-GRAIN APPLICABILITY — and its composer.
 *
 * The third concern folded into the Focus Panel card registry (after IDENTITY.title and LIFECYCLE),
 * following the registry's design law: a concern is a small, separately-typed contract owned by its
 * own module, read by its own composer, with existing cards untouched.
 *
 * ── THE QUESTION IT ANSWERS ──
 *
 * "Which subjects can this card compose for?" Until now the answer was universal and implicit: every
 * one of the 23 card keys is annotated `@grain case`, and `focusPanelCardModel.ts` claimed child-grain
 * cards "are defined separately" with nothing behind the claim. A second subject grain therefore had
 * no way to select a card set — it would either render the enrollment cards or render nothing.
 *
 * ── WHY A DECLARATION AND NOT A SELECTOR SWITCH ──
 *
 * The alternative was a central `if (grain === "person") return [...]` list. That is the failure mode
 * `SECOND-SURFACE-CERTIFICATION-DESIGN.md` §5 names explicitly: "any central switch edited … means a
 * contract is still missing — fix the contract, do not special-case." A per-card declaration read by
 * one composer scales to 300 cards across 40 products; a central list does not.
 *
 * ── THE DEFAULT IS `opportunity`, AND THAT IS DELIBERATE ──
 *
 * An undeclared card is case-only. Every existing card is case-grain in fact, so the default states
 * the truth rather than a migration convenience, and no existing declaration had to change. The
 * consequence worth naming: a NEW card is case-only until it says otherwise. Silence never widens
 * applicability — a card appears on a person surface only because someone declared that it can.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";

/**
 * GRAIN concern slice. Optional on a `CardDefinition`; absent means {@link DEFAULT_CARD_GRAINS}.
 *
 * A card lists every subject grain it can TRUTHFULLY compose for. "Truthfully" is the whole bar: the
 * card must have canonical data for that subject, not merely tolerate rendering against it. A card
 * that would show an empty shell on a grain does not belong to that grain.
 */
export type CardGrainApplicability = {
    grains: readonly OperationalSubjectType[];
};

/** An undeclared card is case-only. Silence never widens applicability. */
export const DEFAULT_CARD_GRAINS: readonly OperationalSubjectType[] = ["opportunity"];

/** The grains a declaration admits — its own list, or the case-only default. */
export function grainsForDeclaration(
    declaration: Partial<CardGrainApplicability> | undefined
): readonly OperationalSubjectType[] {
    const declared = declaration?.grains;
    return declared && declared.length > 0 ? declared : DEFAULT_CARD_GRAINS;
}

/**
 * COMPOSER — does this declaration apply to this subject grain?
 *
 * Deterministic and total: an unknown card (no declaration at all) is not applicable to anything but
 * the case grain, which is what "the platform has never heard of this card on your surface" should
 * mean. It never throws, so an unsupported grain/card pair is OMITTED rather than crashing a
 * renderer or reserving an empty cell that pretends applicability.
 */
export function declarationAppliesToGrain(
    declaration: Partial<CardGrainApplicability> | undefined,
    grain: OperationalSubjectType
): boolean {
    return grainsForDeclaration(declaration).includes(grain);
}

/** Keys from a declared set that apply to `grain`, in the set's own order. */
export function filterCardKeysForGrain<T extends { key: FocusPanelCardKey } & Partial<CardGrainApplicability>>(
    declarations: readonly T[],
    grain: OperationalSubjectType
): FocusPanelCardKey[] {
    return declarations.filter((d) => declarationAppliesToGrain(d, grain)).map((d) => d.key);
}
