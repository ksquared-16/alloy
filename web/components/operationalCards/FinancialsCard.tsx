"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { Action, ActionRow, FooterAction } from "@/components/cardLab/CardLabKit";
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
}) {
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
        <div className="alloy-os-billing" data-financials-card="true">
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
                            <Line label="Family responsibility" value={period.familyResponsibility} emphasis />
                            <Line label="Payments received" value={period.paymentsReceived} />
                            <Line label="Current balance" value={period.currentBalance} emphasis />
                        </div>
                        <p className="alloy-os-billing__due">{period.dueLabel}</p>
                        {/* "Add something that should be billed" is a Current Period intent, not a
                            payment one — and it stays quiet so it never competes with Pay now. */}
                        <div className="alloy-os-billing__zone-actions">
                            <FooterAction onClick={onAddCharge}>Add charge →</FooterAction>
                            <FooterAction onClick={onDetails}>Details →</FooterAction>
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
                            {evidence.payment.autopayLabel ?? "No autopay"}
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
                        {/* Manage payment owns payers, split, methods, autopay and recovery — so it
                            sits under the payment facts, not in a generic footer. */}
                        <FooterAction onClick={onManagePayment}>Manage payment →</FooterAction>
                    </section>
                    </div>
                </div>

                {pastDue ? <p className="alloy-os-billing__history">{evidence.historyLine}</p> : null}
            </UniversalCard>
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
                insight={c.dueLine}
                iconName="Receipt"
                tier="context"
                archetype="status"
                statusChip={evidence.pastDue ? `${evidence.pastDue.amount} past due` : undefined}
                statusTone="due"
                density="compact"
                gridSpan={1}
                data-universal-card-key="financials"
                footerAction={
                    <div className="alloy-os-billing__footer">
                        <FooterAction onClick={onAddCharge}>Add charge →</FooterAction>
                        <FooterAction onClick={onDetails}>Details →</FooterAction>
                    </div>
                }
            >
                <div className="alloy-os-billing__lines alloy-os-billing__lines--compact">
                    {c.lines.map((l) => (
                        <Line key={l.label} label={l.label} value={l.value} />
                    ))}
                </div>
                <p
                    className="alloy-os-billing__autopay alloy-os-billing__autopay--compact"
                    data-autopay-ok={c.paymentHealthy ? "true" : undefined}
                >
                    {c.paymentLine}
                </p>
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
