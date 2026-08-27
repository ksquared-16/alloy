/**
 * CANONICAL FINANCIALS READ MODEL → THE LOCKED FINANCIALS CARD'S INPUT.
 *
 * ── WHY AN ADAPTER AND NOT A SECOND CARD ──
 *
 * There were two implementations of one approved card: the locked specimen in the design lab and a
 * production approximation. The approximation opened with a hero line the specimen does not have
 * (`$25.00 · August 2026`), showed two of the seven arithmetic lines, drew its actions as bordered
 * buttons instead of quiet links, and left a band of empty white below the zones. QA failed the
 * difference, correctly.
 *
 * There is now ONE presentation (`components/operationalCards/FinancialsCard.tsx`), rendered by both
 * the lab and the real Focus Panel, and this is the only thing that differs between them: the lab
 * supplies fixture evidence, production supplies the canonical read model, and both arrive here in
 * the same shape.
 *
 * The mapping is deliberately DUMB. It groups, formats and renames; it decides nothing. Every
 * financial judgement — which rows belong to the period, what reconciles to what, what is past due —
 * was already made by `buildFinancialsCardVM` from canonical truth. A mapper that re-derived any of
 * it would be a second answer, which is exactly how the two drifted apart.
 *
 * ── THE ARITHMETIC IS THE CARD ──
 *
 * `CHARGE_CATEGORIES` splits into groups and the split is the whole point:
 *
 *     gross charges − discounts/credits − funding = family responsibility
 *     family responsibility − payments received   = current balance
 *
 * The read model already carries each term as its own field, so the two totals are CARRIED, never
 * recomputed here. Collapsing them into a single number is the error the layout exists to prevent.
 */

import type {
    FinancialsCardVM,
    FinancialsLedgerRow,
    FinancialsPastDue,
    FinancialsReconciliation,
} from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FinancialsEvidence, FinancialsPayer } from "@/lib/cardLab/cardLabTypes";

/** Reductions and funding are stored as their own categories, not as negative tuition. */
const REDUCTION_CATEGORIES = new Set(["discount", "credit", "adjustment"]);
const FUNDING_CATEGORIES = new Set(["subsidy_offset"]);

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

/** "2026-08-15" → "Aug 15". Returns null rather than inventing a date the row does not carry. */
function shortDate(ymd: string | null | undefined): string | null {
    if (!ymd) return null;
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * One line per CATEGORY, not one per charge.
 *
 * A period with fourteen tuition rows is still one "Tuition" line on a summary card; the individual
 * rows are the ledger's job, and reproducing them here is what `Details →` is for.
 */
function groupRows(
    rows: readonly FinancialsLedgerRow[],
    predicate: (row: FinancialsLedgerRow) => boolean,
    currency: string,
): { label: string; value: string }[] {
    const totals = new Map<string, { label: string; cents: number }>();
    for (const row of rows) {
        if (!predicate(row)) continue;
        const prev = totals.get(row.categoryKey);
        totals.set(row.categoryKey, {
            label: row.categoryLabel || row.categoryKey,
            cents: (prev?.cents ?? 0) + row.amountCents,
        });
    }
    return [...totals.values()]
        .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
        .map((t) => ({ label: t.label, value: money(t.cents, currency) }));
}

function pastDueFor(
    pastDue: FinancialsPastDue | null,
    currency: string,
): FinancialsEvidence["pastDue"] {
    if (!pastDue || pastDue.amountCents <= 0) return null;
    const oldest = shortDate(pastDue.oldestDueDate);
    return {
        amount: money(pastDue.amountCents, currency),
        oldest: oldest ?? "—",
        age: `${pastDue.agingDays} ${pastDue.agingDays === 1 ? "day" : "days"} past due`,
        note: null,
    };
}

export function adaptFinancialsVmToFinancialsCard(input: {
    vm: FinancialsCardVM;
    /** The scoped reconciliation — the whole account, or one child. Never re-derived here. */
    reconciliation: FinancialsReconciliation;
    pastDue: FinancialsPastDue | null;
    /** Rows already narrowed to the current period and the current subject scope. */
    rows: readonly FinancialsLedgerRow[];
    currency: string;
}): FinancialsEvidence {
    const { vm, reconciliation, rows, currency } = input;

    const charges = groupRows(
        rows,
        (r) => !REDUCTION_CATEGORIES.has(r.categoryKey) && !FUNDING_CATEGORIES.has(r.categoryKey),
        currency,
    );
    const reductions = groupRows(rows, (r) => REDUCTION_CATEGORIES.has(r.categoryKey), currency);
    const funding = groupRows(rows, (r) => FUNDING_CATEGORIES.has(r.categoryKey), currency);

    const pastDue = pastDueFor(input.pastDue, currency);

    /*
     * THE DUE LINE, and it must not assert a date the record does not have.
     *
     * The specimen reads "Was due Aug 15" beside a past-due balance. With nothing owed there is no
     * due date to state, so the line reports what IS true — a scheduled amount, or nothing at all.
     */
    const dueLabel =
        pastDue ? `Was due ${pastDue.oldest}`
        : reconciliation.scheduledCents > 0 ?
            `${money(reconciliation.scheduledCents, currency)} scheduled`
        :   "";

    /*
     * PAYERS ARE CANONICAL; THE SPLIT IS NOT.
     *
     * The read model names the account's payers from the `payer` contact role. It carries no
     * `share`, because Alloy has no allocation store — nothing records that Jordan carries 70%. So
     * a payer arrives here with a name and no percentage, the Responsibility line renders no split,
     * and the payment zone lists who is responsible without claiming how much.
     *
     * `method` is null for the same reason: there is no per-payer payment method store either.
     */
    const payers: FinancialsPayer[] = vm.payers.map((p) => ({
        name: p.name,
        share: p.share ?? "",
        method: p.method ?? "No method on file",
    }));

    return {
        // Lab-only specimen label; never rendered inside the card.
        caseLabel: "",
        compact: {
            dueLine:
                pastDue ? `${pastDue.amount} past due`
                :   money(reconciliation.balanceCents, currency),
            lines: [
                { label: "Responsibility", value: money(reconciliation.responsibilityCents, currency) },
                { label: "Current balance", value: money(reconciliation.balanceCents, currency) },
            ],
            paymentLine: vm.paymentSetup ?? "No payment method on file",
            paymentHealthy: Boolean(vm.paymentSetup),
        },
        subjects: vm.subjects.map((s) => s.displayName).filter((n): n is string => Boolean(n)),
        period: {
            label: vm.period.label,
            charges,
            reductions,
            funding,
            familyResponsibility: money(reconciliation.responsibilityCents, currency),
            paymentsReceived: money(reconciliation.paymentsCents, currency),
            currentBalance: money(reconciliation.balanceCents, currency),
            dueLabel,
        },
        pastDue,
        // The summary card renders no ledger; the rows are the detail's subject.
        ledger: [],
        payers,
        payment: {
            autopayLabel: vm.paymentSetup,
            autopayHealthy: Boolean(vm.paymentSetup),
            nextChargeLabel: null,
        },
        /*
         * ONE quiet line of context. When nothing is past due the specimen prints it under
         * "Nothing past due", so it has to say something true about the account rather than repeat
         * the balance already shown two inches away.
         */
        historyLine:
            reconciliation.scheduledCents > 0 ?
                `${money(reconciliation.scheduledCents, currency)} scheduled this period`
            : reconciliation.paymentsCents > 0 ?
                `Payments received · ${money(reconciliation.paymentsCents, currency)}`
            :   `No payments recorded this period`,
        upcoming: [],
    };
}
