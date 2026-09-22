/**
 * WHICH LEDGER ROWS A SUBJECT SCOPE INCLUDES — one predicate, because there were five.
 *
 * ── WHAT `subjectMemberId: null` MEANS ──────────────────────────────────────────────────────────
 *
 * It is not "unknown" and not "not applicable". `buildFinancialsCardVM` states the rule where the
 * rows are built:
 *
 *     "Every id this account can be charged against: its enrolment agreements, and the household.
 *      A charge whose source is the household has no child subject, which the ledger renders as the
 *      account rather than inventing an attribution."
 *
 * A row's subject comes from `memberByAgreement.get(billable_source_id)`. A charge billed to the
 * HOUSEHOLD has no agreement, so it resolves to null — deliberately, rather than being attributed to
 * a child who did not incur it. `null` therefore means HOUSEHOLD-GRAIN: it belongs to the account.
 *
 * ── WHY THAT MATTERS ────────────────────────────────────────────────────────────────────────────
 *
 * The Focus Panel sets its subject filter to the child attention is on. Every row filter then read
 * `r.subjectMemberId === subjectFilter`, which is false for every household row — so entering a
 * panel through a child made the household's own charges vanish from the summary, from the ledger,
 * and from payment eligibility. Payment is computed from the filtered rows, so the control simply
 * disappeared.
 *
 * A child-scoped panel says which child the operator is working on. It does not turn a household
 * financial account into a child's account.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────────
 *
 * It does not touch arithmetic. Per-subject reconciliation is computed on the SERVER
 * (`reconciliationBySubject`), which narrows to genuinely child-attributed rows; that is the
 * canonical per-child figure and is unchanged. This governs only which rows a given scope DISPLAYS
 * and can act on.
 */

/**
 * THE DELIBERATE HOUSEHOLD VIEW — "show me only what the account itself owes".
 *
 * Distinct from a child scope, which INCLUDES household rows, and from `all`. An operator
 * administering the account needs to see the household's own obligations without a child's rows
 * mixed in; the Focus Panel's attention model never needed that, but the Workspace does.
 *
 * A member id is a uuid, so this token cannot collide with one.
 */
export const FINANCIALS_HOUSEHOLD_SCOPE = "household";

/**
 * The scope a Financials surface is showing: the whole account, the household alone, or one child.
 *
 * `all` | `"household"` | `<customerMemberId>`. The three are what §2 of the subject-grain doctrine
 * requires an operator to be able to inspect deliberately.
 */
export type FinancialsSubjectScope = "all" | typeof FINANCIALS_HOUSEHOLD_SCOPE | string;

/** A row, narrowed to the only field this rule reads. */
export type FinancialsScopedRow = { subjectMemberId: string | null };

/**
 * Is this row in scope?
 *
 * `all` takes everything. A named child takes that child's rows AND the household's, because a
 * household charge is the account's and the child is inside the account. `household` takes ONLY the
 * account's own rows — the one scope that is deliberately narrower than the account, because it is
 * an explicit request to look at the household by itself rather than an attention context.
 */
export function rowInFinancialsSubjectScope(row: FinancialsScopedRow, scope: FinancialsSubjectScope): boolean {
    if (scope === "all") return true;
    if (scope === FINANCIALS_HOUSEHOLD_SCOPE) return row.subjectMemberId == null;
    // Household-grain: the account's own charge, visible from anywhere inside the account.
    if (row.subjectMemberId == null) return true;
    return row.subjectMemberId === scope;
}

/** The rows in scope, in their original order. */
export function financialsRowsInSubjectScope<T extends FinancialsScopedRow>(
    rows: readonly T[],
    scope: FinancialsSubjectScope,
): T[] {
    return rows.filter((row) => rowInFinancialsSubjectScope(row, scope));
}

/**
 * ── THE SECOND SCOPE DIMENSION ──────────────────────────────────────────────────────────────────
 *
 * Subject scope answers WHOSE financial truth is relevant. Period scope answers WHICH PART of that
 * truth belongs in a current-period summary. They are independent, and one must never be solved by
 * abusing the other.
 *
 * The compact card states this period's responsibility and balance, so its Payment control may only
 * settle this period. A prior-period obligation is not hidden — the Details ledger crosses periods
 * deliberately, and that is where it stays reachable and explained.
 *
 * Found on the deployed build: Wrigley's September was settled in full, yet Compact offered Payment
 * against an AUGUST registration fee, because eligibility was drawn from rows scoped by subject but
 * never by period. The subject-filter defect had been masking it.
 */

/** A row, narrowed to the fields payment eligibility reads. */
export type FinancialsPayableRow = FinancialsScopedRow & {
    periodKey: string | null;
    offersPayment: boolean;
};

/**
 * What the COMPACT card may offer to settle: in subject scope, in the stated period, able to take
 * money. All three, because each excludes a different thing for a different reason.
 */
export function compactPayableRows<T extends FinancialsPayableRow>(
    rows: readonly T[],
    scope: FinancialsSubjectScope,
    currentPeriodKey: string | null,
): T[] {
    return financialsRowsInSubjectScope(rows, scope).filter(
        (row) => row.offersPayment && row.periodKey === currentPeriodKey,
    );
}

/**
 * What the DEPTH surfaces may offer: in subject scope and able to take money, across every period.
 *
 * Deliberately NOT period-bound. The ledger shows the account over time, so a prior-period
 * obligation must remain settleable from it.
 */
export function ledgerPayableRows<T extends FinancialsPayableRow>(
    rows: readonly T[],
    scope: FinancialsSubjectScope,
): T[] {
    return financialsRowsInSubjectScope(rows, scope).filter((row) => row.offersPayment);
}

