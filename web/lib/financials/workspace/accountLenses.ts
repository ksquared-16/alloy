/**
 * LOOKING AT ONE ACCOUNT FROM SEVERAL ANGLES — presentation, and no arithmetic whatsoever.
 *
 * An operator working an account asks narrower questions than "show me everything": what have we
 * billed, what have they paid, what did we take off, what is somebody else funding. Answering those
 * by opening four nested detail surfaces is what made the workspace a report rather than a place to
 * work.
 *
 * ── THE ONE RULE THIS MODULE KEEPS ─────────────────────────────────────────────────────────────
 *
 * These are FILTERS over the canonical rows the account reader already produced. Nothing here adds,
 * subtracts, totals or re-derives money. A lens that computed its own subtotal would be a second
 * financial answer with no owner, which is the thing the whole Financials spine is built to prevent
 * — so this file returns row subsets and counts of rows, never sums of cents.
 *
 * ── AND WHY CLASSIFICATION IS BORROWED, NOT RESTATED ───────────────────────────────────────────
 *
 * Which categories are funding, which are reductions and which are adjustments is already decided
 * by the account reader, and `isCollectibleOffsetRow` is its exported predicate. A second copy of
 * those category lists here would drift the first time somebody added a category, and the two
 * surfaces would then disagree about what a row IS while agreeing about what it costs.
 */

import { billingPeriodLabel } from "@/lib/financials/billingPeriod";
import {
    isCollectibleOffsetRow,
    type FinancialsLedgerRow,
} from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import {
    FINANCIALS_HOUSEHOLD_SCOPE,
    rowInFinancialsSubjectScope,
} from "@/lib/adminV2/runtime/focusPanel/financials/financialsRowScope";

/** The angles. `payments` reads receipts rather than ledger rows — money in, not money owed. */
export const ACCOUNT_LENSES = ["all", "charges", "credits", "funding", "payments"] as const;
export type AccountLens = (typeof ACCOUNT_LENSES)[number];

export const ACCOUNT_LENS_LABELS: Record<AccountLens, string> = {
    all: "All",
    charges: "Charges",
    payments: "Payments",
    credits: "Credits & adjustments",
    funding: "Funding",
};

/** A payment, as much of it as a lens needs to filter and count. */
export type LensPayment = {
    paymentId: string;
    payerLabel?: string | null;
    receivedAt?: string | null;
    direction?: string | null;
};

/**
 * What KIND of ledger row this is, in the operator's vocabulary.
 *
 * Funding is tested first and deliberately: a subsidy offset is both a reduction and a funding row
 * by category, and an operator asking "what is the agency covering" does not want it filed under
 * discounts. One row, one lens, and the order encodes which question it answers best.
 */
export function ledgerLensOf(row: FinancialsLedgerRow): Exclude<AccountLens, "all" | "payments"> {
    if (FUNDING_KEYS.has(row.categoryKey)) return "funding";
    if (isCollectibleOffsetRow(row)) return "credits";
    return "charges";
}

/*
 * The one category list this module owns, and it exists because the reader's funding set is not
 * exported. It is asserted equal to the reader's in the test beside this file, so a category added
 * there and not here fails rather than silently misfiling rows.
 */
const FUNDING_KEYS = new Set(["subsidy_offset"]);

export type LedgerFilter = {
    lens: AccountLens;
    /** A child on the account, or `household` for rows that belong to no child. Null = every subject. */
    subject: string | null;
    /** A billing period key. Null = every period. */
    periodKey: string | null;
    /**
     * WHO IS OBLIGATED TO PAY THIS ROW — a responsible party's name, or `UNASSIGNED_PARTY`.
     *
     * NOT the subject and NOT the payer. A row can concern Ana while responsibility belongs to a
     * parent, and the money may ultimately arrive from a third person entirely. Those are three
     * different questions and the ledger answers them from three different authorities; collapsing
     * any two of them is how an operator ends up chasing the wrong person.
     *
     * Null = every responsible party.
     */
    responsibleParty: string | null;
};

export const NO_FILTER: LedgerFilter = Object.freeze({
    lens: "all",
    subject: null,
    periodKey: null,
    responsibleParty: null,
});

/**
 * The token for an obligation nobody has been made answerable for.
 *
 * A real option rather than an absence, because "who has not been assigned" is one of the most
 * actionable questions an operator can ask of an account — it is the work, not the tidy-up.
 */
export const UNASSIGNED_PARTY = "__unassigned__";

/**
 * The token a row with no child subject filters under. Household rows are childless BY CONSTRUCTION.
 *
 * RE-EXPORTED, not re-declared. This file used to own the string, and owning it was how it came to
 * own a second definition of subject scope as well — see `filterLedger` below.
 */
export const HOUSEHOLD_SUBJECT = FINANCIALS_HOUSEHOLD_SCOPE;

/**
 * Which filter option a row CONTRIBUTES TO — not which rows a filter selects.
 *
 * Those are different questions and conflating them is exactly what broke this surface. A household
 * row contributes to the "Household" option (one row, one option, so the counts add up), but it is
 * SELECTED by a child scope too, because it is the account's row and the child is inside the
 * account. Selection is `rowInFinancialsSubjectScope`'s job and only its job.
 */
export function subjectTokenOf(row: FinancialsLedgerRow): string {
    return row.subjectMemberId ? row.subjectMemberId : HOUSEHOLD_SUBJECT;
}

export function filterLedger(
    rows: readonly FinancialsLedgerRow[],
    filter: LedgerFilter,
): FinancialsLedgerRow[] {
    return rows.filter((row) => {
        /* The payments lens is not a view of the ledger at all — it reads receipts. */
        if (filter.lens === "payments") return false;
        if (filter.lens !== "all" && ledgerLensOf(row) !== filter.lens) return false;
        /*
         * ONE SUBJECT-SCOPE AUTHORITY, SHARED WITH THE FOCUS PANEL.
         *
         * This line read `subjectTokenOf(row) !== filter.subject` — an EXACT match, which is a
         * different definition of child scope from the one the Focus Panel ships. Selecting a child
         * here returned that child's rows only and silently dropped every household row: the
         * account fee, the registration fee, the family's own credits. That is the same defect
         * `financialsRowScope` was created to repair one surface at a time, still live in the other
         * surface, and two definitions of "this child's financial scope" is the thing the module
         * note above says this file must never become.
         */
        if (filter.subject && !rowInFinancialsSubjectScope(row, filter.subject)) return false;
        if (filter.periodKey && (row.periodKey ?? "") !== filter.periodKey) return false;
        if (filter.responsibleParty && responsiblePartyTokenOf(row) !== filter.responsibleParty) return false;
        return true;
    });
}

export function filterPayments(
    payments: readonly LensPayment[],
    filter: { payerLabel: string | null },
): LensPayment[] {
    if (!filter.payerLabel) return [...payments];
    return payments.filter((p) => (p.payerLabel ?? "") === filter.payerLabel);
}

/**
 * How many rows each lens would show, so a lens that would be empty can say so before it is opened.
 *
 * Counts of ROWS, never sums of cents — see the module note. A tab badge that totalled money would
 * be this file quietly becoming a second reconciliation.
 */
export function lensCounts(
    rows: readonly FinancialsLedgerRow[],
    payments: readonly LensPayment[],
    within: Omit<LedgerFilter, "lens">,
): Record<AccountLens, number> {
    /*
     * SCOPED THE SAME WAY `filterLedger` SCOPES, through the same authority. A count derived from a
     * different predicate than the view it labels is a badge that promises rows the lens will not
     * show — and before the convergence above, the child scopes disagreed by exactly the household
     * rows.
     */
    const scoped = rows.filter(
        (row) =>
            (!within.subject || rowInFinancialsSubjectScope(row, within.subject))
            && (!within.periodKey || (row.periodKey ?? "") === within.periodKey)
            && (!within.responsibleParty || responsiblePartyTokenOf(row) === within.responsibleParty),
    );
    const counts: Record<AccountLens, number> = {
        all: scoped.length,
        charges: 0,
        credits: 0,
        funding: 0,
        payments: payments.length,
    };
    for (const row of scoped) counts[ledgerLensOf(row)] += 1;
    return counts;
}

// ── THE CONTEXT FILTERS, AND WHEN THEY MAY BE SHOWN ─────────────────────────────────────────────

export type FilterOption = { value: string; label: string; count: number };

/**
 * A filter is offered only when it would actually divide the rows.
 *
 * One child, one period, one payer: the control would be a dropdown with a single choice, which
 * reads as a capability the surface does not have. `hasChoice` is the gate every caller uses.
 */
export function hasChoice(options: readonly FilterOption[]): boolean {
    return options.length > 1;
}

export function subjectOptions(rows: readonly FinancialsLedgerRow[]): FilterOption[] {
    const byToken = new Map<string, FilterOption>();
    for (const row of rows) {
        const value = subjectTokenOf(row);
        const label = row.subjectMemberId ? (row.subjectName ?? "Child") : "Household";
        const found = byToken.get(value);
        if (found) found.count += 1;
        else byToken.set(value, { value, label, count: 1 });
    }
    /* Household last: a child is the more common question, and it keeps the order stable. */
    return [...byToken.values()].sort((a, b) => {
        if ((a.value === HOUSEHOLD_SUBJECT) !== (b.value === HOUSEHOLD_SUBJECT)) {
            return a.value === HOUSEHOLD_SUBJECT ? 1 : -1;
        }
        return a.label.localeCompare(b.label);
    });
}

/**
 * Newest period first — an operator is nearly always working the current one.
 *
 * The VALUE stays the canonical `YYYY-MM`, because that is what `filterLedger` matches on. The
 * LABEL is the operator's: "September 2026". They were the same string, so the one control an
 * operator uses to choose a month offered them a list of dated identifiers.
 */
/**
 * Which responsible-party option a row files under.
 *
 * `responsibilityUnassigned` is the read model's own answer — an allocation exists and deliberately
 * names nobody — and it is told apart from "no allocation at all", which simply has no name. Both
 * present as Unassigned to an operator, because in both cases the question "who owes this" is open.
 */
export function responsiblePartyTokenOf(row: FinancialsLedgerRow): string {
    const name = (row.responsiblePartyName ?? "").trim();
    return name ? name : UNASSIGNED_PARTY;
}

/**
 * The responsible parties this account's rows actually name.
 *
 * Derived from the rows, never from household membership: a parent who is on the account but has
 * been made responsible for nothing is not a filter an operator needs, and offering them would
 * imply an arrangement that does not exist.
 */
export function responsiblePartyOptions(rows: readonly FinancialsLedgerRow[]): FilterOption[] {
    const byToken = new Map<string, FilterOption>();
    for (const row of rows) {
        const value = responsiblePartyTokenOf(row);
        const label = value === UNASSIGNED_PARTY ? "Unassigned" : value;
        const found = byToken.get(value);
        if (found) found.count += 1;
        else byToken.set(value, { value, label, count: 1 });
    }
    /* Unassigned last: it is a state, not a person, and the named parties are the common question. */
    return [...byToken.values()].sort((a, b) => {
        if ((a.value === UNASSIGNED_PARTY) !== (b.value === UNASSIGNED_PARTY)) {
            return a.value === UNASSIGNED_PARTY ? 1 : -1;
        }
        return a.label.localeCompare(b.label);
    });
}

export function periodOptions(rows: readonly FinancialsLedgerRow[]): FilterOption[] {
    const byKey = new Map<string, FilterOption>();
    for (const row of rows) {
        const value = row.periodKey ?? "";
        if (!value) continue;
        const found = byKey.get(value);
        if (found) found.count += 1;
        else byKey.set(value, { value, label: billingPeriodLabel(value), count: 1 });
    }
    return [...byKey.values()].sort((a, b) => b.value.localeCompare(a.value));
}

export function payerOptions(payments: readonly LensPayment[]): FilterOption[] {
    const byLabel = new Map<string, FilterOption>();
    for (const p of payments) {
        const value = (p.payerLabel ?? "").trim();
        if (!value) continue;
        const found = byLabel.get(value);
        if (found) found.count += 1;
        else byLabel.set(value, { value, label: value, count: 1 });
    }
    return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
}
