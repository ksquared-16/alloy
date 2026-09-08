"use client";

/**
 * PAYMENTS — money in, and money in that is not settling anything.
 *
 * Two lists, deliberately separate. RECEIVED is what arrived: posted, inbound, newest first.
 * UNAPPLIED is the subset with money left over — `amount − active applications`, the account
 * card's own definition — and it is the operator's actual work, because a receipt sitting
 * unapplied is an obligation that still looks unpaid to everyone downstream.
 *
 * ── WHAT THIS SECTION DOES NOT DO ──
 *
 * It does not apply payments. Application belongs to Thread 8 and is authored on the account
 * card, where the charges being settled are visible; a second application surface here would be
 * a second path through the same money with none of the card's context. Selecting a payment
 * opens that account.
 *
 * It also invents no "reconciliation status". Nothing in the platform records whether a payment
 * has been reconciled against a bank or a processor, so a status column here would be a field
 * with no writer — a badge that means whatever the reader assumes. What IS true is how much of
 * each receipt is applied, and that is what the row says.
 *
 * ── REFUNDS ARE NOT NEGATIVE RECEIPTS ──
 *
 * A refund is an outbound row naming the receipt it reverses. It is reported beside receipts and
 * never netted into them, so the pair reads as "this arrived, and this much went back" rather
 * than as one smaller number that hides both movements.
 */

import { useMemo, useState } from "react";

import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import FinancialsAccountDetail from "@/app/adminV2/financials/FinancialsAccountDetail";
import { moneyExact, shortDate } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsReadState } from "@/app/adminV2/financials/useFinancialsReads";
import type { FinancialPaymentFlow, FinancialPaymentRow } from "@/lib/financials/workspace/resolveFinancialPaymentFlow";

type Lens = "unapplied" | "received";

export default function FinancialsPayments({
    flow,
    scopeLabel,
}: {
    flow: FinancialsReadState<FinancialPaymentFlow>;
    scopeLabel: string;
}) {
    /*
     * UNAPPLIED IS THE DEFAULT LENS. It is the only one of the two that is work: a full list of
     * receipts is a record, and a list of receipts still holding money is a queue.
     */
    const [lens, setLens] = useState<Lens>("unapplied");
    const [selected, setSelected] = useState<FinancialPaymentRow | null>(null);

    const rows = useMemo(() => {
        const all = flow.data?.rows ?? [];
        return lens === "unapplied"
            ? all.filter((r) => r.unappliedCents > 0)
            : all.filter((r) => r.direction === "inbound");
    }, [flow.data, lens]);

    const refunds = useMemo(() => (flow.data?.rows ?? []).filter((r) => r.direction === "outbound"), [flow.data]);

    return (
        <div className="flex min-h-0 flex-1 gap-3" data-testid="financials-payments-section">
            <WorkspaceSurface className="flex min-h-0 w-[24rem] shrink-0 flex-col overflow-hidden">
                <div
                    className="flex shrink-0 items-center gap-1 border-b border-alloy-stone/10 px-2 py-1.5"
                    role="tablist"
                    aria-label="Payment lens"
                >
                    {(["unapplied", "received"] as const).map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={lens === key}
                            onClick={() => setLens(key)}
                            data-financials-payments-lens={key}
                            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                                lens === key
                                    ? "bg-alloy-bend-pine/10 text-alloy-midnight"
                                    : "text-alloy-midnight/60 hover:bg-alloy-stone/[0.06]"
                            }`}
                        >
                            {key === "unapplied" ? "Unapplied" : "Received"}
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-payments-list={lens}>
                    {flow.loading && rows.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading payments…</p>
                    ) : flow.error ? (
                        <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-payments-error="true">
                            {flow.error}
                        </p>
                    ) : rows.length === 0 ? (
                        <WorkspaceEmptyState
                            title={lens === "unapplied" ? "Every payment is applied" : "No payments received"}
                            body={`Nothing to show for ${scopeLabel.toLowerCase()}.`}
                        />
                    ) : (
                        rows.map((row) => (
                            <button
                                key={row.paymentId}
                                type="button"
                                onClick={() => setSelected(row)}
                                data-financials-payment-row={row.paymentId}
                                data-financials-payment-site={row.siteLocationId ?? "org"}
                                aria-current={selected?.paymentId === row.paymentId ? "true" : undefined}
                                className={`block w-full border-b border-alloy-stone/10 px-3 py-2 text-left transition hover:bg-alloy-stone/5 ${
                                    selected?.paymentId === row.paymentId ? "bg-alloy-bend-pine/5" : ""
                                }`}
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm text-alloy-midnight">
                                        {row.householdName ?? "Household"} · {shortDate(row.receivedAt)}
                                    </span>
                                    <span className="shrink-0 text-sm tabular-nums text-alloy-midnight">
                                        {moneyExact(row.amountCents, row.currencyCode)}
                                    </span>
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-alloy-midnight/60">
                                    <span data-financials-payment-unapplied={row.paymentId}>
                                        {moneyExact(row.unappliedCents, row.currencyCode)} unapplied
                                    </span>
                                    {" · "}
                                    {moneyExact(row.appliedCents, row.currencyCode)} applied
                                    {" · "}
                                    {row.locationScope === "site" ? "Site" : "Account-wide"}
                                </span>
                            </button>
                        ))
                    )}
                </div>
                {refunds.length > 0 ? (
                    <div
                        className="shrink-0 border-t border-alloy-stone/10 px-3 py-2 text-xs text-alloy-midnight/55"
                        data-financials-payments-refunds="true"
                    >
                        {/* Stated, never subtracted. */}
                        {refunds.length} refund{refunds.length === 1 ? "" : "s"} in this scope, reported separately.
                    </div>
                ) : null}
            </WorkspaceSurface>

            <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!selected ? (
                    <WorkspaceEmptyState
                        title="Select a payment"
                        body="Choose a payment to open the household it belongs to. Applying it happens on the account, where the charges it would settle are visible."
                    />
                ) : !selected.customerId ? (
                    /*
                     * A payment with no household is not opened onto a plausible one. It happens when
                     * a payment names a billable source whose account cannot be resolved, and the
                     * honest answer is to say so rather than to pick somebody.
                     */
                    <WorkspaceEmptyState
                        title="This payment names no household"
                        body="Its billable source does not resolve to an account, so there is no account-level detail to show."
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col" data-financials-payment-detail={selected.paymentId}>
                        <div className="border-b border-alloy-stone/10 px-3 py-2">
                            <p className="text-xs text-alloy-midnight/60" data-financials-detail-scope="account_wide">
                                Account-wide financial detail
                            </p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            <FinancialsAccountDetail
                                key={selected.customerId}
                                customerId={selected.customerId}
                                customerMemberId={null}
                                participationId={null}
                                displayName={null}
                            />
                        </div>
                    </div>
                )}
            </WorkspaceSurface>
        </div>
    );
}
