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
import type {
    FinancialSubjectCohort,
    FinancialSubjectFacet,
} from "@/lib/financials/workspace/resolveFinancialSubjects";

/**
 * WHAT IS KNOWN ABOUT THIS ROW'S MONEY.
 *
 * Three states, and the distinction between the middle two is a correctness requirement rather
 * than a nicety. `known_zero` is an ANSWER — the account was looked at and carries nothing.
 * `not_yet_known` is the ABSENCE of an answer, and rendering it as the same zero would tell an
 * operator that a household owing $2,023.87 is settled.
 *
 * `unavailable` is the failure case: position was asked and could not answer. The row stays
 * usable — it can still be found, filtered by name and opened — because a household an operator
 * cannot reach is worse than one whose balance is temporarily unreadable.
 */
export type AccountFinancialTruth = "known" | "known_zero" | "not_yet_known" | "unavailable";

/** True only when the money on this row means something. */
export function accountMoneyIsKnown(row: { financialTruth: AccountFinancialTruth }): boolean {
    return row.financialTruth === "known" || row.financialTruth === "known_zero";
}

export type AccountRow = {
    financialTruth: AccountFinancialTruth;
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
    /**
     * IDENTITY AND PLACEMENT, CARRIED FOR THE QUEUE CONTROLS — see `accountQueue`.
     *
     * These decide whether a row is LISTED and nothing else. They are the subject cohort's, read
     * from canonical membership and placement; a row that the position cohort contributed but the
     * subject read did not reach carries none of them, which narrows that row out of a facet filter
     * rather than inventing a program for it.
     */
    childNames: string[];
    contactNames: string[];
    programs: FinancialSubjectFacet[];
    rooms: FinancialSubjectFacet[];
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
            /* These rows exist because position spoke for them, so their money is known. */
            financialTruth: "known" as AccountFinancialTruth,
            hasEnrollmentAgreement: false,
            childNames: [],
            contactNames: [],
            programs: [],
            rooms: [],
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
    /*
     * NULL means position has not answered yet. It is not an empty cohort: an empty cohort is the
     * statement "these households have no posted money", and that is a different sentence.
     */
    cohort: FinancialPositionCohort | null,
    /*
     * ── WHY ORDER IS PART OF THIS SIGNATURE ────────────────────────────────────────────────────
     *
     * Subjects owns which rows exist and in what canonical order. The settled list is ordered by
     * money — outstanding first — which cannot be known until position answers. So a progressive
     * list has exactly two honest choices: withhold the rows until the order is knowable, or show
     * them in the subject cohort's order and let the order settle with the money.
     *
     * This takes the second. Row IDENTITY never changes and no row appears or disappears; only the
     * order resolves, once, when position lands. Withholding the rows is the thing the slice is
     * removing, and reordering by a figure nobody has yet would be inventing one.
     */
    positionTruth: "resolved" | "pending" | "unavailable" = "resolved",
): AccountRow[] {
    const position = cohort ? groupPositionByAccount(cohort) : new Map<string, AccountRow>();
    const pending = positionTruth !== "resolved";
    const absentTruth: AccountFinancialTruth = positionTruth === "unavailable" ? "unavailable" : "not_yet_known";
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
                      financialTruth: "known" as AccountFinancialTruth,
                      // The household's own name is the subject cohort's to give; the position
                      // cohort reads the same column and either may be the one that has it.
                      householdName: subject.householdName ?? posted.householdName,
                      noActivity: false,
                      hasEnrollmentAgreement: subject.hasEnrollmentAgreement,
                      childNames: subject.childNames,
                      contactNames: subject.contactNames,
                      programs: subject.programs,
                      rooms: subject.rooms,
                  }
                : {
                      /*
                       * KNOWN ZERO only when position actually answered. Otherwise the zeros below
                       * are placeholders for an answer nobody has, and the discriminator says so.
                       */
                      financialTruth: (pending ? absentTruth : "known_zero") as AccountFinancialTruth,
                      customerId: subject.customerId,
                      householdName: subject.householdName,
                      currencyCode: DEFAULT_CURRENCY_CODE,
                      outstandingCents: 0,
                      collectibleCents: 0,
                      suppressionCents: 0,
                      varianceCents: 0,
                      charges: 0,
                      hasOrgScoped: false,
                      noActivity: !pending,
                      hasEnrollmentAgreement: subject.hasEnrollmentAgreement,
                      childNames: subject.childNames,
                      contactNames: subject.contactNames,
                      programs: subject.programs,
                      rooms: subject.rooms,
                  },
        );
    }

    for (const [customerId, posted] of position) {
        if (seen.has(customerId)) continue;
        rows.push({ ...posted, noActivity: false, financialTruth: "known" });
    }

    /*
     * While position is pending every row's money is the same placeholder, so the money comparator
     * would be comparing nothing and the result would be arbitrary. The subject cohort's canonical
     * order — household name — is the only order that is true at this moment.
     */
    if (pending) {
        return rows.sort((a, b) => (a.householdName ?? "").localeCompare(b.householdName ?? ""));
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
export function accountState(
    account: AccountRow,
): "outstanding" | "with_agency" | "variance" | "settled" | "no_activity" | "not_yet_known" | "unavailable" {
    /*
     * ── THE TRAP THIS CLOSES ───────────────────────────────────────────────────────────────────
     *
     * Every branch below reads position money, and the last one is a bare fallthrough. A row whose
     * position has not arrived carries zeros, so it fell past `outstanding`, past `with_agency`,
     * past `variance`, and came out SETTLED — and then dropped out of the Outstanding filter while
     * wearing a Settled chip. The absence of an answer is not an answer, and it is decided first.
     */
    if (account.financialTruth === "not_yet_known") return "not_yet_known";
    if (account.financialTruth === "unavailable") return "unavailable";
    if (account.outstandingCents > 0) return "outstanding";
    if (account.suppressionCents > 0) return "with_agency";
    if (account.varianceCents !== 0) return "variance";
    return account.noActivity ? "no_activity" : "settled";
}
