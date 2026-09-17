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

/** The scope a Financials surface is showing: the whole account, or one child. */
export type FinancialsSubjectScope = "all" | string;

/** A row, narrowed to the only field this rule reads. */
export type FinancialsScopedRow = { subjectMemberId: string | null };

/**
 * Is this row in scope?
 *
 * `all` takes everything. A named child takes that child's rows AND the household's, because a
 * household charge is the account's and the child is inside the account.
 */
export function rowInFinancialsSubjectScope(row: FinancialsScopedRow, scope: FinancialsSubjectScope): boolean {
    if (scope === "all") return true;
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
