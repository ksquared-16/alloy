"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { Action, ActionRow, FooterAction } from "@/components/cardLab/CardLabKit";
import { Stat } from "@/components/operationalCards/FinancialsDetailCard";
import type { FinancialsEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Financials — the family's financial operating surface, at full row width.
 *
 * Named Financials rather than Billing because the card carries charges, fees, funding, credits,
 * payer responsibility, payments, past due, payment setup and history. The Business Process may
 * still be called Billing; the card is broader than it.
 *
 *   header          names the card. No money: a summary here duplicated the zones below it.
 *   three zones     Current period · Past due · Payment
 *   history line    one quiet line of context — never a ledger reproduction
 *   footer          Manage payment · Details
 *
 * ── WHY THESE THREE ZONES ──
 *
 * The card's three questions are what is the bill, is anything overdue, and how is it being paid.
 * A Recent Ledger zone answered a fourth question the card was not asked, and mostly RESTATED the
 * first: tuition and fees appeared in both zones. The ledger belongs in Billing detail.
 *
 * ── CURRENT PERIOD RECONCILES ──
 *
 * In `CHARGE_CATEGORIES`, `subsidy_offset` is a CHARGE CATEGORY, not a payment. So subsidy reduces
 * FAMILY RESPONSIBILITY, while payments — a separate object (`payments` + `payment_allocations`) —
 * reduce BALANCE. The zone therefore shows two totals, not one:
 *
 *     gross charges − discounts/credits − funding = family responsibility
 *     family responsibility − payments received   = current balance
 *
 * and Past Due is the portion of that balance whose `due_date` has passed. Collapsing these into a
 * single number is the error this layout exists to prevent.
 *
 * ── ONE PAYMENT EXPERIENCE ──
 *
 * Payers, methods, autopay and the responsibility split are one operator concern, so there is one
 * `Manage payment` destination rather than three unrelated links.
 */
export default function FinancialsCard({
    evidence,
    span = "row",
    onDetails,
    onAddCharge,
    onPayNow,
    onManagePayment,
    summaryVariant = "period",
}: {
    evidence: FinancialsEvidence;
    /**
     * ONE card, ONE read model, presentation derived from the EXISTING primitives:
     * `FocusPanelCardDensity` (micro · compact · standard · expanded) and
     * `FocusPanelCardSpan` (1 · 2 · "row"). No parallel density system, and no second card.
     *
     *   span 1    → the COMPACT policy: is money owed, why at a glance, is payment healthy,
     *               and the three actions. For processes where Financials is supporting context.
     *   span row  → the SUMMARY policy: the full Current Period / Past Due / Payment composition.
     *
     * Density never changes ownership, the arithmetic, or which canonical actions exist — only how
     * many of the card's questions this placement chooses to answer.
     */
    span?: 1 | "row";
    onDetails?: () => void;
    onAddCharge?: () => void;
    /** Wired by the Focus Panel; the lab leaves them undefined and the buttons are inert. */
    onPayNow?: () => void;
    onManagePayment?: () => void;
    /**
     * WHICH QUESTION THE SUMMARY IS ANSWERING.
     *
     *   "period"   the Focus Panel's reconciliation — what happened this billing period, with the
     *              arithmetic visible, because the panel is where a period is worked.
     *   "account"  the Financials workspace's account header — the standing position of the
     *              ACCOUNT, which is three figures and two commands and nothing else. An account
     *              is not a period, and reading a period breakdown as an account state is how an
     *              operator ends up quoting a family a number that was only ever this month's.
     *
     * The detail beneath the account summary carries everything the period breakdown used to say
     * here, filtered and period-grouped, so nothing was removed from the surface — only from the
     * header, which now has one job.
     */
    summaryVariant?: "period" | "account";
}) {
    if (summaryVariant === "account") {
        return (
            <FinancialsAccountSummaryCard
                evidence={evidence}
                onAddCharge={onAddCharge}
                onPayNow={onPayNow}
            />
        );
    }
    if (span === 1) {
        return (
            <FinancialsCompactCard
                evidence={evidence}
                onDetails={onDetails}
                onAddCharge={onAddCharge}
                onPayNow={onPayNow}
            />
        );
    }
    const { period, pastDue } = evidence;

    return (
        /*
         * ── ONE CARD ROOT OWNS THE MARKER ──────────────────────────────────────────────────────
         *
         * This element used to carry `data-financials-card="true"` as well, and it renders INSIDE
         * the placement shell that carries it — so mounted instrumentation counted two cards where
         * one was on screen, both reporting the same box, and every selector that asked for "the
         * card" got an ambiguous answer. It is a structural element of one card, not a second card.
         *
         * The root is the placement shell: it is what carries the account, the subject filter, the
         * overlay and the reserved-geometry marker. This is its BODY, and says so. Nothing about
         * the DOM's shape changed — only which element claims to be the thing.
         */
        <div className="alloy-os-billing" data-financials-card-body="true">
            <UniversalCard
                title="Financials"
                insight=""
                iconName="Receipt"
                tier="context"
                archetype="status"
                density="compact"
                gridSpan="row"
                data-universal-card-key="financials"
                footerAction={null}
            >
                <div className="alloy-os-billing__zones alloy-os-billing__zones--two">
                    <section className="alloy-os-billing__zone">
                        <p className="alloy-os-billing__zone-head">Current period</p>
                        <p className="alloy-os-billing__period">{period.label}</p>
                        <div className="alloy-os-billing__lines">
                            <Group>Charges</Group>
                            {period.charges.map((l) => (
                                <Line key={l.label} label={l.label} value={l.value} />
                            ))}
                            {period.reductions.length ? <Group>Discounts &amp; credits</Group> : null}
                            {period.reductions.map((l) => (
                                <Line key={l.label} label={l.label} value={l.value} />
                            ))}
                            {period.funding.length ? <Group>Funding</Group> : null}
                            {period.funding.map((l) => (
                                <Line key={l.label} label={l.label} value={l.value} />
                            ))}
                            {/* ── THE NET OBLIGATION, CALLED THAT ────────────────────────────
                                Gross plus discounts, funding and adjustments. It was labelled
                                "Responsibility", which is also the word for the split immediately
                                beneath it, so one amount stood for two concepts: what the family
                                owes after reductions, and who owes it. */}
                            <Line label="Net obligation" value={period.familyResponsibility} emphasis />
                            {/* ── WHO OWES IT ────────────────────────────────────────────────
                                Thread 6's persisted allocations, named and in cents. Rendered only
                                when an allocation exists — a split invented here would assign real
                                money to real people on no record.

                                UNASSIGNED IS SHOWN, not folded into the household. Money nobody has
                                been made responsible for is the most actionable fact on this card,
                                and quietly attributing it is the behaviour the platform decided
                                against. */}
                            {period.responsibility ? (
                                <>
                                    <Group>Responsibility</Group>
                                    {period.responsibility.parties.map((party) => (
                                        <Line key={party.name} label={party.name} value={party.amount} />
                                    ))}
                                    {period.responsibility.unassigned ? (
                                        <Line label="Unassigned" value={period.responsibility.unassigned} />
                                    ) : null}
                                </>
                            ) : null}
                            {/* ── EXPECTED, AND SAID SO ──────────────────────────────────────
                                Funding that has not arrived is not a payment and reduces nothing
                                owed. Stating it beside the figures — never inside a total — is what
                                keeps a subsidy from reading as a discount. */}
                            {period.expectedFunding.length ? (
                                <>
                                    <Group>Expected funding</Group>
                                    {period.expectedFunding.map((f) => (
                                        <Line
                                            key={f.label}
                                            label={f.label}
                                            value={f.amount ?? "Amount not yet known"}
                                        />
                                    ))}
                                    <p className="alloy-os-billing__split">Not yet received</p>
                                </>
                            ) : null}
                            <Line label="Payments received" value={period.paymentsReceived} />
                            <Line label="Current balance" value={period.currentBalance} emphasis />
                            {/* WHAT TO ACTUALLY ASK FOR. A submitted claim suppresses collection for
                                the amount it attributed, so the balance and the amount to collect
                                stop being the same number. Both are shown: the obligation has not
                                shrunk. With nothing suppressed the line is absent rather than
                                repeating the balance. */}
                            {period.collectibleNow ? (
                                <Line label="Collectible now" value={period.collectibleNow} />
                            ) : null}
                        </div>
                        <p className="alloy-os-billing__due">{period.dueLabel}</p>
                        {/* "Add something that should be billed" is a Current Period intent, not a
                            payment one — and it stays quiet so it never competes with Pay now. */}
                        {/*
                            ONE COMMAND, ONE IDENTITY, WHICHEVER VARIANT RENDERS IT.
                            These are the same two commands the account variant offers and the same
                            handlers the same host supplies; only the presentation primitive differs.
                            So they carry the same semantic marker, and `Details` carries a
                            NAVIGATION marker instead — it goes somewhere rather than doing
                            something, which is the distinction this card's footer was composed to
                            make in the first place.
                        */}
                        <div className="alloy-os-billing__zone-actions">
                            {onPayNow ? (
                                <FooterAction onClick={onPayNow} data-financials-command="payment">
                                    Payment →
                                </FooterAction>
                            ) : null}
                            <FooterAction onClick={onAddCharge} data-financials-command="add">
                                Add →
                            </FooterAction>
                            {/* Offered only where there is somewhere to drill to. In Financials →
                                Accounts the account's own body is already open beneath this. */}
                            {onDetails ? (
                                <FooterAction onClick={onDetails} data-financials-nav="details">
                                    Details →
                                </FooterAction>
                            ) : null}
                        </div>
                    </section>

                    <div className="alloy-os-billing__collect">
                    <section className="alloy-os-billing__zone">
                        <p className="alloy-os-billing__zone-head">Past due</p>
                        {pastDue ? (
                            <>
                                <p className="alloy-os-billing__amount">{pastDue.amount}</p>
                                <p className="alloy-os-billing__age">
                                    Oldest unpaid · {pastDue.oldest}
                                    <br />
                                    {pastDue.age}
                                </p>
                                {pastDue.note ? (
                                    <p className="alloy-os-billing__decline">{pastDue.note}</p>
                                ) : null}
                                <ActionRow>
                                    <Action primary onClick={onPayNow}>
                                        Pay now
                                    </Action>
                                </ActionRow>
                            </>
                        ) : (
                            <>
                                <p className="alloy-os-billing__clear">Nothing past due</p>
                                <p className="alloy-os-billing__clear-note">{evidence.historyLine}</p>
                            </>
                        )}
                    </section>

                    <section className="alloy-os-billing__zone alloy-os-billing__zone--payment">
                        <p className="alloy-os-billing__zone-head">Payment</p>
                        <p
                            className="alloy-os-billing__autopay"
                            data-autopay-ok={evidence.payment.autopayHealthy ? "true" : undefined}
                        >
                            {/*
                             * AUTOPAY DOES NOT EXIST IN THIS PLATFORM — no table, no column, no
                             * writer. "Not recorded" implied somebody could have recorded it and
                             * had not, which is a statement about this family; the truth is about
                             * Alloy. See `resolvePaymentSetup`, which reports it `unsupported`.
                             */}
                            {evidence.payment.autopayLabel ?? "Autopay not available yet"}
                        </p>
                        {evidence.payment.nextChargeLabel ? (
                            <p className="alloy-os-billing__next">Next · {evidence.payment.nextChargeLabel}</p>
                        ) : null}
                        <div className="alloy-os-billing__payer-list">
                            {evidence.payers.map((p) => (
                                <div
                                    key={p.name}
                                    className="alloy-os-billing__payer-row"
                                    data-funding={p.funding ? "true" : undefined}
                                >
                                    <p className="alloy-os-billing__payer">
                                        <span className="alloy-os-billing__payer-name">{p.name}</span>
                                        <span className="alloy-os-billing__payer-share">{p.share}</span>
                                    </p>
                                    <p className="alloy-os-billing__payer-method">
                                        {p.method}
                                        {p.methodIssue ? (
                                            <span className="alloy-os-billing__method-issue"> · {p.methodIssue}</span>
                                        ) : null}
                                    </p>
                                </div>
                            ))}
                        </div>
                        {/*
                         * MANAGE PAYMENT OWNS payers, split, methods, autopay and recovery — so it
                         * sits under the payment facts rather than in a generic footer. It is
                         * offered ONLY when a host actually passed a handler: every write it would
                         * make needs provider tokenisation, which is not configured, and a control
                         * that opens onto nothing tells an operator a capability exists. The same
                         * gate the detail card already keeps.
                         */}
                        {onManagePayment ? (
                            <FooterAction onClick={onManagePayment}>Manage payment →</FooterAction>
                        ) : null}
                    </section>
                    </div>
                </div>

                {pastDue ? <p className="alloy-os-billing__history">{evidence.historyLine}</p> : null}
            </UniversalCard>
        </div>
    );
}

/**
 * THE ACCOUNT SUMMARY — three figures, two commands, and a hard stop.
 *
 * ── WHAT THE THREE FIGURES ARE, AND WHOSE NUMBERS THEY ARE ─────────────────────────────────────
 *
 *   Current balance   `reconciliation.balanceCents`              responsibility − payments
 *   Due               `collectible.currentlyCollectibleCents`    outstanding − claim suppression
 *   Past due          `pastDue.amountCents`                      the portion whose due date passed
 *
 * All three already existed and all three have exactly one owner each. Nothing here adds,
 * differences or re-derives; `Due` in particular is Thread 9's governed collectible figure and not
 * a fourth number invented for a header — see `FinancialsPeriod.dueNow`.
 *
 * ── AND WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────────────────────
 *
 * Responsibility, paid, autopay, current period, next charge, the charge breakdown, the discount
 * breakdown and the explanatory sentences are all GONE from the header. Every one of them is still
 * on the surface — in the filtered, period-grouped detail immediately beneath — but a summary that
 * answers nine questions answers none of them first, and an operator opening an account needs to
 * know the position before they need the composition.
 *
 * The anatomy is borrowed from Focus Panel → Financials → Details (`Stat`, `__rollup`, `__strip`,
 * `__actions`), which is the canonical Financials detail presentation. Two placements, one grammar.
 */
function FinancialsAccountSummaryCard({
    evidence,
    onAddCharge,
    onPayNow,
}: {
    evidence: FinancialsEvidence;
    onAddCharge?: () => void;
    onPayNow?: () => void;
}) {
    const { period, pastDue } = evidence;
    return (
        <div className="alloy-os-billing" data-financials-card="account">
            <UniversalCard
                title="Financials"
                insight=""
                iconName="Receipt"
                tier="context"
                archetype="status"
                density="compact"
                gridSpan="row"
                data-universal-card-key="financials"
                footerAction={null}
            >
                <div className="alloy-os-fdetail__rollup" data-financials-account-summary="true">
                    <div className="alloy-os-fdetail__rollup-facts">
                        {/*
                         * ── THREE PEERS, AT ONE SIZE ───────────────────────────────────────────
                         *
                         * Current balance carried the detail card's `strong` treatment and was
                         * therefore half again the size of the other two, which made a typographic
                         * claim nobody intended: that the balance matters more than what can be
                         * collected today or what is already late. On an ACCOUNT summary these are
                         * three answers to one question and they rank equally.
                         *
                         * Colour still carries meaning — past due in the attention treatment, a
                         * clear account in Bend Pine — because that is semantic rather than
                         * hierarchical. Size is not.
                         */}
                        <div className="alloy-os-fdetail__strip alloy-os-fdetail__strip--peers">
                            <Stat label="Current balance" value={period.currentBalance} />
                            <Stat label="Due" value={period.dueNow} />
                            <Stat
                                label="Past due"
                                value={pastDue ? pastDue.amount : "None"}
                                tone={pastDue ? "due" : "ok"}
                            />
                        </div>
                    </div>
                    {/*
                     * PRIMARY ACCOUNT COMMANDS, AS BUTTONS.
                     *
                     * These were footer links reading "Take payment →" and "Add charge →", which is
                     * the platform's idiom for navigating to somewhere else. Neither navigates:
                     * both open a command in place. `Payment` is the primary because settling is
                     * what an operator opens an account to do; `Add charge` is its peer because it
                     * changes what is owed rather than settling it.
                     */}
                    <div className="alloy-os-fdetail__actions">
                        <Action primary onClick={onPayNow} data-financials-command="payment">
                            Payment
                        </Action>
                        {/*
                         * ONE ENTRY, BOTH OBJECTS. A charge and an adjustment stay different
                         * financial objects with different writers and different permissions; what
                         * they stopped being is two unrelated PLACES. The command carries the mode.
                         */}
                        <Action onClick={onAddCharge} data-financials-command="add">
                            Add
                        </Action>
                    </div>
                </div>
            </UniversalCard>
        </div>
    );
}

/**
 * THE ACCOUNT SUMMARY BEFORE ITS FIGURES — the same anatomy, with placeholders in the value slots.
 *
 * Exported so the Focus Panel adapter renders THIS while the account is read, rather than a second
 * loading shape of its own. That is the whole point: the pending frame and the settled frame are
 * the same components with the same classes in the same positions, so the API finishing changes
 * text and never layout. A separate skeleton would drift from the card within a pass.
 *
 * The commands render, disabled and titled: an operator can see that Payment and Add charge are
 * where they will be, and cannot fire one at an account whose position is not yet known.
 */
export function AccountSummaryPending() {
    return (
        <div className="alloy-os-fdetail__rollup" data-financials-account-summary="pending" aria-busy="true">
            <div className="alloy-os-fdetail__rollup-facts">
                <div className="alloy-os-fdetail__strip alloy-os-fdetail__strip--peers">
                    {["Current balance", "Due", "Past due"].map((label) => (
                        <span key={label} className="alloy-os-fdetail__stat">
                            <span className="alloy-os-fdetail__statlabel">{label}</span>
                            {/*
                             * A PLACEHOLDER MUST NOT READ AS A VALUE.
                             *
                             * The pending slot was a pale animated bar, and at a glance a metric
                             * label above a faint grey smear reads as a label with nothing under
                             * it — which on a financial surface is indistinguishable from "this
                             * account has no balance". It now carries a visible em-dash inside the
                             * same slot, at the same size, so the frame says "not read yet" rather
                             * than appearing to state an absence, and the value replaces it in the
                             * same box with no layout shift.
                             */}
                            <span className="alloy-os-fdetail__statvalue" data-financials-card-skeleton="true">
                                <span className="alloy-os-financials__pendingvalue" aria-hidden>
                                    —
                                </span>
                                <span className="sr-only">Reading the account</span>
                            </span>
                        </span>
                    ))}
                </div>
            </div>
            <div className="alloy-os-fdetail__actions">
                <Action primary disabled title="Reading the account" data-financials-command="payment">
                    Payment
                </Action>
                <Action disabled title="Reading the account" data-financials-command="add">
                    Add
                </Action>
            </div>
        </div>
    );
}

function Group({ children }: { children: React.ReactNode }) {
    return <p className="alloy-os-billingdetail__group">{children}</p>;
}

function Line({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
    return (
        <div className={clsx("alloy-os-billing__line", emphasis && "alloy-os-billing__line--emphasis")}>
            <span className="alloy-os-billing__line-label">{label}</span>
            <span className="alloy-os-billing__line-value">{value}</span>
        </div>
    );
}

/**
 * Compact placement — same evidence, fewer questions.
 *
 * Answers: what is due · why, at a glance · is payment healthy · Pay now · Add charge · Details.
 * It deliberately does NOT reconcile: the arithmetic belongs to the summary and the detail. A
 * compact card that half-reconciles would be the worst of both.
 */
function FinancialsCompactCard({
    evidence,
    onDetails,
    onAddCharge,
    onPayNow,
}: {
    evidence: FinancialsEvidence;
    onDetails?: () => void;
    onAddCharge?: () => void;
    onPayNow?: () => void;
}) {
    const c = evidence.compact;
    return (
        <div className="alloy-os-billing" data-financials-card="compact">
            <UniversalCard
                title="Financials"
                /* Absent when the lines already carry the figure — UniversalCard hides a falsy insight. */
                insight={c.dueLine ?? ""}
                iconName="Receipt"
                tier="context"
                archetype="status"
                statusChip={evidence.pastDue ? `${evidence.pastDue.amount} past due` : undefined}
                statusTone="due"
                density="compact"
                gridSpan={1}
                data-universal-card-key="financials"
                footerAction={
                    /*
                     * ── THREE EQUAL LINKS WERE NOT A HIERARCHY ───────────────────────────────
                     *
                     * "Payment → Add charge → Details →" gave one row of the card to three
                     * arrows of identical weight, and two of them are not the same KIND of thing:
                     * Payment and Add mutate money, Details navigates. An operator scanning a
                     * compact card could not tell the primary act from the way out.
                     *
                     * Primary Payment, secondary Add, and Details as the quiet way out — which is
                     * also what lets the row sit on ONE line instead of wrapping, and is most of
                     * the height this card gives back.
                     */
                    <div className="alloy-os-billing__footer alloy-os-billing__footer--commands">
                        <span className="alloy-os-billing__footer-commands">
                            {onPayNow ? (
                                <Action primary onClick={onPayNow} data-financials-command="payment">
                                    Payment
                                </Action>
                            ) : null}
                            {/* ONE entry for both financial objects — see the note on the command. */}
                            <Action onClick={onAddCharge} data-financials-command="add">
                                Add
                            </Action>
                        </span>
                        {/* Navigation, not a mutation, and dressed as navigation. */}
                        {onDetails ? (
                            <FooterAction onClick={onDetails} data-financials-nav="details">
                                Details →
                            </FooterAction>
                        ) : null}
                    </div>
                }
            >
                <div className="alloy-os-billing__lines alloy-os-billing__lines--compact">
                    {c.lines.map((l) => (
                        <Line key={l.label} label={l.label} value={l.value} />
                    ))}
                </div>
                {/* Silence when nothing owns payment setup — see the adapter's note. */}
                {c.paymentLine ? (
                    <p
                        className="alloy-os-billing__autopay alloy-os-billing__autopay--compact"
                        data-autopay-ok={c.paymentHealthy ? "true" : undefined}
                    >
                        {c.paymentLine}
                    </p>
                ) : null}
                {evidence.pastDue ? (
                    <ActionRow>
                        <Action primary onClick={onPayNow}>
                            Pay now
                        </Action>
                    </ActionRow>
                ) : null}
            </UniversalCard>
        </div>
    );
}
