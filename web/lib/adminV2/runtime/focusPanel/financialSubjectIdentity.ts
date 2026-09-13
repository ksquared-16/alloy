/**
 * ONE RULE FOR "DOES THIS SUBJECT HAVE A FINANCIAL ACCOUNT?" — asked identically everywhere.
 *
 * ── WHY THIS MODULE EXISTS ──
 *
 * The Focus Panel decided that question in three places, and they were free to disagree:
 *
 *   · the mountability registry, deciding whether Financials may mount at COMMIT;
 *   · `deriveOpportunityFocusPanelCards`, which places Financials at SETTLEMENT from configuration
 *     and asks nothing at all;
 *   · the card itself, which re-listed the same truth keys privately to address its own read.
 *
 * That is not a tidiness complaint. It produced a state the product law says is impossible: on a
 * Waitlist record whose case carries a customer, Financials was refused at commit, placed at
 * settlement anyway, and then rendered its terminal "account unavailable" beside an Enrollment card
 * and a Children card that had both fully resolved the same family. The operator reads that as a
 * statement about their money.
 *
 * So the rule lives here, once, and every path imports it. Two surfaces may still legitimately do
 * DIFFERENT THINGS with the answer — mount, reserve, or wait — but they may no longer compute a
 * different answer.
 *
 * ── WHAT THIS IS NOT ──
 *
 * Not an eligibility policy, and not a permission. Whether an operator may SEE financial work is
 * `fin.read`, enforced server-side on every financial route. This answers only the identity
 * question: is there an account for this subject to be about.
 *
 * It performs no I/O. It reads the composed subject truth the panel already holds — the identity is
 * loaded long before this is asked, and a resolver that went back to the database would be admitting
 * the composition failed to carry what it had.
 */
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * The keys a household account can arrive under, in preference order.
 *
 * Ordered, not a set: `customer.id` is the composer's own canonical declaration and wins over the
 * flatter aliases a raw record may carry. `child.family_customer_id` is here because a child's
 * family account IS the household account — the same customer, reached from the other grain.
 */
export const HOUSEHOLD_IDENTITY_TRUTH_KEYS = [
    "customer.id",
    "household.id",
    "child.family_customer_id",
    "customer_id",
] as const;

/**
 * The canonical customer this subject's money belongs to, or null when the composed truth names
 * none.
 *
 * Null is a real answer and must stay one: a subject with genuinely no account exists, and inventing
 * an id for it would put one family's money on another's screen. What null must NEVER mean is "the
 * composition had it and did not carry it" — that is the defect this module was extracted for.
 */
export function resolveFinancialSubjectId(context: OperationalContext): string | null {
    const truth = context.truth as Record<string, unknown>;
    for (const key of HOUSEHOLD_IDENTITY_TRUTH_KEYS) {
        const value = truth[key];
        const trimmed = value != null ? String(value).trim() : "";
        if (trimmed) return trimmed;
    }
    return null;
}

/** Present means a non-blank value. A key carrying `""` is an absent identity, not an empty one. */
export function hasFinancialSubject(context: OperationalContext): boolean {
    return resolveFinancialSubjectId(context) !== null;
}
