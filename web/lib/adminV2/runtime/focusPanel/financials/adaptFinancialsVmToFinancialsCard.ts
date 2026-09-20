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
} from "@/lib/cardLab/cardLabTypes";
import { billingPeriodLabel } from "@/lib/financials/billingPeriod";
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
     * THE SHARE IS REAL NOW. This comment used to say the opposite, and it was right at the time:
     * the read model named payers from the `payer` CONTACT role and carried no `share`, because
     * nothing anywhere recorded that Jordan carries 70%. Thread 6 built that record, so a payer
     * arrives here because a persisted responsibility allocation named them, and their share is the
     * cents that allocation assigned — never a percentage derived here.
     *
     * `method` is still null, and for the original reason: there is no per-payer payment method
     * store, and inventing one here would repeat exactly the mistake this note was written about.
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
            dueNow: money(vm.collectible.currentlyCollectibleCents, currency),
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
        },
        pastDue,
        // The summary card renders no ledger; the rows are the detail's subject.
        ledger: [],
        payers,
        payment: {
            /*
             * AUTOPAY IS NOT A PAYMENT METHOD, and this used to say it was: it read the payment
             * setup line — a hardcoded null at the time — into the autopay slot, so a family with a
             * card on file would have been labelled as having autopay, and every family was labelled
             * as not having it. Two different questions had one answer.
             *
             * There is no canonical autopay anywhere in the platform: no table, no column, no
             * writer. `resolvePaymentSetup` reports that as `unsupported` with the reason, and the
             * label here is that reason's short form — never a state derived from something else.
             */
            autopayLabel: null,
            autopayHealthy: false,
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
    /** Only the current period opens; prior periods are closed until asked for. */
    openPeriodKey: string | null;
}): FinancialsLedgerPeriod[] {
    const { vm, currency } = input;
    return vm.ledgerPeriods.map((group) => ({
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
        open: group.period.key === input.openPeriodKey,
        entries: group.rows.map((row) => ({
            when: displayDate(row.date) ?? "—",
            // The account, not a child, when a household charge has no participant subject.
            subject: row.subjectName ?? "Household",
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
            offersPost: row.status === "draft",
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
}): AddChargeSpecimen {
    /*
     * The domain states its resolved dating as "Occurs 2026-09-18" / "Billable 2026-10-01". The
     * value is canonical; the FORMAT is storage's, so it is rendered as a date an operator reads
     * rather than as the ISO string the resolver happened to return.
     */
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
        period: line("billable") ?? input.period,
        due: "Configured policy",
        overridden: null,
        chargeTo: input.template.responsibility,
        // Allocation renders ONLY when the split is authoritative. Alloy has no allocation store.
        allocation: null,
        note: input.note,
        previewBefore: money(input.balanceCents, input.currency),
        /*
         * THE BALANCE DOES NOT MOVE, and this field says so.
         *
         * It once carried `balance + amount`, which claimed a posted increase that confirming the
         * command does not cause: Add charge creates a DRAFT, and a draft is not owed until it
         * posts. The charge amount is the implication the operator is authorising; the balance is a
         * fact that is unchanged by authorising it.
         */
        previewAfter: money(input.balanceCents, input.currency),
    };
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
        historyLine: "",
        upcoming: [],
        payments: [],
        adjustments: [],
    };
}
