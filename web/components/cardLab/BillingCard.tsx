"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { Action, ActionRow, FooterAction } from "@/components/cardLab/CardLabKit";
import type { BillingEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Billing — a financial operating surface at full row width.
 *
 * ── COMPOSITION ──
 *
 *   header        names the card. Nothing else.
 *   three zones   Current billing · Past due · Recent ledger
 *   payer strip   horizontal, below the zones, at full width
 *   footer        the financial management actions, in one place
 *
 * **The header states no money.** A summary there duplicated every number in the zones below and
 * made the card read as malformed. If an amount is past due, the Past Due zone is already the
 * loudest thing on the card; announcing it twice weakens both.
 *
 * **Payers are not part of the arithmetic.** They are financial-responsibility context, so they
 * get their own full-width strip rather than being appended under the Current Billing stack —
 * where three stacked payers made zone one three times the height of the other two.
 *
 * **Recent Ledger is a ledger, not an activity feed.** Fixed column grid, tabular figures,
 * right-aligned amounts, consistent row height, no pills. Direction is account balance: a charge
 * or fee INCREASES what is owed (`+`), a payment, credit, discount or subsidy REDUCES it (`−`).
 * The sign carries the meaning; colour only reinforces it.
 *
 * Action hierarchy: Pay now is filled and lives inside Past Due because it is contextual and
 * primary; everything else is a quiet footer action.
 */
export default function BillingCard({
    evidence,
    variant = "payment",
    onDetails,
}: {
    evidence: BillingEvidence;
    /**
     * Which question the third zone answers.
     *   "ledger"  — what just happened financially
     *   "payment" — how this obligation is expected to be paid
     * Rendered both ways so the composition can be judged, not assumed.
     */
    variant?: "ledger" | "payment";
    onDetails?: () => void;
}) {
    const pastDue = evidence.pastDue;
    const showPayment = variant === "payment";

    return (
        <div className="alloy-os-billing" data-billing-card="true">
            <UniversalCard
                title="Billing"
                insight=""
                iconName="Receipt"
                tier="context"
                archetype="status"
                density="compact"
                gridSpan="row"
                data-universal-card-key="billing"
                footerAction={
                    <div className="alloy-os-billing__footer">
                        <FooterAction>Manage payers</FooterAction>
                        <FooterAction>Manage payment</FooterAction>
                        <FooterAction>View ledger</FooterAction>
                        <FooterAction onClick={onDetails}>Details →</FooterAction>
                    </div>
                }
            >
                <div className="alloy-os-billing__zones">
                    <section className="alloy-os-billing__zone">
                        <p className="alloy-os-billing__zone-head">Current billing</p>
                        <p className="alloy-os-billing__period">{evidence.period.label}</p>
                        <div className="alloy-os-billing__lines">
                            {evidence.period.lines.map((l) => (
                                <div
                                    key={l.label}
                                    className={clsx(
                                        "alloy-os-billing__line",
                                        l.emphasis && "alloy-os-billing__line--emphasis",
                                    )}
                                >
                                    <span className="alloy-os-billing__line-label">{l.label}</span>
                                    <span className="alloy-os-billing__line-value">{l.value}</span>
                                </div>
                            ))}
                        </div>
                        <p className="alloy-os-billing__due">
                            {evidence.dueLabel} <strong>{evidence.dueValue}</strong>
                        </p>
                    </section>

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
                                    <Action primary>Pay now</Action>
                                </ActionRow>
                            </>
                        ) : (
                            <>
                                <p className="alloy-os-billing__clear">Nothing past due</p>
                                <p className="alloy-os-billing__clear-note">
                                    Last payment received {evidence.ledger[0]?.when ?? "—"}
                                </p>
                            </>
                        )}
                    </section>

                    <section className="alloy-os-billing__zone">
                        <p className="alloy-os-billing__zone-head">
                            {showPayment ? "Payment" : "Recent ledger"}
                        </p>
                        {showPayment ? (
                            <>
                                <p className="alloy-os-billing__autopay" data-autopay-ok={pastDue ? undefined : "true"}>
                                    {evidence.payment.autopayLabel ?? "No autopay"}
                                </p>
                                {evidence.payment.nextChargeLabel ? (
                                    <p className="alloy-os-billing__next">
                                        Next · {evidence.payment.nextChargeLabel}
                                    </p>
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
                                                    <span className="alloy-os-billing__method-issue">
                                                        {" "}
                                                        · {p.methodIssue}
                                                    </span>
                                                ) : null}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="alloy-os-billing__ledger" role="table">
                                <div className="alloy-os-billing__entry alloy-os-billing__entry--head">
                                    <span>Date</span>
                                    <span>Description</span>
                                    <span>Amount</span>
                                </div>
                                {evidence.ledger.map((e, i) => (
                                    <div key={`${e.when}-${i}`} className="alloy-os-billing__entry">
                                        <span className="alloy-os-billing__entry-when">{e.when}</span>
                                        <span className="alloy-os-billing__entry-label">{e.label}</span>
                                        <span
                                            className={clsx(
                                                "alloy-os-billing__entry-amount",
                                                e.kind === "credit" && "alloy-os-billing__entry-amount--credit",
                                            )}
                                        >
                                            {e.amount}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {showPayment ? (
                    // The ledger steps down to one compact line; the full history is Billing detail.
                    <p className="alloy-os-billing__history">{evidence.historyLine}</p>
                ) : (
                    <section className="alloy-os-billing__payers">
                        <p className="alloy-os-billing__zone-head">Payers</p>
                        <div className="alloy-os-billing__payer-strip">
                            {evidence.payers.map((p) => (
                                <p
                                    key={p.name}
                                    className="alloy-os-billing__payer"
                                    data-funding={p.funding ? "true" : undefined}
                                >
                                    <span className="alloy-os-billing__payer-name">{p.name}</span>
                                    <span className="alloy-os-billing__payer-share">{p.share}</span>
                                    <span className="alloy-os-billing__payer-method">{p.method}</span>
                                </p>
                            ))}
                        </div>
                    </section>
                )}
            </UniversalCard>
        </div>
    );
}
