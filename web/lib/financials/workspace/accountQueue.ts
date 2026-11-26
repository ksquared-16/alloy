/**
 * NARROWING THE ACCOUNTS QUEUE — and never, under any circumstance, the money in it.
 *
 * ── THE ONE RULE THIS MODULE KEEPS ─────────────────────────────────────────────────────────────
 *
 * Search, Program and Room decide which households are LISTED. They do not decide what any of them
 * owes. A filter that could change a balance would mean an operator could make a family's debt
 * smaller by typing in a box, and the two answers would then differ depending on how the surface
 * was looked at. So every function here takes rows and returns a SUBSET of the same rows: nothing
 * is summed, nothing is recomputed, and no figure is touched on the way through.
 *
 * Site is deliberately absent. The Financials workspace already owns site scope, it is resolved
 * server-side, and a second site control inside the rail would be a second answer to a question
 * that has one — see the site-scope note on `resolveFinancialSubjects`.
 *
 * ── AND WHY SELECTION LIVES HERE TOO ───────────────────────────────────────────────────────────
 *
 * "Which account is open" is a consequence of the cohort, so it belongs beside the cohort rather
 * than inside a component's effects. Keeping it pure is what lets the four rules below be asserted
 * without mounting anything: open on the first account, keep an explicit choice, follow the cohort
 * when the choice falls out of it, and never fabricate a selection over an empty cohort.
 */

import { accountMoneyIsKnown, accountState, type AccountRow } from "@/lib/financials/workspace/accountsRail";
import type { FinancialSubjectFacet } from "@/lib/financials/workspace/resolveFinancialSubjects";

export type AccountQueueFilter = {
    /** Free text over household, child and responsible-adult names. Empty means no narrowing. */
    search: string;
    /** `location_program_categories.id`, or null for every program. */
    programId: string | null;
    /** `locations.id` of the room, or null for every room. */
    roomId: string | null;
    /**
     * THE ACCOUNT'S FINANCIAL STATE, in the rail's own canonical vocabulary.
     *
     * Not a new classification: it is exactly `accountState`, the precedence the rows already wear
     * as chips. Filtering and labelling therefore cannot disagree, which is the failure mode of a
     * queue whose filter computes one answer and whose badge computes another.
     */
    state: AccountStateFilter | null;
};

/** The states `accountState` can return. A filter value outside them would match nothing. */
export type AccountStateFilter = "outstanding" | "with_agency" | "variance" | "settled" | "no_activity";

export const ACCOUNT_STATE_FILTERS: ReadonlyArray<{ value: AccountStateFilter; label: string }> = Object.freeze([
    { value: "outstanding", label: "Outstanding" },
    { value: "with_agency", label: "Funding expected" },
    { value: "variance", label: "Variance open" },
    { value: "settled", label: "Settled" },
    { value: "no_activity", label: "No financial activity" },
]);

export const NO_ACCOUNT_FILTER: AccountQueueFilter = Object.freeze({
    search: "",
    programId: null,
    roomId: null,
    state: null,
});

export function isAccountFilterActive(filter: AccountQueueFilter): boolean {
    return Boolean(filter.search.trim() || filter.programId || filter.roomId || filter.state);
}

/**
 * How many of the ADVANCED filters are on — the number on the Filters button.
 *
 * Search is excluded deliberately: it has its own always-visible field, and counting it would make
 * the button claim a narrowing the operator can already see in the box beside it.
 */
export function advancedFilterCount(filter: AccountQueueFilter): number {
    return [filter.state, filter.programId, filter.roomId].filter(Boolean).length;
}

/**
 * Every name this row can be found by.
 *
 * The household's own name, its children, and the adults responsible for it — the three things an
 * operator actually types. All three are canonical identity carried on the subject row; none is a
 * Financials-owned index, and none is a financial fact.
 */
export function searchableNames(row: AccountRow): string[] {
    return [row.householdName ?? "", ...row.childNames, ...row.contactNames].filter(Boolean);
}

function matchesSearch(row: AccountRow, needle: string): boolean {
    if (!needle) return true;
    const lowered = needle.toLowerCase();
    return searchableNames(row).some((name) => name.toLowerCase().includes(lowered));
}

export function filterAccounts(rows: readonly AccountRow[], filter: AccountQueueFilter): AccountRow[] {
    const needle = filter.search.trim().toLowerCase();
    return rows.filter((row) => {
        if (!matchesSearch(row, needle)) return false;
        /*
         * ── AN UNRESOLVED ROW IS NOT SILENTLY EXCLUDED ─────────────────────────────────────────
         *
         * The state filter is answered from position money. While position is pending the answer
         * does not exist yet, and there are only two honest options: hold the classification, or
         * represent the unresolved membership. Dropping the row is neither — it would tell an
         * operator filtering by Outstanding that a household owing $2,023.87 is not outstanding,
         * which is the exact failure the three-state contract exists to prevent.
         *
         * So an unresolved row is RETAINED under every state filter and wears its reserved
         * treatment. When position lands it is classified for real and leaves if it does not
         * belong. The count beside the control says how many are still unresolved, so the operator
         * is never shown a narrowed list that quietly claims to be complete.
         */
        if (filter.state && !accountMoneyIsKnown(row)) return true;
        if (filter.state && accountState(row) !== filter.state) return false;
        if (filter.programId && !row.programs.some((p) => p.id === filter.programId)) return false;
        if (filter.roomId && !row.rooms.some((r) => r.id === filter.roomId)) return false;
        return true;
    });
}

/** How many accounts each state holds, so a state that would empty the queue says so first. */
export function stateCounts(rows: readonly AccountRow[]): Record<AccountStateFilter, number> {
    const counts: Record<AccountStateFilter, number> = {
        outstanding: 0,
        with_agency: 0,
        variance: 0,
        settled: 0,
        no_activity: 0,
    };
    /* Only rows whose money is known can be counted into a money-derived state. */
    for (const row of rows) {
        if (!accountMoneyIsKnown(row)) continue;
        const state = accountState(row) as AccountStateFilter;
        if (state in counts) counts[state] += 1;
    }
    return counts;
}

/** How many rows are still waiting on position, so a narrowed list never claims to be complete. */
export function unresolvedCount(rows: readonly AccountRow[]): number {
    return rows.reduce((n, row) => (accountMoneyIsKnown(row) ? n : n + 1), 0);
}

/**
 * The programs and rooms actually present in this cohort, each with its configured label.
 *
 * Offered from the cohort rather than from configuration, deliberately: a filter listing every
 * classroom in the organisation, most of which would return nothing here, is a control that mostly
 * empties the queue. What is offered is what can be found.
 */
function facetOptions(rows: readonly AccountRow[], pick: (row: AccountRow) => FinancialSubjectFacet[]): FinancialSubjectFacet[] {
    const byId = new Map<string, string>();
    for (const row of rows) for (const facet of pick(row)) if (facet.id && facet.label) byId.set(facet.id, facet.label);
    return [...byId]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export function programOptions(rows: readonly AccountRow[]): FinancialSubjectFacet[] {
    return facetOptions(rows, (row) => row.programs);
}

export function roomOptions(rows: readonly AccountRow[]): FinancialSubjectFacet[] {
    return facetOptions(rows, (row) => row.rooms);
}

/**
 * WORTH OFFERING — which is not the same question as "has more than one value".
 *
 * The lens bar's rule is `options.length > 1`, and applying it here was wrong. A centre with ONE
 * classroom still has households whose children are in it and households whose children are not, so
 * choosing that single room narrows eleven accounts to two. The control is useful; the count of
 * distinct values simply does not measure that.
 *
 * The real question is whether choosing SOME option would exclude at least one row. One option that
 * every row carries excludes nothing and is offered as nothing — which is the case the original
 * rule was reaching for, arrived at by asking directly.
 */
export function facetDivides(
    rows: readonly AccountRow[],
    options: readonly FinancialSubjectFacet[],
    pick: (row: AccountRow) => FinancialSubjectFacet[],
): boolean {
    if (options.length === 0) return false;
    if (options.length > 1) return true;
    const only = options[0]!.id;
    return rows.some((row) => !pick(row).some((facet) => facet.id === only));
}

export const programDivides = (rows: readonly AccountRow[], options: readonly FinancialSubjectFacet[]): boolean =>
    facetDivides(rows, options, (row) => row.programs);

export const roomDivides = (rows: readonly AccountRow[], options: readonly FinancialSubjectFacet[]): boolean =>
    facetDivides(rows, options, (row) => row.rooms);

/**
 * WHICH ACCOUNT IS OPEN, given the visible cohort and whatever was open a moment ago.
 *
 * Four rules, and they are the whole of the behaviour:
 *
 *   1. An explicit choice that is still in the cohort STAYS. Re-deciding it on every render is how
 *      an operator loses the account they were working because a background read returned.
 *   2. A choice that has fallen out of the cohort — narrowed away by a filter, or gone from the
 *      read — is replaced by the first remaining account, because leaving it selected would render
 *      an account the queue no longer claims to contain.
 *   3. With nothing chosen, the FIRST account opens. The workspace is for working an account; a
 *      click that only says "yes, begin" is a click that should not have been asked for.
 *   4. An empty cohort selects NOTHING. There is no account to fabricate, and an empty state is a
 *      real answer.
 */
export function resolveAccountSelection(
    rows: readonly AccountRow[],
    current: string | null,
): string | null {
    if (rows.length === 0) return null;
    if (current && rows.some((row) => row.customerId === current)) return current;
    return rows[0]!.customerId;
}
