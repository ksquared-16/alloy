/**
 * THE DOMAIN'S ELIGIBILITY REASONS, IN OPERATOR WORDS.
 *
 * A LABEL for a canonical reason, never a reason of its own: an unmapped code still renders,
 * spelled out, rather than being hidden.
 *
 * ── WHY THIS IS SHARED ────────────────────────────────────────────────────────────────────────
 *
 * Assignment and the family Discount surface answer the same question about the same policy at
 * two grains. When each kept its own vocabulary they drifted immediately — one said "Excluded for
 * this assignment", the other "Excluded — an exception applies" — and an operator moving between
 * them could not tell whether they were reading one fact or two. One map, both surfaces.
 *
 * ── THE DISTINCTION THIS EXISTS FOR ───────────────────────────────────────────────────────────
 *
 * `excluded_by_exception` is not "no discount" and not "off". Somebody DECIDED this policy does
 * not apply here, and the surface says so in those words so the operator goes looking for the
 * decision rather than for missing configuration.
 */
export const REDUCTION_REASON_LABEL: Record<string, string> = {
    no_policy_configured: "No discount policies configured",
    not_enough_siblings: "Not eligible — not enough enrolled siblings",
    rank_not_covered: "Not eligible — this child's sibling rank is not covered",
    not_an_employee_household: "Not eligible — not an employee household",
    category_not_covered: "Not eligible — tuition is not covered by a policy",
    category_not_discountable: "Not eligible — this charge category cannot be discounted",
    no_accepted_gross: "No accepted tuition to forecast against",
    excluded_by_exception: "Excluded for this assignment",
};

/** The label, or the code spelled out — never silence, and never a guess. */
export function reductionReasonLabel(reason: string): string {
    return REDUCTION_REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
}
