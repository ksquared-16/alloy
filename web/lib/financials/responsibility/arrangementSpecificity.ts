/**
 * WHICH ARRANGEMENT GOVERNS — one rule, in one place.
 *
 * Responsibility is configurable at two canonical grains: the HOUSEHOLD (`customer_member_id`
 * null) and a CHILD (`customer_member_id` set). Where both apply to the same question, the more
 * specific one wins and, within a grain, the latest start does — the database's exclusion
 * constraint refuses overlap inside a grain, so there is never a tie this has no rule for.
 *
 * ── WHY IT IS ITS OWN MODULE ──────────────────────────────────────────────────────────────────
 *
 * `readArrangementInForce` implemented this rule. `readAccountArrangement` did not implement it at
 * all: it filtered on `customer_id` and `state` and took the newest `effective_start` regardless of
 * grain. So on a household holding both a household arrangement and a later child-scoped one, it
 * returned the CHILD's arrangement and the charge detail presented it as the account's — naming a
 * party and an amount that govern one child, and anchoring that child's shares as the ones an
 * operator funds "for the account".
 *
 * Two readers of one model gave two answers because the rule lived in one of them. It lives here
 * now, pure and shared, so a third reader cannot invent a third answer.
 */

/** The shape both readers already have in hand — nothing is fetched to compare. */
export type ArrangementCandidate = {
    id: string;
    customerMemberId: string | null;
    effectiveStart: string | null;
    effectiveEnd: string | null;
};

/** Does this arrangement apply to the asked-about grain at all? */
export function arrangementAppliesTo(
    candidate: Pick<ArrangementCandidate, "customerMemberId">,
    /** The child being asked about, or null to ask only about the household grain. */
    customerMemberId: string | null,
): boolean {
    if (candidate.customerMemberId === null) return true;
    /*
     * A child-scoped arrangement is NOT an answer to a household-grain question. Asking "what does
     * this account arrange" and being handed one child's arrangement is the defect this replaces.
     */
    return customerMemberId !== null && candidate.customerMemberId === customerMemberId;
}

/** Is it in force on this date? An open end never expires. */
export function arrangementInForceOn(
    candidate: Pick<ArrangementCandidate, "effectiveStart" | "effectiveEnd">,
    onDate: string,
): boolean {
    const start = (candidate.effectiveStart ?? "").trim();
    if (start && start > onDate) return false;
    const end = (candidate.effectiveEnd ?? "").trim();
    return !end || end >= onDate;
}

/**
 * The governing arrangement among the candidates, or null.
 *
 * `onDate` omitted means "do not date-filter" — the account-wide reader has always answered
 * "is there an arrangement on record" rather than "which one applies today", and narrowing that
 * silently would make an existing arrangement disappear from a screen that offers to create one.
 */
export function pickGoverningArrangement<T extends ArrangementCandidate>(
    candidates: readonly T[],
    args: { customerMemberId: string | null; onDate?: string },
): T | null {
    const eligible = candidates
        .filter((c) => arrangementAppliesTo(c, args.customerMemberId))
        .filter((c) => (args.onDate ? arrangementInForceOn(c, args.onDate) : true));
    if (eligible.length === 0) return null;
    return [...eligible].sort(compareBySpecificityThenStart)[0]!;
}

/** Most specific first; within a grain, the latest start first. */
export function compareBySpecificityThenStart(a: ArrangementCandidate, b: ArrangementCandidate): number {
    const specificity = Number(b.customerMemberId !== null) - Number(a.customerMemberId !== null);
    if (specificity !== 0) return specificity;
    return (a.effectiveStart ?? "") < (b.effectiveStart ?? "") ? 1 : -1;
}
