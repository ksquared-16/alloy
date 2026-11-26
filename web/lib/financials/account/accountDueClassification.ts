/**
 * DUE AND PAST DUE — the Financials account domain's classification of an account's owed charges by
 * their due date (BP V2 S6A: moved here UNCHANGED from the Financials card's view model, which now
 * imports it, so the card and every cross-household reader classify one way).
 *
 * Pure over `AccountChargeLedgerRow`s (`readAccountChargeLedger` / `deriveAccountChargeLedgerRows`), the
 * map of APPLIED money per charge (`readAppliedByChargeId` — active applications of posted payments),
 * and the org-local business date. What each answers, exactly:
 *
 *   - `pastDueFor`   — owed, non-reversed rows due STRICTLY BEFORE today: the residual after applied
 *                      money, credits kept (they reduce what is overdue). Not subsidy-suppressed.
 *   - `notYetDueFor` — owed, non-reversed, positive rows due STRICTLY AFTER today with a residual.
 *   - `dueWithinFor` — the same rows and residual as `notYetDueFor`, over an INCLUSIVE window (a due date
 *                      of today is neither past due nor not-yet-due, and is due).
 *
 * None of them applies submitted-claim suppression: that is `computeCollectiblePosition`'s, and the
 * card's "Due now" composes it beside these in its presentation adapter.
 */
import type { AccountChargeLedgerRow } from "@/lib/financials/account/accountChargeLedger";

/** Statuses that are posted money an account owes against. */
export const OWED_STATUSES = new Set(["posted", "partially_paid", "paid"]);

export type FinancialsPastDue = {
    amountCents: number;
    oldestDueDate: string;
    agingDays: number;
};

/**
 * W7-F013: posted money whose due date is still ahead — collectible (it may be paid early), not due.
 * The mirror of past due: same rows, same residual, the other side of today.
 */
export type FinancialsNotYetDue = {
    amountCents: number;
    nextDueDate: string;
};

/** Owed money due inside an inclusive window — the Not-yet-due rule over [from, to]. */
export type FinancialsDueWithin = {
    amountCents: number;
    nextDueDate: string;
    lastDueDate: string;
    chargeIds: string[];
};

/**
 * The open, owed, positive rows with a residual whose due date satisfies `onDue` — the ONE predicate
 * Not-yet-due and Due-within share (previously inline in `notYetDueFor`, unchanged).
 */
/*
 * W7-F053: WHAT A ROW STILL OWES = amount − its discount reductions − money applied. The same
 * rule the collectible authority uses (`computeCollectiblePosition`: gross + reductions − applied).
 * Certhouse's Sep 11 tuition ($1,450, −$145 sibling discount, $1,305 paid) read $145 past due
 * because reductions were not subtracted here, while settlement correctly found nothing owed.
 * `reductionByChargeId` holds each charge's reductions as POSITIVE cents; absent means none.
 */
const NO_REDUCTIONS: ReadonlyMap<string, number> = new Map();
function owedOf(
    r: AccountChargeLedgerRow,
    appliedByChargeId: ReadonlyMap<string, number>,
    reductionByChargeId: ReadonlyMap<string, number>,
): number {
    return r.amountCents - (reductionByChargeId.get(r.chargeId) ?? 0) - (appliedByChargeId.get(r.chargeId) ?? 0);
}

function openOwedRowsDue(
    rows: readonly AccountChargeLedgerRow[],
    appliedByChargeId: ReadonlyMap<string, number>,
    onDue: (dueDate: string) => boolean,
    reductionByChargeId: ReadonlyMap<string, number> = NO_REDUCTIONS,
): AccountChargeLedgerRow[] {
    const outstanding = (r: AccountChargeLedgerRow): number => owedOf(r, appliedByChargeId, reductionByChargeId);
    return rows.filter(
        (r) =>
            OWED_STATUSES.has(r.status)
            && r.status !== "paid"
            && r.lifecycleStatus !== "reversed"
            && r.correctionKind !== "reversal"
            && r.dueDate != null
            && onDue(r.dueDate)
            && r.amountCents > 0
            && outstanding(r) > 0,
    );
}

/**
 * Past due over owed rows whose due date has passed and which are STILL OWED.
 *
 * A REVERSED CHARGE IS NOT PAST DUE, and neither is the reversal that undid it. A correction copies
 * the source's `due_date`, so the pair would otherwise both qualify and report an overdue balance of
 * zero — announcing a collections problem for money nobody owes. Credits and replacements are kept:
 * they are partial and legitimately reduce what is still overdue.
 *
 * ── PAST DUE IS THE RESIDUAL, NOT THE FACE AMOUNT ──
 *
 * A charge that has been paid is not overdue, and one that has been HALF paid is overdue for the
 * half. Subtracting what was applied is why `charges.status` is never advanced to `partially_paid` /
 * `paid` when money is applied: a stored status would be a second answer to "how much is left", and
 * the first time an application was reversed the two would disagree. The applications are the
 * record; how much is outstanding is read from them.
 */
/**
 * W7-F013 — WHAT IS OWED BUT NOT YET DUE.
 *
 * A charge added after its period's payment date is due at the NEXT payment event; until then it
 * is collectible and may be paid early, but it is not due and must not be presented as due. Same
 * owed rows and the same residual as `pastDueFor`, on the other side of today.
 */
export function notYetDueFor(
    rows: readonly AccountChargeLedgerRow[],
    today: string,
    appliedByChargeId: ReadonlyMap<string, number> = new Map(),
    reductionByChargeId: ReadonlyMap<string, number> = NO_REDUCTIONS,
): FinancialsNotYetDue | null {
    const outstanding = (r: AccountChargeLedgerRow): number => owedOf(r, appliedByChargeId, reductionByChargeId);
    const ahead = openOwedRowsDue(rows, appliedByChargeId, (due) => due > today, reductionByChargeId);
    if (ahead.length === 0) return null;
    const next = ahead.reduce((acc, r) => ((r.dueDate ?? "") < (acc.dueDate ?? "") ? r : acc));
    return {
        amountCents: ahead.reduce((sum, r) => sum + outstanding(r), 0),
        nextDueDate: next.dueDate as string,
    };
}

export function pastDueFor(
    rows: readonly AccountChargeLedgerRow[],
    today: string,
    appliedByChargeId: ReadonlyMap<string, number> = new Map(),
    reductionByChargeId: ReadonlyMap<string, number> = NO_REDUCTIONS,
): FinancialsPastDue | null {
    const outstanding = (r: AccountChargeLedgerRow): number => owedOf(r, appliedByChargeId, reductionByChargeId);
    const overdue = rows.filter(
        (r) =>
            OWED_STATUSES.has(r.status)
            && r.status !== "paid"
            && r.lifecycleStatus !== "reversed"
            && r.correctionKind !== "reversal"
            && r.dueDate != null
            && r.dueDate < today
            /*
             * A POSITIVE obligation that has been paid in full is no longer overdue. A NEGATIVE row
             * — a credit — is kept whatever its outstanding reads, because it is what reduces the
             * overdue total rather than something that can itself be settled. Dropping it would put
             * the credit's own amount back onto what the family owes.
             */
            && !(r.amountCents > 0 && outstanding(r) <= 0),
    );
    if (overdue.length === 0) return null;
    const oldest = overdue.reduce((acc, r) => ((r.dueDate ?? "") < (acc.dueDate ?? "") ? r : acc));
    const oldestDueDate = oldest.dueDate as string;
    return {
        amountCents: overdue.reduce((sum, r) => sum + outstanding(r), 0),
        oldestDueDate,
        agingDays: Math.max(
            0,
            Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldestDueDate}T00:00:00Z`)) / 86_400_000),
        ),
    };
}

/** Owed money due on or after `from` and on or before `to` (inclusive), by the Not-yet-due rule. */
export function dueWithinFor(
    rows: readonly AccountChargeLedgerRow[],
    from: string,
    to: string,
    appliedByChargeId: ReadonlyMap<string, number> = new Map(),
    reductionByChargeId: ReadonlyMap<string, number> = NO_REDUCTIONS,
): FinancialsDueWithin | null {
    const inWindow = openOwedRowsDue(rows, appliedByChargeId, (due) => due >= from && due <= to, reductionByChargeId);
    if (inWindow.length === 0) return null;
    const sorted = [...inWindow].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || a.chargeId.localeCompare(b.chargeId));
    return {
        amountCents: inWindow.reduce((sum, r) => sum + owedOf(r, appliedByChargeId, reductionByChargeId), 0),
        nextDueDate: sorted[0]!.dueDate as string,
        lastDueDate: sorted[sorted.length - 1]!.dueDate as string,
        chargeIds: sorted.map((r) => r.chargeId),
    };
}

/** The charges `pastDueFor` counted, in due-date order — identities only, for a source to name. */
export function pastDueChargeIds(
    rows: readonly AccountChargeLedgerRow[],
    today: string,
    appliedByChargeId: ReadonlyMap<string, number> = new Map(),
    reductionByChargeId: ReadonlyMap<string, number> = NO_REDUCTIONS,
): string[] {
    const outstanding = (r: AccountChargeLedgerRow): number => owedOf(r, appliedByChargeId, reductionByChargeId);
    return rows
        .filter(
            (r) =>
                OWED_STATUSES.has(r.status)
                && r.status !== "paid"
                && r.lifecycleStatus !== "reversed"
                && r.correctionKind !== "reversal"
                && r.dueDate != null
                && r.dueDate < today
                && r.amountCents > 0
                && outstanding(r) > 0,
        )
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || a.chargeId.localeCompare(b.chargeId))
        .map((r) => r.chargeId);
}
