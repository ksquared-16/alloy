"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { Action, ActionRow, FooterAction, SectionHead } from "@/components/cardLab/CardLabKit";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import type { FinancialsEvidence, FinancialsLedgerPeriod } from "@/lib/cardLab/cardLabTypes";

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
export default function FinancialsDetailCard({
    evidence,
    periods,
    activeFilter = "all",
    activePayer = "All payers",
}: {
    evidence: FinancialsEvidence;
    periods: FinancialsLedgerPeriod[];
    activeFilter?: "all" | "charges" | "payments" | "credits" | "funding";
    /** A FILTER over canonical truth, never a separate payer ledger. */
    activePayer?: string;
}) {
    const payerFilters = ["All payers", ...evidence.payers.map((p) => (p.funding ? "Funding" : p.name.split(" ")[0]!))];
    const { period, pastDue } = evidence;

    return (
        <div className="alloy-os-billing alloy-os-billing--detail" data-financials-detail="true">
            <UniversalCard
                title="Financials"
                insight={`${period.currentBalance} balance`}
                supportingInsight={`${period.label} · ${evidence.historyLine}`}
                iconName="Receipt"
                tier="context"
                archetype="status"
                statusChip={pastDue ? `${pastDue.amount} past due` : undefined}
                statusTone="due"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="financials_detail"
            >
                {/* Condensed overview — the detail must not re-render the summary card. */}
                <div className="alloy-os-fdetail__strip">
                    <Stat label="Balance" value={period.currentBalance} strong />
                    <Stat label="Past due" value={pastDue ? pastDue.amount : "None"} tone={pastDue ? "due" : "ok"} />
                    <Stat label="Responsibility" value={period.familyResponsibility} />
                    <Stat label="Paid" value={period.paymentsReceived.replace("−", "")} />
                    <Stat label="Autopay" value={evidence.payment.autopayLabel ?? "None"} tone={evidence.payment.autopayHealthy ? "ok" : "due"} />
                    <Stat label="Next" value={evidence.payment.nextChargeLabel ?? "—"} />
                </div>

                <div className="alloy-os-fdetail__payers">
                    {evidence.payers.map((p) => (
                        <span key={p.name} className="alloy-os-fdetail__payer" data-funding={p.funding ? "true" : undefined}>
                            <span className="alloy-os-billing__payer-name">{p.name}</span>
                            <span className="alloy-os-billing__payer-share">{p.share}</span>
                            <span className="alloy-os-billing__payer-method">{p.method}</span>
                            {p.methodIssue ? (
                                <span className="alloy-os-billing__method-issue">· {p.methodIssue}</span>
                            ) : null}
                        </span>
                    ))}
                    <FooterAction>Manage payment →</FooterAction>
                </div>

                {/* Mutations sit together; Manage payment is management/navigation and lives with
                    the payer facts above, not as a peer command. */}
                <ActionRow>
                    <Action primary>Pay now</Action>
                    <Action>Add charge</Action>
                    <Action>Record payment</Action>
                </ActionRow>

                {/* The ledger owns the detail. */}
                <div className="alloy-os-billingdetail__ledgerband">
                    <SectionHead ruled={false}>Ledger</SectionHead>
                    <div className="alloy-os-fdetail__filterrow">
                        <div className="alloy-os-billingdetail__filters">
                            {(["all", "charges", "payments", "credits", "funding"] as const).map((f) => (
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
                        <div className="alloy-os-billingdetail__filters">
                            <span className="alloy-os-fdetail__filterlabel">Payer</span>
                            {payerFilters.map((f) => (
                                <button
                                    key={f}
                                    type="button"
                                    className={clsx(
                                        "alloy-os-billingdetail__filter",
                                        activePayer === f && "alloy-os-billingdetail__filter--on",
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {periods.map((per) => (
                        <section key={per.label} className="alloy-os-fdetail__period">
                            <p className="alloy-os-fdetail__periodhead">
                                <span className="alloy-os-fdetail__periodname">{per.label}</span>
                                <span className="alloy-os-fdetail__periodsum">{per.summary}</span>
                            </p>
                            {per.open ? (
                                <div className="alloy-os-billingdetail__ledger" role="table">
                                    <div className="alloy-os-billingdetail__row alloy-os-billingdetail__row--head">
                                        <span>Date</span>
                                        <span>Type</span>
                                        <span>Description</span>
                                        <span>GL code</span>
                                        <span>Amount</span>
                                        <span>Status</span>
                                        <span>Source</span>
                                    </div>
                                    {per.entries.map((e, i) => (
                                        <div key={`${e.when}-${i}`} className="alloy-os-billingdetail__row">
                                            <span className="alloy-os-billingdetail__when">{e.when}</span>
                                            {/* The catalog owns the label — the card never renders a raw key. */}
                                            <span className="alloy-os-billingdetail__type">
                                                {chargeCategoryLabel(e.type)}
                                            </span>
                                            <span className="alloy-os-billingdetail__desc">{e.label}</span>
                                            <span className="alloy-os-billingdetail__gl">{e.glCode ?? "— unmapped"}</span>
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
                            ) : (
                                <p className="alloy-os-fdetail__collapsed">Collapsed · select to expand</p>
                            )}
                        </section>
                    ))}
                    <p className="alloy-os-billingdetail__note">
                        No running balance column — <code>ledger_transactions</code> provides no authoritative
                        running balance, and computing one here would invent an ordering the backend does not
                        guarantee.
                    </p>
                </div>

                <div className="alloy-os-fdetail__upcoming">
                    <SectionHead>Upcoming</SectionHead>
                    <div className="alloy-os-fdetail__upcominglist">
                        {evidence.upcoming.map((u) => (
                            <span key={u.label} className="alloy-os-fdetail__up">
                                <span className="alloy-os-billing__line-label">{u.label}</span>
                                <span className="alloy-os-billing__line-value">{u.value}</span>
                                {u.unowned ? (
                                    <span className="alloy-os-billingdetail__unowned">no owner yet</span>
                                ) : null}
                            </span>
                        ))}
                    </div>
                </div>
            </UniversalCard>
        </div>
    );
}

const FILTER_LABEL = {
    all: "All",
    charges: "Charges",
    payments: "Payments",
    credits: "Credits & adjustments",
    funding: "Funding",
} as const;

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "due" }) {
    return (
        <span className="alloy-os-fdetail__stat" data-tone={tone}>
            <span className="alloy-os-fdetail__statlabel">{label}</span>
            <span className={clsx("alloy-os-fdetail__statvalue", strong && "alloy-os-fdetail__statvalue--strong")}>
                {value}
            </span>
        </span>
    );
}
