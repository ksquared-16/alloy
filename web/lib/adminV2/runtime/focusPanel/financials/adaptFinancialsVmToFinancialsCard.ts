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
    FinancialsChargeTemplateOption,
    FinancialsLedgerRow,
    FinancialsPastDue,
    FinancialsReconciliation,
} from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type {
    AddChargeSpecimen,
    ChargeTemplateOption,
    FinancialsEvidence,
    FinancialsLedgerPeriod,
    FinancialsPayer,
    LedgerEntry,
} from "@/lib/cardLab/cardLabTypes";
import {
    billingPeriodForDate,
    billingPeriodLabel,
    sortBillingPeriodKeysDescending,
} from "@/lib/financials/billingPeriod";
import { collectionLifecycle, lifecycleLabel, type CollectionRail } from "@/lib/financials/payments/collectionLifecycle";
import { presentPayments } from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import { ledgerLensOf } from "@/lib/financials/workspace/accountLenses";

/** Reductions and funding are stored as their own categories, not as negative tuition. */
const REDUCTION_CATEGORIES = new Set(["discount", "credit", "adjustment"]);
const FUNDING_CATEGORIES = new Set(["subsidy_offset"]);

/**
 * EVERY DATE THIS ADAPTER EMITS, THROUGH THE PLATFORM'S FORMATTER — "Oct 1, 2026".
 *
 * There were two private formatters here and they disagreed: one carried the year and one did not,
 * so the Details ledger read "Aug 15" while the line above it read "Oct 1, 2026". Financial
 * activity crosses months, billing periods and fiscal years, and a ledger date without a year
 * cannot be reconciled against a statement — so there is one rule now and it is
 * `formatDisplayDate`, the same authority every other operator surface uses.
 *
 * Null, not a guess, when the value is absent or unparseable: a row that does not carry a date must
 * not be given one.
 */
function displayDate(value: string | null | undefined): string | null {
    return formatDisplayDate(value ?? null) || null;
}

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
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
    const oldest = displayDate(pastDue.oldestDueDate);
    return {
        amount: money(pastDue.amountCents, currency),
        oldest: oldest ?? "—",
        /*
         * THE DURATION, NOT THE VERDICT. This baked "past due" into a field called `age`, and the
         * only surface that renders it already says "past due" itself — so the compact card read
         * "$75.00 past due · 1 day past due", which is the same judgement twice and overran a
         * nowrap line into an ellipsis. The phrase is said once, by the sentence that owns it.
         */
        age: `${pastDue.agingDays} ${pastDue.agingDays === 1 ? "day" : "days"}`,
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
    /* The Due figure, computed exactly as before — once, so the strip and its context share it. */
    const dueNowCents = Math.max(
        0,
        vm.collectible.currentlyCollectibleCents - (vm.notYetDue?.amountCents ?? 0),
        Math.min(vm.pastDue?.amountCents ?? 0, vm.collectible.currentlyCollectibleCents),
    );

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
     * THE SHARE IS REAL NOW. This comment used to say the opposite, and it was right at the time:
     * the read model named payers from the `payer` CONTACT role and carried no `share`, because
     * nothing anywhere recorded that Jordan carries 70%. Thread 6 built that record, so a payer
     * arrives here because a persisted responsibility allocation named them, and their share is the
     * cents that allocation assigned — never a percentage derived here.
     *
     * `method` NO LONGER FALLS BACK TO A CLAIM.
     *
     * The original note said there was no per-payer payment-method store, so `vm.payers[].method`
     * was hardcoded null — and that was true when it was written. Payments W2 then shipped
     * `payment_methods`, and this line did not move: it kept turning "we never looked" into the
     * positive sentence "No payment method on file", which an operator read beside a Manage
     * payments panel showing `visa •••• 4242 Ready`.
     *
     * `paymentSubjectModel` already holds the answer and already states the rule — its
     * `summaryLine` is "the one line a compact surface may show", and it is null "when there is
     * genuinely nothing to say, which is different from 'no payment method on file', a claim this
     * cannot make without looking". That module DOES look: it says the brand and last four when a
     * usable method exists, names an unverified bank or one needing attention, and only says "No
     * payment method on file" when the household genuinely has none AND storing one is something
     * this organisation could do.
     *
     * So the fallback is now that line, and null stays null. Saying nothing is the correct output
     * for an unknown; the bug was never the wording, it was answering at all.
     */
    const methodLine = vm.paymentCapabilities?.summaryLine ?? null;
    const payers: FinancialsPayer[] = vm.payers.map((p) => ({
        name: p.name,
        share: p.share ?? "",
        method: p.method ?? methodLine ?? "",
    }));

    return {
        // Lab-only specimen label; never rendered inside the card.
        caseLabel: "",
        compact: {
            /*
             * A HEADLINE MUST EARN ITS SLOT.
             *
             * Past due is a distinct CONDITION — a figure with a deadline attached — so it keeps the
             * prominent line. An ordinary balance is not: `lines` states it immediately below as
             * "Current balance", and printing it again above, unlabelled, said the same fact twice
             * and made $0.00 sit over "Current balance $0.00".
             *
             * Null, not an empty string: the card asks whether there is a headline, rather than
             * rendering a blank one. The arithmetic is untouched — this only decides what is shown.
             */
            dueLine: pastDue ? `${pastDue.amount} past due` : null,
            lines: [
                { label: "Responsibility", value: money(reconciliation.responsibilityCents, currency) },
                { label: "Current balance", value: money(reconciliation.balanceCents, currency) },
                /*
                 * WHAT TO ACTUALLY ASK FOR, and only when there is something to say.
                 *
                 * A submitted subsidy claim suppresses collection for the amount it attributed, so
                 * the balance above and the amount to collect stop being the same number. Both are
                 * shown: the obligation has not shrunk, and pretending otherwise is how a subsidy
                 * turns into a discount. An ordinary family's card is unchanged, because with
                 * nothing suppressed the line is absent rather than repeating the balance.
                 */
                ...(vm.collectible.submittedClaimSuppressionCents > 0
                    ? [{ label: "Collectible now", value: money(vm.collectible.currentlyCollectibleCents, currency) }]
                    : []),
            ],
            /*
             * NOT KNOWING IS NOT THE SAME AS NONE — and it is no longer unknown.
             *
             * `vm.paymentSetup` used to be a hardcoded null with no producer, so "No payment method
             * on file" was a constant read back as evidence about every household. It is now
             * derived by `resolvePaymentSetup`, which looks at the organisation's merchant and the
             * household's stored methods, and returns null when there is genuinely nothing
             * established to say. Silence still means unknown; it simply is not the only answer.
             *
             * HEALTHY MEANS A USABLE METHOD IS ON FILE, which is what this line reports. It is
             * deliberately not autopay — see the payment band below.
             *
             * It asks `methodSummary` rather than counting `methodsOnFile`, because that list now
             * INCLUDES revoked methods so a surface can say "removed" rather than silently dropping
             * them. Counting its length would report a household whose only card was removed as
             * healthy — and a bank account still awaiting verification as ready to charge.
             */
            paymentLine: vm.paymentSetup ?? null,
            paymentHealthy: vm.paymentCapabilities?.methodSummary.hasUsableMethod === true,
        },
        subjects: vm.subjects.map((s) => s.displayName).filter((n): n is string => Boolean(n)),
        period: {
            label: vm.period.label,
            charges,
            reductions,
            funding,
            familyResponsibility: money(reconciliation.responsibilityCents, currency),
            /*
             * THE SPLIT, FORMATTED AND NOTHING ELSE.
             *
             * Every figure here is already decided by Thread 6 and carried on the view model:
             * `allocatedCents` is what named parties have been made responsible for and
             * `unassignedCents` is what nobody has. This adapter turns cents into money and stops —
             * it does not add the two up, does not check them against the obligation, and does not
             * derive a party's share from a percentage. A presentation layer that reconciles is a
             * second financial authority wearing a formatter's clothes.
             *
             * Null when there is no allocation at all, so the card renders no empty section rather
             * than a heading over nothing.
             */
            responsibility:
                vm.responsibility.parties.length > 0 || vm.responsibility.unassignedCents !== 0 ?
                    {
                        allocated: money(vm.responsibility.allocatedCents, currency),
                        parties: vm.responsibility.parties.map((party) => ({
                            name: party.name,
                            amount: money(party.assignedCents, currency),
                        })),
                        unassigned:
                            vm.responsibility.unassignedCents !== 0 ?
                                money(vm.responsibility.unassignedCents, currency)
                            :   null,
                    }
                :   null,
            /*
             * EXPECTED, and never counted. `expectedCents` may legitimately be absent — an
             * authorization can name a funder before anyone knows the amount — and null here means
             * exactly that rather than zero dollars.
             */
            expectedFunding: vm.expectedFunding.map((f) => ({
                label: f.label,
                amount: f.expectedCents != null ? money(f.expectedCents, currency) : null,
            })),
            /* The same conditional the compact zone already applies, for the same reason. */
            collectibleNow:
                vm.collectible.submittedClaimSuppressionCents > 0 ?
                    money(vm.collectible.currentlyCollectibleCents, currency)
                :   null,
            paymentsReceived: money(reconciliation.paymentsCents, currency),
            currentBalance: money(reconciliation.balanceCents, currency),
            /* The SAME canonical figure `collectibleNow` reads, stated unconditionally. See the
               field's note in `cardLabTypes`: one authority, two rendering policies. */
            /*
             * W7-F013: DUE is what is collectible AND due today or earlier. Money whose due date is
             * still ahead (a late add rolled to the next payment event) stays collectible — it can be
             * paid early — but is stated beside Due, never inside it.
             */
            /*
             * Measured on deployed b48d684b: Due $0.00 beside Past due $40.00. The collectible
             * figure is NET of account credits while not-yet-due is a per-charge residual, so the
             * subtraction alone can undershoot. What is past due is always due, so Due never reads
             * below it (bounded by what is collectible at all).
             */
            dueNow: money(dueNowCents, currency),
            /* W7-F018: drafts, stated beside the balance they are not part of. */
            upcoming: vm.upcoming && vm.upcoming.amountCents > 0 ? money(vm.upcoming.amountCents, currency) : null,
            notYetDue: vm.notYetDue && vm.notYetDue.amountCents > 0
                ? `${money(vm.notYetDue.amountCents, currency)} on ${displayDate(vm.notYetDue.nextDueDate) ?? vm.notYetDue.nextDueDate}`
                : null,
            /*
             * ZERO IS SILENCE. The metric appears only when the organisation actually holds
             * spendable money for this family — the information-density rule the rest of this strip
             * already follows, and the reason Autopay was dropped from it rather than rendered as a
             * permanent "not available".
             *
             * PENDING MONEY IS NOT SHOWN HERE. It is reported by the authority and deliberately not
             * offered: a receipt that has not cleared is money the platform was told about, and
             * putting it in a figure labelled "available" would invite an operator to spend it.
             */
            /*
             * OPTIONAL-CHAINED DELIBERATELY. `prepaid` is a new read-model field, and during a
             * deploy this adapter can be handed a payload produced by a server that predates it —
             * the card is client-rendered against a cached `/api/admin/financials/card` response.
             * Crashing the whole card over a missing prepaid figure would take out Balance, Due and
             * Past due to avoid omitting a line that is usually absent anyway.
             */
            availablePrepaid:
                (vm.prepaid?.availableCents ?? 0) > 0 ? money(vm.prepaid!.availableCents, currency) : null,
            /*
             * HELD MONEY IS ITS OWN FIGURE (Payments V1 · W4), and never merged into the one above.
             *
             * "$200 available prepaid" and "$500 held" are different facts about a family: the first
             * is money an operator may spend on an obligation right now, the second is money the
             * organisation is holding and may not. One combined number would offer the deposit.
             *
             * It is also NOT netted into Current Balance — a family that owes $500 and has $500 held
             * still owes $500. Zero stays silent, like every other metric in this strip, and
             * `heldSupported` guards the difference between "nothing held" and "cannot tell".
             */
            heldFunds:
                vm.prepaid?.heldSupported && (vm.prepaid?.heldCents ?? 0) > 0
                    ? money(vm.prepaid!.heldCents, currency)
                    : null,
            dueLabel,
            /*
             * W7-F031 — WHICH FIGURE EACH NUMBER IS PART OF. Nothing is recomputed: Due now, Current
             * balance, Responsibility, Paid, Not yet due, Scheduled, prepaid and held are the figures
             * above. Current balance is THIS PERIOD's (`reconcileRows` over `vm.period`), and it is
             * Responsibility − Paid exactly, so it is labelled with its period and explained by them.
             * Past due spans every period; when it exceeds Due now (arrears older than this period's
             * collectible), the note says so rather than implying it is inside Due.
             */
            summary: {
                dueNow: money(dueNowCents, currency),
                pastDueNote: input.pastDue && input.pastDue.amountCents > 0
                    ? `${money(input.pastDue.amountCents, currency)} past due`
                        + (input.pastDue.amountCents > dueNowCents ? " · includes earlier periods" : "")
                        /*
                         * W7-F053: Past due is the obligation; a submitted subsidy claim makes part of
                         * it collectible from the funder, not the family. Said here, in canonical terms,
                         * so the Payment form's lower family amount is never a mystery.
                         */
                        + ((vm.collectible?.submittedClaimSuppressionCents ?? 0) > 0
                            ? ` · ${money(vm.collectible.submittedClaimSuppressionCents, currency)} expected from funding`
                            : "")
                    : null,
                pastDueBeyondDue: Boolean(input.pastDue && input.pastDue.amountCents > dueNowCents),
                balance: money(reconciliation.balanceCents, currency),
                balanceScope: vm.period.label,
                balanceNote: `${money(reconciliation.responsibilityCents, currency)} charged · ${money(reconciliation.paymentsCents, currency)} paid`,
                scheduled: vm.upcoming && vm.upcoming.amountCents > 0 ? money(vm.upcoming.amountCents, currency) : null,
                context: [
                    ...(vm.notYetDue && vm.notYetDue.amountCents > 0
                        ? [{ key: "not-yet-due", text: `${money(vm.notYetDue.amountCents, currency)} not yet due · next ${displayDate(vm.notYetDue.nextDueDate) ?? vm.notYetDue.nextDueDate}` }]
                        : []),
                    ...((vm.prepaid?.availableCents ?? 0) > 0
                        ? [{ key: "prepaid", text: `${money(vm.prepaid!.availableCents, currency)} prepaid available` }]
                        : []),
                    ...(vm.prepaid?.heldSupported && (vm.prepaid?.heldCents ?? 0) > 0
                        ? [{ key: "held", text: `${money(vm.prepaid!.heldCents, currency)} held deposit` }]
                        : []),
                ],
            },
        },
        pastDue,
        // The summary card renders no ledger; the rows are the detail's subject.
        ledger: [],
        payers,
        payment: {
            /*
             * AUTOPAY IS NOT A PAYMENT METHOD, and this once said it was: it read the payment setup
             * line — a hardcoded null at the time — into the autopay slot, so a family with a card
             * on file would have been labelled as having autopay. Two different questions had one
             * answer.
             *
             * W5 gave the second question its own authority. This is now the canonical arrangement's
             * own sentence and never a state derived from a stored method, because storing a card is
             * still not consent to charge it.
             */
            autopayLabel: vm.autopayLine ?? null,
            autopayHealthy: vm.autopayHealthy === true,
            nextChargeLabel: null,
        },
        /*
         * THE RECEIPTS, AND WHAT EACH IS ANSWERING.
         *
         * Formatting only. `appliedCents`, `unappliedCents` and the applications all arrive decided
         * by the account VM, which takes them from the canonical readers — so the card cannot reach a
         * different answer than the service, because it is not permitted to compute one.
         *
         * Refunds are excluded: an outbound row is money going back, not a receipt with obligations
         * to answer, and listing it here would invite an operator to move it.
         */
        payments: vm.payments
            .filter((p) => p.direction === "inbound")
            .map((p) => ({
                paymentId: p.paymentId,
                receivedLabel: money(p.amountCents, p.currencyCode || currency),
                payerLabel: p.payerLabel ?? null,
                /*
                 * THROUGH THE CANONICAL FORMATTER, like every other date on the surface.
                 *
                 * This passed `receivedAt` RAW while every sibling field went through
                 * `displayDate`. `receivedAt` is a timestamp, so the Payments lens rendered a full
                 * ISO string into a 78px Date column — the garbled, overlapping date on an
                 * otherwise ordinary ledger row, and the reason that lens looked like a different
                 * renderer rather than the same one.
                 */
                receivedOn: displayDate(p.receivedAt),
                method: p.method || null,
                appliedLabel: money(p.appliedCents, p.currencyCode || currency),
                unappliedLabel: money(p.unappliedCents, p.currencyCode || currency),
                unappliedCents: p.unappliedCents,
                /*
                 * WHAT IS LEFT TO RESTRICT. Clamped at zero rather than allowed negative: the two
                 * figures come from one read of the same lots, but a receipt whose holds somehow
                 * exceeded its unapplied money must not render as a negative offer — the surface
                 * would be arguing with the invariant instead of declining to act.
                 */
                holdableCents: Math.max(0, p.unappliedCents - (p.heldCents ?? 0)),
                /* What of this receipt is restricted — the difference the row has to be able to state. */
                heldCents: p.heldCents ?? 0,
                /*
                 * THE SAME MONEY, NAMED FOR THE OTHER ACT. Unapplied money that no lot restricts is
                 * both what may be held and what may be APPLIED, and the apply control was quoting
                 * `unappliedLabel` — the whole receipt, deposits included. On deployed that read
                 * "Apply $522.00" beside an Available prepaid of $407.00, and the authority let the
                 * difference be spent.
                 */
                applicableLabel: money(Math.max(0, p.unappliedCents - (p.heldCents ?? 0)), p.currencyCode || currency),
                applications: p.applications.map((a) => ({
                    allocationId: a.allocationId,
                    chargeId: a.chargeId,
                    chargeLabel: a.chargeLabel,
                    amountLabel: money(a.appliedCents, p.currencyCode || currency),
                    status: a.status,
                    reversalReason: a.reversalReason,
                })),
            })),

        /*
         * MANUAL REDUCTIONS, as records rather than as a total.
         *
         * Only `manual` rows are listed. A policy application lowers the same bucket, but undoing one
         * by hand would leave the policy still saying the family qualifies and the next billing run
         * would apply it again — so policy is not offered here at all, rather than offered and then
         * refused.
         *
         * The sign is read from the stored amount, not inferred from the category: the schema's only
         * constraint is that the amount is non-zero, and a category tells you which bucket a row
         * lands in, not which way it went.
         */
        adjustments: vm.reductions
            .filter((r) => r.kind === "manual")
            .map((r) => ({
                applicationId: r.applicationId,
                categoryLabel: r.category ? chargeCategoryLabel(r.category) : "Adjustment",
                amountLabel: money(r.amountCents, r.currencyCode || currency),
                reducesObligation: r.amountCents < 0,
                reason: r.reason,
                /* The operator's word for the month, not the key the reader groups by. */
                periodLabel: billingPeriodLabel(r.periodKey) || null,
                /* A raw `2026-09-14` on an operator surface — the doctrine forbids it. */
                recordedOn: displayDate(r.createdAt),
                subjectName: r.customerMemberId
                    ? vm.subjects.find((sub) => sub.customerMemberId === r.customerMemberId)?.displayName ?? null
                    : null,
                applied: r.chargeStatus === "posted",
                reversed: r.reversedByApplicationId !== null,
                isReversal: r.reversesApplicationId !== null,
            })),
        /*
         * THE HELD LOTS BEHIND THE TOTAL.
         *
         * CLOSED LOTS ARE DROPPED. A hold with nothing remaining is history: it offers no act, and
         * listing it beside open ones would put rows an operator cannot do anything with in a
         * section that exists to be acted on. What became of the money is still recoverable from the
         * receipt's own applications and refunds, which is where it belongs.
         *
         * Nothing here is computed. `remainingCents` is the reader's fold over the dispositions, the
         * same fold the invariant trigger enforces, and the adapter only formats it — a subtraction
         * done here could disagree with the boundary that refuses an over-disposal.
         */
        heldDeposits: (vm.heldDeposits ?? [])
            .filter((h) => h.open)
            .map((h) => ({
                holdId: h.id,
                paymentId: h.paymentId,
                remaining: money(h.remainingCents, currency),
                remainingCents: h.remainingCents,
                /*
                 * Shown ONLY when part of the lot is gone, because that is the only time it explains
                 * anything. On an untouched hold "held $500, $500 remaining" is the same fact twice.
                 */
                original:
                    h.remainingCents !== h.originalAmountCents
                        ? money(h.originalAmountCents, currency)
                        : null,
                disposedLines: [
                    ...(h.releasedCents > 0 ? [{ label: "Released", value: money(h.releasedCents, currency) }] : []),
                    ...(h.appliedCents > 0 ? [{ label: "Applied", value: money(h.appliedCents, currency) }] : []),
                    ...(h.refundedCents > 0 ? [{ label: "Refunded", value: money(h.refundedCents, currency) }] : []),
                ],
                refundable: h.refundable,
                /*
                 * FROM THE SNAPSHOT, NOT FROM CURRENT POLICY. The terms a family was promised do not
                 * change because the organisation's policy did, which is the entire reason the terms
                 * are stored on the hold.
                 */
                refundableNote: h.refundable
                    ? "Refundable on the terms it was taken under"
                    : "Taken as non-refundable",
                reason: h.reason,
                /* Never a raw ISO date on an operator surface. */
                heldOn: displayDate(h.heldAt),
                /*
                 * PROVENANCE ONLY, and named as provenance. It is not consulted to decide
                 * refundability — `refundable` above is — and it is not offered as a link, because a
                 * deposit policy has no operator surface to reach.
                 */
                policyReference: h.policyId,
                open: h.open,
            })),

        /*
         * ── A DEPOSIT'S LIFE DOES NOT END WHEN ITS MONEY DOES ───────────────────────────────────
         *
         * A lot whose remaining reaches zero left the held list entirely, and with it went the only
         * surface that could say what was held, why, on what terms, and what became of it. The
         * history was never lost — the dispositions are append-only and the reader already folds
         * them — but nothing rendered it, so the questions the held row exists to answer stopped
         * being answerable the moment the lifecycle completed.
         *
         * SEPARATE FROM THE POSITION, DELIBERATELY. These lots contribute to no figure: not Held
         * deposit, not Available prepaid, not Current balance. `remainingCents` is zero and every
         * total folds the same dispositions, so a completed lot cannot add to anything by being
         * rendered. It is history, and it is shown as history.
         *
         * NO SECOND TABLE. Same rows, same fold, same provenance authority — only the filter
         * differs.
         */
        heldDepositHistory: (vm.heldDeposits ?? [])
            .filter((h) => !h.open && h.dispositions.length > 0)
            .map((h) => ({
                holdId: h.id,
                paymentId: h.paymentId,
                remaining: money(h.remainingCents, currency),
                remainingCents: h.remainingCents,
                /*
                 * Shown ONLY when part of the lot is gone, because that is the only time it explains
                 * anything. On an untouched hold "held $500, $500 remaining" is the same fact twice.
                 */
                original:
                    h.remainingCents !== h.originalAmountCents
                        ? money(h.originalAmountCents, currency)
                        : null,
                disposedLines: [
                    ...(h.releasedCents > 0 ? [{ label: "Released", value: money(h.releasedCents, currency) }] : []),
                    ...(h.appliedCents > 0 ? [{ label: "Applied", value: money(h.appliedCents, currency) }] : []),
                    ...(h.refundedCents > 0 ? [{ label: "Refunded", value: money(h.refundedCents, currency) }] : []),
                ],
                refundable: h.refundable,
                /*
                 * FROM THE SNAPSHOT, NOT FROM CURRENT POLICY. The terms a family was promised do not
                 * change because the organisation's policy did, which is the entire reason the terms
                 * are stored on the hold.
                 */
                refundableNote: h.refundable
                    ? "Refundable on the terms it was taken under"
                    : "Taken as non-refundable",
                reason: h.reason,
                /* Never a raw ISO date on an operator surface. */
                heldOn: displayDate(h.heldAt),
                /*
                 * PROVENANCE ONLY, and named as provenance. It is not consulted to decide
                 * refundability — `refundable` above is — and it is not offered as a link, because a
                 * deposit policy has no operator surface to reach.
                 */
                policyReference: h.policyId,
                open: h.open,
            })),
    };
}

/**
 * THE LEDGER, grouped by billing period — the detail card's subject.
 *
 * The summary states the period; the detail states the rows behind it. Both read the SAME
 * `FinancialsCardVM`, so a number cannot differ between them: `ledgerPeriods` is the server's own
 * grouping, already placed by `billable_on`, and this only renames and formats.
 *
 * Two things are deliberately absent.
 *
 * NO RUNNING BALANCE. `ledger_transactions` provides no authoritative running balance, and
 * computing one here would invent an ordering the backend does not guarantee. Two rows on the same
 * date have no canonical sequence, so any running total would be one of several equally defensible
 * answers presented as the answer.
 *
 * NO STORED KEYS ON SCREEN. `categoryLabel` and `glAccountName` come from configuration
 * (`chargeCategoryLabel`, `gl_account_mappings`); a row whose GL is genuinely unmapped renders null
 * rather than a raw key, because "unmapped" is a real state an operator needs to see.
 */
export function adaptFinancialsVmToLedgerPeriods(input: {
    vm: FinancialsCardVM;
    currency: string;
    /**
     * The current period. It opens, and so does the NEAREST FUTURE period with activity — the
     * scheduled drafts an operator is about to bill; older periods stay closed until asked for.
     */
    openPeriodKey: string | null;
}): FinancialsLedgerPeriod[] {
    const { vm, currency } = input;
    const chargePeriods = adaptChargePeriods(vm, currency);
    return placePaymentActivity(chargePeriods, paymentTimelineEntries(vm, currency), input.openPeriodKey);
}

/*
 * ── W7-F026: ONE TIMELINE, NOT A LEDGER AND A PAYMENT REPORT ──────────────────────────────────
 *
 * Measured on Director QA: the account read as a charge ledger, then a separate PAYMENT band at
 * the bottom ("No payment method on file / Take or record payment →"), then an "Upcoming" heading
 * over nothing. Payments were separated because `vm.ledgerPeriods` is built from charge rows alone
 * and receipts were a second evidence list, drawn as a second table under the Payments lens; the
 * band was the Payment command's own body, re-hosted under the ledger.
 *
 * The account's activity is ONE chronology. A receipt, money going back out and a collection still
 * in flight are rows in the billing period their date falls in, beside the charges of that period.
 * Nothing here decides money: every figure and every state is `presentPayments`' (the same
 * presenter the Payment surface reads) or the collection lifecycle's. This places and formats.
 */

/** A `YYYY-MM-DD` reading of a timestamp, or null — never a guess. */
function ymd(value: string | null | undefined): string | null {
    return /^(\d{4}-\d{2}-\d{2})/.exec((value ?? "").trim())?.[1] ?? null;
}

function paymentTimelineEntries(vm: FinancialsCardVM, currency: string): LedgerEntry[] {
    const byId = new Map(vm.payments.map((p) => [p.paymentId, p]));
    const presented = presentPayments(
        vm.payments,
        Object.fromEntries(vm.payments.map((r) => [r.paymentId, r.heldCents ?? 0])),
    );
    const entries: LedgerEntry[] = presented.map((p) => {
        const row = byId.get(p.paymentId);
        const date = ymd(row?.receivedAt) ?? ymd(row?.postedAt);
        const cur = p.currencyCode || currency;
        /*
         * COMPACT ALLOCATION STATE, never the allocations. A receipt says whether it is answering
         * obligations; WHICH ones is Payment Details' to show.
         */
        const allocationLabel =
            p.kind !== "receipt" || !p.isMoney ? null
            : p.unappliedCents > 0 ?
                p.appliedCents > 0 ? `Part applied · ${money(p.unappliedCents, cur)} unapplied` : `${money(p.unappliedCents, cur)} unapplied`
            : "Applied";
        /*
         * W7-F032: ONE STATUS WORD, NO SUB-LINE. Received money that answers its obligations simply
         * reads Received; money still answering nothing is a state an operator acts on, so it reads
         * Unapplied / Part applied instead. Which charges it answers is Payment Details'.
         */
        const status =
            p.kind === "refund" ? "Refunded"
            : p.kind === "return" ? "Returned"
            : !p.isMoney ? p.statusLabel
            : p.unappliedCents > 0 ? (p.appliedCents > 0 ? "Part applied" : "Unapplied")
            : "Received";
        /* W7-F032: who PAID — the payment's own payer; the household only when it names nobody. */
        const party = row?.payerName ?? (row?.payerKind === "agency" ? "Agency" : row?.payerLabel ?? null);
        return {
            when: displayDate(date) ?? "—",
            dateIso: date,
            subject: "—",
            subjectMemberId: null,
            type: "payment",
            /* The settlement account this tender maps to — never the revenue of what it paid. */
            glCode: row?.glCode ? (row.glAccountName ? `${row.glCode} · ${row.glAccountName}` : row.glCode) : null,
            /* W7-F042: an Unmapped receipt says which kind of unmapped it is. */
            glNote:
                row?.glState === "before_stamping" ? "Recorded before payment destinations were tracked — not back-filled"
                : row?.glState === "unconfigured_at_receipt" ? "No destination was configured for this method when it was received"
                : null,
            responsibleParty: null,
            responsibilityUnassigned: false,
            label: p.kind === "receipt" ? "Payment" : p.kind === "refund" ? "Refund" : "Returned",
            /* Account-balance direction: money in reduces what is owed, money back out restores it. */
            amount: `${p.kind === "receipt" ? "−" : ""}${money(p.receivedCents, cur)}`,
            kind: p.kind === "receipt" ? "credit" : "charge",
            status,
            lens: "payments",
            payment: {
                paymentId: p.paymentId,
                kind: p.kind,
                statusLabel: status,
                methodLabel: row?.methodDisplay ?? (p.methodLabel || null),
                payerLabel: party,
                payerIsPerson: Boolean(row?.payerName),
                allocationLabel,
                unapplied: p.kind === "receipt" && p.isMoney && p.unappliedCents > 0,
                openable: true,
            },
        };
    });
    /* Money on its way, in the collection lifecycle's own words — a row until it is recognised. */
    for (const c of vm.openCollections ?? []) {
        const rail = (c.rail === "ach" ? "ach" : "card") as CollectionRail;
        const state = collectionLifecycle({
            rail,
            processorState: c.processorState,
            providerActionType: c.providerActionType,
            canonicallyRecognized: false,
        });
        const date = ymd(c.updatedAt);
        entries.push({
            when: displayDate(date) ?? "—",
            dateIso: date,
            subject: "—",
            subjectMemberId: null,
            type: "payment",
            glCode: null,
            responsibleParty: null,
            responsibilityUnassigned: false,
            label: "Payment",
            amount: `−${money(c.amountCents, c.currencyCode || currency)}`,
            kind: "credit",
            status: lifecycleLabel(state, rail),
            lens: "payments",
            payment: {
                paymentId: c.attemptId,
                kind: "collection",
                statusLabel: lifecycleLabel(state, rail),
                methodLabel: rail === "ach" ? "Bank transfer" : "Card",
                payerLabel: null,
                allocationLabel: null,
                unapplied: false,
                openable: false,
            },
        });
    }
    return entries;
}

/**
 * Put each payment event in the billing period its date falls in, order every period's activity
 * newest first, and decide which periods open.
 *
 * A date no charge period covers gets the month that contains it — a month in which money arrived
 * and nothing was billed is still a month with activity. Its summary says exactly that rather than
 * "Balance $0.00", which would be a claim about charges the period does not have.
 */
function placePaymentActivity(
    periods: FinancialsLedgerPeriod[],
    payments: LedgerEntry[],
    openPeriodKey: string | null,
): FinancialsLedgerPeriod[] {
    const out = periods.map((p) => ({ ...p, entries: [...p.entries] }));
    for (const entry of payments) {
        const d = entry.dateIso ?? null;
        let home = d ? out.find((p) => p.start && p.end && p.start <= d && d <= p.end) : undefined;
        if (!home) {
            /* An undated event is not given a date; it is shown with the current period's activity. */
            const period = billingPeriodForDate(d ?? `${(openPeriodKey ?? "").slice(0, 7) || "1970-01"}-01`);
            home = out.find((p) => p.key === period.key);
            if (!home) {
                home = { key: period.key, start: period.start, end: period.end, label: period.label, summary: "No charges", open: false, entries: [] };
                out.push(home);
            }
        }
        home.entries.push(entry);
    }
    for (const p of out) {
        /* Stable: same-day rows keep the read model's order, charges before the money that met them. */
        p.entries.sort((a, b) => (b.dateIso ?? "").localeCompare(a.dateIso ?? ""));
    }
    const order = sortBillingPeriodKeysDescending(out.map((p) => p.key ?? ""));
    out.sort((a, b) => order.indexOf(a.key ?? "") - order.indexOf(b.key ?? ""));
    const current = openPeriodKey ? out.find((p) => p.key === openPeriodKey) ?? null : null;
    const currentEnd = current?.end ?? (openPeriodKey ? billingPeriodForDate(`${openPeriodKey.slice(0, 7)}-01`).end : null);
    /* The nearest future period with activity: smallest start after the current period ends. */
    const nextFuture = currentEnd
        ? out
              .filter((p) => p.start && p.start > currentEnd && p.entries.length > 0)
              .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))[0] ?? null
        : null;
    return out.map((p) => ({ ...p, open: p.key === openPeriodKey || p === nextFuture }));
}

function adaptChargePeriods(vm: FinancialsCardVM, currency: string): FinancialsLedgerPeriod[] {
    return vm.ledgerPeriods.map((group) => ({
        key: group.period.key,
        start: group.period.start,
        end: group.period.end,
        label: group.period.label,
        /*
         * "CLOSED" WAS A WORD THIS LINE HAD NO RIGHT TO. It was printed whenever the period's total
         * came to zero — including a FUTURE period holding a scheduled charge, and a period whose
         * charges and credits happen to cancel. Closed is a real and different fact in this
         * platform: an ACCOUNTING period is closed by configuration and the database then refuses
         * writes into it. Using the same word for "these rows sum to nothing" invites an operator
         * to believe a month is final when it is open and still moving.
         */
        summary: `Balance ${money(group.totalCents, currency)}`,
        open: false,
        entries: group.rows.map((row) => ({
            when: displayDate(row.date) ?? "—",
            dateIso: ymd(row.date),
            // The account, not a child, when a household charge has no participant subject.
            subject: row.subjectName ?? "Household",
            /* The same fact the account scopes by. The label is for reading; this is for filtering. */
            subjectMemberId: row.subjectMemberId ?? null,
            type: row.categoryKey,
            glCode:
                row.glCode ?
                    row.glAccountName ? `${row.glCode} · ${row.glAccountName}`
                    :   row.glCode
                :   null,
            label: row.description ?? row.categoryLabel,
            amount: money(row.amountCents, currency),
            kind: row.amountCents < 0 ? "credit" : "charge",
            status: row.lifecycleStatus,
            source: row.categoryLabel,
            responsibleParty: row.responsiblePartyName,
            responsibilityUnassigned: row.responsibilityUnassigned,
            /* So a reversal can be named a Reversal rather than falling through to its category. */
            correctionKind: row.correctionKind,
            /* PARTIAL is a state, not an inference: both halves travel with the name. */
            responsibilityAssignedCents: row.responsibilityAssignedCents,
            responsibilityUnassignedCents: row.responsibilityUnassignedCents,
            /*
             * The decision behind the money, formatted once here so both deep surfaces state the
             * same thing. This adapter decides nothing about the reduction — `reductionProvenance`
             * already read it; this only turns the period into the operator's words.
             */
            reduction: row.reduction
                ? {
                      applicationId: row.reduction.applicationId,
                      concept: row.reduction.concept,
                      conceptLabel: row.reduction.conceptLabel,
                      recurrenceLabel: row.reduction.recurrenceLabel,
                      decidedBy: row.reduction.decidedBy,
                      basisSummary: row.reduction.basisSummary,
                      explanation: row.reduction.explanation,
                      sourceChargeId: row.reduction.sourceChargeId,
                      periodLabel: row.reduction.periodKey ? billingPeriodLabel(row.reduction.periodKey) : null,
                      reversesApplicationId: row.reduction.reversesApplicationId,
                      reversedByApplicationId: row.reduction.reversedByApplicationId,
                  }
                : null,
            /* Borrowed, not restated — the one classifier both Financials surfaces filter by. */
            lens: ledgerLensOf(row),
            /*
             * Identity and eligibility, both decided by the read model. The card asks whether a row
             * offers a transition; it never works out the answer from a status string.
             */
            chargeId: row.chargeId,
            awaiting: row.awaiting
                ? { key: row.awaiting.key, label: row.awaiting.label, explanation: row.awaiting.explanation, postsOn: row.awaiting.postsOn }
                : null,
            /*
             * W7-F027: no ledger row offers Post. A Scheduled charge activates by itself; the drafts
             * that genuinely need a person (review, a failed post, a legacy draft) are posted from
             * Charge Details, where the reason is stated beside the act.
             */
            offersPost: false,
            offersReverse: row.offersReverse,
        })),
    }));
}

/**
 * A configured charge template → the approved command card's option.
 *
 * Everything here comes from `financial_charge_templates` via the read model. The card hardcodes no
 * category, no dating rule and no responsibility; it renders what configuration declares, in
 * configuration's own labels.
 *
 * Some of the template's declared behaviour is not projected by the read model yet
 * (`allowsDateOverride`, `payerTargeting`, `requiresSubject`, `requiresNote`). Those are stated
 * conservatively rather than optimistically: dates are NOT overridable and a payer is NOT
 * targetable unless the platform says so, because the failure of guessing wrong is an operator
 * being offered a control the domain will refuse.
 */
export function adaptChargeTemplateOption(
    tpl: FinancialsChargeTemplateOption,
    currency: string,
): ChargeTemplateOption {
    return {
        key: tpl.id,
        label: tpl.label,
        amountStrategy:
            tpl.amountStrategy === "fixed" ? "fixed"
            : tpl.amountStrategy === "rate_derived" ? "rate_derived"
            :   "manual",
        amount: tpl.amountCents != null ? money(tpl.amountCents, tpl.currencyCode || currency) : null,
        occursOn: tpl.occursOnStrategy,
        billableOn: tpl.billableOnStrategy,
        // `responsibility` is a template column the read model does not project; the household is
        // the only responsibility Alloy can currently attribute a childcare charge to.
        responsibility: "Household",
        allowsDateOverride: false,
        payerTargeting: "default_split",
        requiresSubject: true,
        requiresNote: tpl.amountStrategy !== "fixed",
        /* The server's answer, carried across unchanged. This adapter formats; it decides nothing. */
        reviewRequired: tpl.reviewRequired,
        /*
         * The category, so the command can honour the CODE-OWNED grain rule: a template whose
         * category does not permit child grain must not offer a child selection at all. Carried,
         * never interpreted here.
         */
        categoryKey: tpl.categoryKey,
        /* Null = chargeable. Otherwise the catalog item is shown, disabled, with the server's reason. */
        unavailableReason: tpl.availability === "offerable" ? null : tpl.unavailableReason,
        accountLabel: tpl.accountLabel,
    };
}

/**
 * The command card's display values, from the DOMAIN's own preview.
 *
 * `previewSummary` and `previewChanges` are what `mode: "preview"` returned — the same resolver the
 * write uses, so what the operator confirms is what gets persisted. Nothing about the charge is
 * computed here; this only places the domain's answer into the approved layout.
 */
export function adaptAddChargeSpecimen(input: {
    template: ChargeTemplateOption;
    subjectLabel: string;
    /** Operator-entered amount, for a template whose strategy leaves it open. */
    amount: string;
    note: string;
    period: string;
    balanceCents: number;
    currency: string;
    /**
     * The DOMAIN's preview: `mode: "preview"` runs the same resolver the write uses, and returns
     * the resolved amount plus the dating it applied ("Occurs …", "Billable …", "Applies to …").
     */
    previewSummary: string | null;
    previewChanges: readonly string[];
    /**
     * What the chosen discount is worth against this charge, as `resolveFinancialReductions`
     * priced it. `null` is a real answer — no discount applies, or none was chosen — and is not
     * the same as zero.
     */
    discountCents?: number | null;
}): AddChargeSpecimen {
    /*
     * The domain states its resolved dating as "Occurs 2026-09-18" / "Billable 2026-10-01". The
     * value is canonical; the FORMAT is storage's, so it is rendered as a date an operator reads
     * rather than as the ISO string the resolver happened to return.
     */
    /*
     * The same lookup as `line`, before the ISO is turned into a display date. The period
     * derivation needs the canonical value, not the rendering of it.
     */
    const rawLine = (prefix: string): string | null =>
        input.previewChanges.find((c) => c.toLowerCase().startsWith(prefix))?.slice(prefix.length).trim() ?? null;

    const sentence = (prefix: string): string | null => {
        const raw = rawLine(prefix)?.replace(/^·\s*/, "");
        return raw ? raw.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => displayDate(iso) ?? iso) : null;
    };

    const line = (prefix: string): string | null => {
        const raw =
            input.previewChanges.find((c) => c.toLowerCase().startsWith(prefix))?.slice(prefix.length).trim()
            ?? null;
        if (!raw) return null;
        const iso = raw.match(/^\d{4}-\d{2}-\d{2}$/) ? raw : null;
        return iso ? (displayDate(iso) ?? raw) : raw;
    };

    /*
     * The resolved amount, read back out of the preview summary the domain composed
     * (`\`${templateKey} ${amount}\``). Parsed rather than recomputed: the resolver may price a
     * rate-derived template in a way this side cannot reproduce, and a second answer here would be
     * exactly the drift the adapter exists to prevent.
     */
    const resolvedAmount = input.previewSummary?.match(/[$][\d,]+\.\d{2}/)?.[0] ?? null;

    /*
     * ── THE CONSEQUENCE, IN THREE CANONICAL FIGURES ─────────────────────────────────────────
     *
     * Gross is the resolver's, read back out of the summary it composed — the same string the
     * card already prints, in cents so it can be added to. Discount is the resolver's too. Net is
     * the one subtraction, and it is done HERE rather than in the card because this adapter is
     * already the place the domain's answer becomes the card's display, and a component that
     * subtracts money is a component that can disagree with the resolver.
     *
     * `null` propagates rather than collapsing to zero: a preview that has not resolved a gross
     * yet must say nothing about the net, not claim it is $0.00.
     */
    const grossCents = centsFromMoney(resolvedAmount ?? input.amount);
    /*
     * ── THE SIGN IS THE DOMAIN'S, AND IT IS NEGATIVE ────────────────────────────────────────
     *
     * `AppliedReduction.amountCents` is documented as "NEGATIVE cents. The sign is the direction
     * money moves, and it is stored, not inferred." This first shipped assuming a magnitude, and
     * the mounted pass caught both halves of that mistake on deployed staging: the line read
     * "--$40.00" because a minus was prefixed to an already-signed figure, and the net read
     * "$440.00" because subtracting a negative ADDS it — a $400 charge with a 10% discount
     * previewed as costing MORE than its gross.
     *
     * So the sign is honoured rather than corrected: the net is gross PLUS the reduction, which
     * is the same arithmetic the ledger does when the reduction posts as its own negative row.
     */
    const discountCents = input.discountCents ?? null;
    const netCents =
        grossCents == null ? null : grossCents + (discountCents ?? 0);

    /*
     * ── WHAT CONFIRMING ACTUALLY DOES, WHICH IS NOT WHAT THIS ONCE SAID ─────────────────────
     *
     * `charge.add` writes a DRAFT (`writeTemplateDraftCharge` — "never posts"), and then, only
     * where no review boundary applies, posts it in the same gesture through the canonical
     * `postChildcareCharge`. So there are two consequences and they are different, and the card
     * already branches on exactly that flag.
     *
     * What was wrong was the figure. The unposted branch is right that the balance does not move
     * — and the posted branch was handed the SAME unchanged balance, so a +$400.00 charge
     * previewed as "After posting $536.00" against a current balance of $536.00. The operator was
     * shown, in bold, that pressing the button changes nothing.
     *
     * The projection adds the GROSS, not the net, because the reduction is a separate consequence
     * written beside the charge later: `applyFinancialReductions` — "GROSS STAYS GROSS" — posts
     * the discount as its own negative row when discounts run. A projection that quietly netted
     * it here would promise a balance this action does not produce.
     */
    const postedBalanceCents = grossCents == null ? null : input.balanceCents + grossCents;
    return {
        template: input.template,
        subject: input.subjectLabel,
        amount: resolvedAmount ?? input.amount,
        /*
         * Dating comes from the preview, in the domain's own words — never the template's raw
         * strategy key. "event_date" is a stored value, and printing it on an operator card is the
         * labels-not-keys rule broken in the one place an operator is about to commit money.
         */
        serviceDate: line("occurs") ?? "Resolved at commit",
        serviceDateIso: (() => {
            const raw = rawLine("occurs");
            return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
        })(),
        /*
         * ── THE BILLING PERIOD IS THE SERVER'S, CONTAINING THE SERVICE DATE ─────────────────
         *
         * This used to derive the period HERE, from the invoice date, through a calendar-month
         * helper — a second derivation that followed invoice timing into the next cycle (the W7
         * "Nov 5 → December" defect) and ignored the household's own billing calendar. The period
         * is now resolved once, by the date chain the write uses, and this only places its label.
         * With no answer yet it falls back to the account's own period label as before.
         */
        period: (() => {
            const raw = rawLine("billing period");
            if (!raw) return input.period;
            /* "November 2026 · 2026-11-01 → 2026-11-30" → the label; a refusal sentence is kept whole. */
            const cleaned = raw.replace(/^·\s*/, "");
            return cleaned.includes(" · ") ? cleaned.slice(0, cleaned.indexOf(" · ")) : cleaned;
        })(),
        invoiceDate:
            input.previewSummary == null ? "\u2014"
            : (line("invoice date") ?? "On the service date"),
        /* The server's sentences, with its ISO dates rendered as dates an operator reads. */
        dateRules: {
            invoice: sentence("invoice timing"),
            due: sentence("payment terms"),
        },
        /*
         * W7-F017: a charge type that overrides the organisation's invoice timing is stated on the
         * form, not left in a tooltip — it is the exception an operator would otherwise have to
         * reverse-engineer from the dates.
         */
        invoiceOverride: (() => {
            const raw = sentence("invoice timing");
            if (!raw || !/\(charge-type override\)/.test(raw)) return null;
            return raw.slice(0, raw.indexOf(" (charge-type override)")).trim() || null;
        })(),
        posting: sentence("posting"),
        /* The day a future-period charge posts itself, when the chain says it waits for its period. */
        awaitsPeriodUntil: (() => {
            const iso = rawLine("posting")?.match(/Scheduled until (\d{4}-\d{2}-\d{2})/)?.[1];
            return iso ? (displayDate(iso) ?? iso) : null;
        })(),
        /*
         * ── DUE: A DATE, AN HONEST ABSENCE, OR NOT YET KNOWN — NEVER A MECHANISM ────────────
         *
         * This was the literal string "Configured policy" on every charge, on a field the model
         * documents as `charges.due_date`. Measured on deployed staging: `due_date` is populated on
         * 37 of 125 rows — 33 of them AFTER `billable_on` — so the card was hiding a real date on
         * the rows that had one and implying a policy on the 88 that did not.
         *
         * The organisation's `due_date` policy is the only authority, `resolveDueDate` is its only
         * resolver, and `null` from it means "no terms stated" — deliberately, so that nothing
         * defaults to a collections deadline nobody chose. So there are three answers and they are
         * different:
         *
         *   · the preview resolved a date      → say the date
         *   · the preview answered, no date    → no terms are configured; say so
         *   · the preview has not answered yet → NOT YET KNOWN, which is an em dash here
         */
        due:
            input.previewSummary == null ? "\u2014"
            : (line("due") ?? "No due date"),
        overridden: null,
        chargeTo: input.template.responsibility,
        // Allocation renders ONLY when the split is authoritative. Alloy has no allocation store.
        allocation: null,
        note: input.note,
        previewBefore: money(input.balanceCents, input.currency),
        /*
         * Retained as the UNPOSTED reading — the balance a draft leaves untouched. The card shows
         * it only on the branch where confirming genuinely does not post.
         */
        previewAfter: money(input.balanceCents, input.currency),
        /** The gross this charge is raised at, as the domain resolved it. */
        previewGross: resolvedAmount ?? (grossCents != null ? money(grossCents, input.currency) : null),
        /** The same figure in cents. Zero is an answer; null is the absence of one. */
        previewGrossCents: grossCents,
        /**
         * What the chosen discount takes off it, already carrying the domain's minus sign, or null
         * when none does. Callers render it as-is; prefixing another sign is the defect above.
         */
        previewDiscountAmount: discountCents != null ? money(discountCents, input.currency) : null,
        /** Gross less that discount — what this charge is expected to come to. */
        previewNet: netCents != null ? money(netCents, input.currency) : null,
        /** The balance once this charge posts, which is the gross away. Null when unresolved. */
        previewPostedBalance:
            postedBalanceCents != null ? money(postedBalanceCents, input.currency) : null,
    };
}

/**
 * Cents from a formatted money string — the inverse of `money()`, for the one place a canonical
 * figure arrives already formatted and has to be added to another.
 *
 * Deliberately strict: anything that is not a plain currency amount returns null, so an
 * unresolved preview stays unresolved rather than becoming a confident zero.
 */
function centsFromMoney(value: string | null | undefined): number | null {
    if (!value) return null;
    const m = value.match(/-?[\d,]+\.\d{2}/);
    if (!m) return null;
    const n = Number(m[0].replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
}

/**
 * ── THE DETAILS ANATOMY BEFORE ITS DATA ARRIVES ─────────────────────────────────────────────────
 *
 * Opening Details used to produce FOUR surfaces in a row: the compact card, then a pending card,
 * then a second card at a different size, then the hydrated detail. The cause was structural, not
 * cosmetic — the Details tree was guarded on `vm && reconciliation`, so while the deep read was in
 * flight the component fell THROUGH the Details branch into the generic card below it and rendered
 * a different anatomy at a different span. The operator watched the surface be rebuilt underneath
 * them, twice, after an interaction they had already committed to.
 *
 * The answer is not a spinner and not a delay. It is that the SHAPE of Details is known the instant
 * the operator asks for it — the metric row, the two commands, the lenses, the ledger's eight
 * columns — while only the VALUES are still being read. So this returns that shape with every
 * figure as an em dash, which is the card's own vocabulary for "no answer yet" and is the one thing
 * a placeholder must never be mistaken for: a zero. `$0.00` here would be a financial claim about
 * a family, made by a loading state.
 *
 * Nothing about it is a second model. It is the same `FinancialsEvidence` the adapter returns, with
 * no rows, no payers and no payments, so the card cannot render a fact nobody has read yet.
 */
export function hydratingFinancialsEvidence(): FinancialsEvidence {
    const dash = "—";
    return {
        caseLabel: "",
        compact: { dueLine: dash, lines: [], paymentLine: null, paymentHealthy: false },
        subjects: [],
        period: {
            label: dash,
            charges: [],
            reductions: [],
            funding: [],
            familyResponsibility: dash,
            responsibility: null,
            expectedFunding: [],
            collectibleNow: null,
            paymentsReceived: dash,
            currentBalance: dash,
            dueNow: dash,
            availablePrepaid: null,
            heldFunds: null,
            dueLabel: "",
        },
        /*
         * NOT `null`. Null is the card's answer for "nothing is past due", which is a fact about
         * the family that nobody has established yet. The hydrating frame says it does not know.
         */
        pastDue: null,
        ledger: [],
        payers: [],
        payment: { autopayLabel: null, autopayHealthy: false, nextChargeLabel: null },
        payments: [],
        adjustments: [],
        /* The degraded payload claims no holds rather than inventing an empty position. */
        heldDeposits: [],
        heldDepositHistory: [],
    };
}
