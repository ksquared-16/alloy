"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { Action, ActionRow, SectionHead } from "@/components/cardLab/CardLabKit";
import type { BillingEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Billing detail — what "Billing details →" opens.
 *
 * NOT a separate Billing product or runtime. It is the SAME card at `density="expanded"`, the
 * centered Focus Card with a depth scrim that Household, Children and the real BillingPreviewCard
 * already use (System 5B Expand). The summary card and this surface are one card at two
 * densities, which is the platform's own density system — Micro, Compact, Standard, Expanded.
 *
 * Sections, in the order an operator asks for them:
 *   A  Current period   the full reconciliation, arithmetic visible
 *   B  Past due         obligations, aging, failed attempts, recovery
 *   C  Payment setup    payers, split, methods, autopay, funding
 *   D  Ledger           the real ledger, with filters — this is where it belongs
 *   E  Upcoming         only where authoritative; unowned facts are marked, not invented
 *   F  Actions          the operational command row
 *
 * No running balance column: `ledger_transactions` has no authoritative running balance, and
 * computing one in the card would invent an ordering the backend does not guarantee.
 */
export default function BillingDetailCard({
    evidence,
    activeFilter = "period",
}: {
    evidence: BillingEvidence;
    activeFilter?: "period" | "all" | "charges" | "payments" | "credits";
}) {
    const { period, pastDue } = evidence;

    return (
        <div className="alloy-os-billing alloy-os-billing--detail" data-billing-detail="true">
            <UniversalCard
                title="Billing"
                insight={`${period.currentBalance} balance · ${period.label}`}
                supportingInsight={evidence.historyLine}
                iconName="Receipt"
                tier="context"
                archetype="status"
                statusChip={pastDue ? `${pastDue.amount} past due` : undefined}
                statusTone="due"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="billing_detail"
            >
                <div className="alloy-os-billingdetail">
                    <section className="alloy-os-billingdetail__col">
                        <SectionHead ruled={false}>Current period</SectionHead>
                        <p className="alloy-os-billing__period">{period.label}</p>
                        <div className="alloy-os-billing__lines">
                            <GroupHead>Charges</GroupHead>
                            {period.charges.map((l) => (
                                <Line key={l.label} {...l} />
                            ))}
                            {period.reductions.length ? <GroupHead>Discounts &amp; credits</GroupHead> : null}
                            {period.reductions.map((l) => (
                                <Line key={l.label} {...l} />
                            ))}
                            {period.funding.length ? <GroupHead>Funding</GroupHead> : null}
                            {period.funding.map((l) => (
                                <Line key={l.label} {...l} />
                            ))}
                            <Line label="Family responsibility" value={period.familyResponsibility} emphasis />
                            <GroupHead>Payments</GroupHead>
                            <Line label="Payments received" value={period.paymentsReceived} />
                            <Line label="Current balance" value={period.currentBalance} emphasis />
                        </div>
                        <p className="alloy-os-billing__due">{period.dueLabel}</p>
                    </section>

                    <section className="alloy-os-billingdetail__col">
                        <SectionHead ruled={false}>Past due</SectionHead>
                        {pastDue ? (
                            <>
                                <p className="alloy-os-billing__amount">{pastDue.amount}</p>
                                <p className="alloy-os-billing__age">
                                    Oldest unpaid · {pastDue.oldest} · {pastDue.age}
                                </p>
                                {pastDue.note ? (
                                    <p className="alloy-os-billing__decline">{pastDue.note}</p>
                                ) : null}
                                <ActionRow>
                                    <Action primary>Pay now</Action>
                                    <Action>Record payment</Action>
                                </ActionRow>
                            </>
                        ) : (
                            <p className="alloy-os-billing__clear">Nothing past due</p>
                        )}

                        <SectionHead>Payment setup</SectionHead>
                        <p
                            className="alloy-os-billing__autopay"
                            data-autopay-ok={evidence.payment.autopayHealthy ? "true" : undefined}
                        >
                            {evidence.payment.autopayLabel ?? "No autopay"}
                            {evidence.payment.nextChargeLabel ? (
                                <span className="alloy-os-billing__next"> · Next {evidence.payment.nextChargeLabel}</span>
                            ) : null}
                        </p>
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
                                        {p.funding ? (
                                            <span className="alloy-os-billing__funding-tag">Funding source</span>
                                        ) : null}
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
                        <ActionRow>
                            <Action>Manage payment</Action>
                        </ActionRow>
                    </section>

                    <section className="alloy-os-billingdetail__col">
                        <SectionHead ruled={false}>Upcoming</SectionHead>
                        <div className="alloy-os-billing__lines">
                            {evidence.upcoming.map((u) => (
                                <div key={u.label} className="alloy-os-billing__line">
                                    <span className="alloy-os-billing__line-label">
                                        {u.label}
                                        {u.unowned ? (
                                            <span className="alloy-os-billingdetail__unowned">no owner yet</span>
                                        ) : null}
                                    </span>
                                    <span className="alloy-os-billing__line-value">{u.value}</span>
                                </div>
                            ))}
                        </div>

                        <SectionHead>Actions</SectionHead>
                        <ActionRow>
                            <Action>Apply credit</Action>
                            <Action>Issue refund</Action>
                            <Action>View statement</Action>
                        </ActionRow>
                    </section>
                </div>

                <div className="alloy-os-billingdetail__ledgerband">
                        <SectionHead ruled={false}>Ledger</SectionHead>
                        <div className="alloy-os-billingdetail__filters">
                            {(["period", "all", "charges", "payments", "credits"] as const).map((f) => (
                                <button
                                    key={f}
                                    type="button"
                                    className={clsx(
                                        "alloy-os-billingdetail__filter",
                                        activeFilter === f && "alloy-os-billingdetail__filter--on",
                                    )}
                                >
                                    {FILTER_LABEL[f]}
                                </button>
                            ))}
                        </div>
                        <div className="alloy-os-billingdetail__ledger" role="table">
                            <div className="alloy-os-billingdetail__row alloy-os-billingdetail__row--head">
                                <span>Date</span>
                                <span>Type</span>
                                <span>Description</span>
                                <span>Amount</span>
                                <span>Status</span>
                                <span>Source</span>
                            </div>
                            {evidence.ledger.map((e, i) => (
                                <div key={`${e.when}-${i}`} className="alloy-os-billingdetail__row">
                                    <span className="alloy-os-billingdetail__when">{e.when}</span>
                                    <span className="alloy-os-billingdetail__type">{e.type}</span>
                                    <span className="alloy-os-billingdetail__desc">{e.label}</span>
                                    <span
                                        className={clsx(
                                            "alloy-os-billingdetail__amount",
                                            e.kind === "credit" && "alloy-os-billing__entry-amount--credit",
                                        )}
                                    >
                                        {e.amount}
                                    </span>
                                    <span className="alloy-os-billingdetail__status">{e.status ?? "—"}</span>
                                    <span className="alloy-os-billingdetail__source">{e.source ?? "—"}</span>
                                </div>
                            ))}
                        </div>
                        <p className="alloy-os-billingdetail__note">
                            No running balance column — <code>ledger_transactions</code> provides no
                            authoritative running balance, and computing one here would invent an ordering the
                            backend does not guarantee.
                        </p>

                </div>
            </UniversalCard>
        </div>
    );
}

const FILTER_LABEL = {
    period: "Current period",
    all: "All",
    charges: "Charges",
    payments: "Payments",
    credits: "Credits & adjustments",
} as const;

function GroupHead({ children }: { children: React.ReactNode }) {
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
