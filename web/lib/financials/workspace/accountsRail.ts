/**
 * THE ACCOUNTS RAIL'S COHORT — eligible financial subjects LEFT JOIN current financial position.
 *
 * Extracted from the section so the join is testable without mounting a surface, and so it is
 * plainly what it is: logic about WHICH households Accounts lists, and never a second opinion about
 * what any of them owe. Nothing here computes money. Every figure is summed from figures the server
 * produced by `computeCollectiblePosition`; a household with no charges contributes no figures, and
 * the zero it shows is the absence of money rather than a number this file derived.
 *
 * Why the join exists at all is recorded on the section that renders it: Accounts answers "which
 * household financial accounts can I understand or operate", not "which households already have
 * posted financial activity", and a family is a financial subject before its first transaction.
 */

import { DEFAULT_CURRENCY_CODE } from "@/lib/financials/billableSource";
import type { FinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import type { FinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";

export type AccountRow = {
    customerId: string;
    householdName: string | null;
    currencyCode: string;
    outstandingCents: number;
    collectibleCents: number;
    suppressionCents: number;
    varianceCents: number;
    charges: number;
    /** True when at least one charge on the account belongs to no site. */
    hasOrgScoped: boolean;
    /**
     * No posted charge in scope. A FINANCIAL STATE, not a defect and not a missing read — the
     * account exists, has been looked at, and carries nothing.
     */
    noActivity: boolean;
    /** Reported by the subject cohort. Never a gate on being listed. */
    hasEnrollmentAgreement: boolean;
};

/** Grouping, not arithmetic on meaning: each field is summed from figures the server produced. */
function groupPositionByAccount(cohort: FinancialPositionCohort): Map<string, AccountRow> {
    const byAccount = new Map<string, AccountRow>();
    for (const row of cohort.rows) {
        if (!row.customerId) continue;
        const existing = byAccount.get(row.customerId) ?? {
            customerId: row.customerId,
            householdName: row.householdName,
            currencyCode: row.position.currencyCode,
            outstandingCents: 0,
            collectibleCents: 0,
            suppressionCents: 0,
            varianceCents: 0,
            charges: 0,
            hasOrgScoped: false,
            noActivity: false,
            hasEnrollmentAgreement: false,
        };
        existing.outstandingCents += row.position.outstandingCents;
        existing.collectibleCents += row.position.currentlyCollectibleCents;
        existing.suppressionCents += row.position.submittedClaimSuppressionCents;
        existing.varianceCents += row.position.unresolvedVarianceCents;
        existing.charges += 1;
        if (row.locationScope === "org") existing.hasOrgScoped = true;
        byAccount.set(row.customerId, existing);
    }
    return byAccount;
}

/**
 * THE JOIN. Eligible subjects on the left, this period's position on the right.
 *
 * ── WHY THE RIGHT SIDE CAN STILL ADD ROWS ──
 *
 * The subject read is capped and can be truncated, and a household that demonstrably carries posted
 * money must never be dropped because it fell off the far side of a household page. So accounts
 * present in the position cohort but absent from the subject cohort are appended rather than
 * discarded: they passed the same location contract at charge grain, and losing one would be the
 * exact regression this rail was rebuilt to prevent, in the other direction.
 *
 * ── AND WHY A SETTLED HOUSEHOLD IS STILL A HOUSEHOLD ──
 *
 * The rail ORDERS by attention instead of filtering by it — money owed first, then money held with
 * an agency, then open variance, then accounts that have moved money and settled, then accounts
 * that have not moved any. Nothing is hidden; what needs a decision floats.
 */
export function joinAccounts(
    subjects: FinancialSubjectCohort,
    cohort: FinancialPositionCohort,
): AccountRow[] {
    const position = groupPositionByAccount(cohort);
    const rows: AccountRow[] = [];
    const seen = new Set<string>();

    for (const subject of subjects.subjects) {
        if (!subject.customerId || seen.has(subject.customerId)) continue;
        seen.add(subject.customerId);
        const posted = position.get(subject.customerId);
        rows.push(
            posted
                ? {
                      ...posted,
                      // The household's own name is the subject cohort's to give; the position
                      // cohort reads the same column and either may be the one that has it.
                      householdName: subject.householdName ?? posted.householdName,
                      noActivity: false,
                      hasEnrollmentAgreement: subject.hasEnrollmentAgreement,
                  }
                : {
                      customerId: subject.customerId,
                      householdName: subject.householdName,
                      currencyCode: DEFAULT_CURRENCY_CODE,
                      outstandingCents: 0,
                      collectibleCents: 0,
                      suppressionCents: 0,
                      varianceCents: 0,
                      charges: 0,
                      hasOrgScoped: false,
                      noActivity: true,
                      hasEnrollmentAgreement: subject.hasEnrollmentAgreement,
                  },
        );
    }

    for (const [customerId, posted] of position) {
        if (seen.has(customerId)) continue;
        rows.push({ ...posted, noActivity: false });
    }

    return rows.sort(
        (a, b) =>
            b.outstandingCents - a.outstandingCents
            || b.suppressionCents - a.suppressionCents
            || Math.abs(b.varianceCents) - Math.abs(a.varianceCents)
            || b.charges - a.charges
            || (a.householdName ?? "").localeCompare(b.householdName ?? ""),
    );
}

/** The word the row wears, and the one an assertion can read. */
export function accountState(account: AccountRow): "outstanding" | "with_agency" | "variance" | "settled" | "no_activity" {
    if (account.outstandingCents > 0) return "outstanding";
    if (account.suppressionCents > 0) return "with_agency";
    if (account.varianceCents !== 0) return "variance";
    return account.noActivity ? "no_activity" : "settled";
}
