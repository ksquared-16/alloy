/**
 * A packet question that is asking about a safeguarding restriction.
 *
 * Until Slice 6 these questions had no owner and were HELD. The owner now exists
 * (`child_safeguarding_restrictions`), so they bind — as a proposal an operator approves, like every
 * other proposal. What they must never do is flatten into a generic child field: "is there a
 * restraining order?" answered into a text box on a child profile is the free-text `custody_notes`
 * failure with extra steps.
 *
 * The kind is read from the question, not guessed from the section. A custody arrangement and a
 * protective order are different kinds with different evidence expectations, and the operational
 * EFFECT is deliberately not inferred here — a form question rarely states the terms of an order,
 * and inventing "may not pick up" from "is there a restraining order?" would be Alloy deciding what
 * a court decided.
 *
 * Pure + deterministic. No I/O.
 */

import type { BusinessConceptCandidate } from "./contracts";
import type { SafeguardingRestrictionKind } from "@/lib/safeguarding/safeguardingRestriction";

interface KindRule {
    kind: SafeguardingRestrictionKind;
    test: RegExp;
}

/**
 * Order matters: a restraining order mentioned alongside custody is a protective order first.
 */
const KIND_RULES: readonly KindRule[] = [
    {
        kind: "protective_or_restraining_order",
        test: /\b(restraining order|protective order|protection order|court order)\b/i,
    },
    {
        kind: "pickup_or_contact_restriction",
        test: /\b(not permitted to (?:pick ?up|collect)|pick-?up restriction|unauthorized pick|do not release|may not (?:pick ?up|collect))\b/i,
    },
    {
        kind: "custody_restriction",
        test: /\b(custody|visitation|visiting arrangements?|guardianship order)\b/i,
    },
];

export function safeguardingConceptKind(
    concept: Pick<BusinessConceptCandidate, "label" | "concept_key">,
): SafeguardingRestrictionKind | null {
    const text = `${concept.label} ${(concept.concept_key ?? "").replace(/[._]/g, " ")}`;
    for (const rule of KIND_RULES) {
        if (rule.test.test(text)) return rule.kind;
    }
    return null;
}

/** Operator language for the proposal. Never ontology jargon. */
export const SAFEGUARDING_KIND_LABELS: Readonly<Record<SafeguardingRestrictionKind, string>> = {
    custody_restriction: "Custody or visiting arrangement",
    protective_or_restraining_order: "Protective or restraining order",
    pickup_or_contact_restriction: "Pickup or contact restriction",
};
