/**
 * CARD CONCERN: SUPERSESSION — and its composer.
 *
 * ── THE QUESTION IT ANSWERS ──
 *
 * "Has some other card taken over this card's PRESENTATION, and on which subject grains?"
 *
 * A card identity is superseded when a canonical successor now answers the same operator question
 * at the same place. The predecessor key is NOT deleted: it usually still names a live data owner,
 * and every non-card reference to it must keep working. What changes is which card composes.
 *
 * ── WHY A DECLARATION, AND WHY GRAIN-SCOPED ──
 *
 * The first supersession (`current_work → business_process`) was a flat key→key table, which was
 * enough because it applied everywhere. The second one is not global: on a durable PERSON the
 * Employment presentation is superseded by the fuller Staff card, while on a CASE the Employment
 * reference chip — "does anyone on this family work here?" — is a different question and must not
 * move. A flat table cannot express that without lying on one of the two grains.
 *
 * Scope therefore belongs in the declaration, beside `grains`, and is read by one composer. The
 * alternative — `if (grain === "person" && key === "employment")` inside a renderer or normalizer —
 * is the failure mode the registry's design law names outright: "any central switch edited … means
 * a contract is still missing — fix the contract, do not special-case."
 *
 * ── SILENCE MEANS NOT SUPERSEDED ──
 *
 * Absent declaration = the card owns its own presentation everywhere. A card is superseded only
 * because someone declared a successor, never by inference.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";

/**
 * SUPERSESSION concern slice. Optional on a `CardDefinition`; absent means "not superseded".
 *
 * `supersededOnGrains` absent means EVERY grain — a global supersession, which is what
 * `current_work → business_process` is. Listing grains narrows it, which is what Employment needs.
 */
export type CardSupersession = {
    /** The canonical successor that now owns this card's presentation. */
    supersededBy: FocusPanelCardKey;
    /** Grains where the supersession applies. Absent = all grains. */
    supersededOnGrains?: readonly OperationalSubjectType[];
};

/**
 * COMPOSER — the successor that owns this declaration's presentation on this grain, or null.
 *
 * Total and deterministic. When no grain is supplied the answer is the GLOBAL supersession only: a
 * caller that does not know its grain must not be handed a grain-scoped answer, because applying a
 * person-grain rule to a case placement is precisely the defect this concern exists to prevent.
 */
export function successorForDeclaration(
    declaration: Partial<CardSupersession> | undefined,
    grain?: OperationalSubjectType,
): FocusPanelCardKey | null {
    const successor = declaration?.supersededBy;
    if (!successor) return null;
    const scope = declaration.supersededOnGrains;
    if (!scope || scope.length === 0) return successor; // global
    if (!grain) return null; // grain-scoped rule, and the caller did not state a grain
    return scope.includes(grain) ? successor : null;
}
