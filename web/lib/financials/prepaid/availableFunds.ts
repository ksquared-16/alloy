/**
 * MONEY THIS ACCOUNT HOLDS THAT IS NOT YET SPENT — and which part of it may actually be spent.
 *
 * ── NOT A SECOND LEDGER ───────────────────────────────────────────────────────────────────────
 *
 * There is no prepaid wallet, no stored-value table and no balance stored anywhere. A prepaid
 * balance IS a posted payment whose money has not been allocated:
 *
 *     unapplied = amount − activeApplied − refunded          (childcarePaymentService)
 *
 * That equation is already canonical, already the reason recording and applying are separate
 * operations, and already why reversing an application returns money to unapplied in the same write
 * that returns the obligation to the charge. This module SUMS what that authority reports. It
 * computes no money of its own, and if it disagreed with `readPaymentUnappliedCents` the reader
 * would be right and this would be wrong.
 *
 * ── WHY "UNAPPLIED" IS NOT THE SAME WORD AS "AVAILABLE" ──────────────────────────────────────
 *
 * This is the whole point of the module. Every unapplied cent is money the account has not spent;
 * only SOME of it is money an operator may spend now, and showing the two as one number would
 * offer funds that cannot be applied:
 *
 *   PENDING          the platform has been told about money it does not have. A pending receipt
 *                    that never clears was never available, and counting it invites an operator to
 *                    settle an obligation with money that may not arrive.
 *
 *   REFUNDED         already given back. `readPaymentUnappliedCents` subtracts this before we see
 *                    it — a full refund reverses the applications, which by itself would make the
 *                    whole receipt look freshly spendable.
 *
 *   AVAILABLE        posted, inbound, not refunded, not allocated. The only bucket that may be
 *                    offered as prepaid funds.
 *
 * ── DEPOSIT-RESTRICTED MONEY (Payments V1 · W4) ──────────────────────────────────────────────
 *
 * This section used to explain why held money was ABSENT: the `deposit` policy carried terms, but
 * nothing marked an individual receipt as held, so the platform could not tell a held deposit from
 * ordinary prepaid money and reported `heldCents: 0, heldSupported: false` rather than silently
 * calling every deposit spendable.
 *
 * W4 shipped the missing fact, and it is what that note predicted — POLICY METADATA OVER THE SAME
 * MONEY, not a second store. `payment_holds` restricts part of a canonical receipt:
 *
 *     available = unapplied − held
 *
 * So `heldSupported` is now true, and a zero here is a MEASUREMENT. Held money is reported beside
 * available money and never inside it: offering a refundable deposit as spendable prepaid is exactly
 * the accident the old note existed to prevent, and the only change is that Alloy can now tell.
 */

import type { PaymentView } from "@/lib/financials/paymentApplicationView";

/** Why a receipt's unapplied money is, or is not, spendable right now. */
export type FundAvailability = "available" | "pending" | "refunding" | "held";

export type FundPosition = {
    paymentId: string;
    availability: FundAvailability;
    /** The receipt's unapplied remainder, as the canonical reader reports it. */
    unappliedCents: number;
    /** How much of that remainder is restricted by a held deposit (W4). */
    heldCents: number;
    payerCustomerId: string | null;
    payerLabel: string | null;
    receivedAt: string | null;
};

export type AccountPrepaidPosition = {
    /** What an operator may apply to an obligation now. The only figure fit to be offered. */
    availableCents: number;
    /** Received but not yet canonical money. Reported, never offered. */
    pendingCents: number;
    /**
     * Money restricted by a held deposit. Reported beside available money, never inside it.
     * `heldSupported` says whether a zero is a measurement or the absence of a capability; since W4
     * it is a measurement.
     */
    heldCents: number;
    heldSupported: boolean;
    /** Every receipt carrying unspent money, classified. */
    positions: FundPosition[];
    currency: string;
};

/**
 * A pending receipt is money the platform has been TOLD about. `posted` is money it HAS.
 *
 * Anything that is not explicitly posted is treated as pending rather than available — failing
 * toward "do not offer it", because the cost of under-reporting prepaid funds is an operator asking
 * a question, and the cost of over-reporting it is money applied that never arrived.
 */
export function fundAvailabilityOf(payment: Pick<PaymentView, "status" | "unappliedCents">): FundAvailability {
    return payment.status === "posted" ? "available" : "pending";
}

/**
 * The account's prepaid position, over the receipts the canonical reader already produced.
 *
 * Receipts with nothing left unapplied are omitted entirely: a fully-applied payment is history, not
 * a position, and listing it as a zero would invite a surface to render "prepaid: $0.00" beside
 * every settled receipt an account ever had.
 */
export function resolveAccountPrepaidPosition(
    payments: readonly PaymentView[],
    /**
     * How much of each receipt is currently held, by payment id (Payments V1 · W4).
     *
     * Passed in rather than read here, because this module sums what canonical authorities report
     * and computes no money of its own — the same reason it consumes `unappliedCents` instead of
     * recomputing it. Omitted entirely by callers that predate W4, which then behave exactly as
     * before.
     */
    heldByPayment: Readonly<Record<string, number>> = {},
): AccountPrepaidPosition {
    const positions: FundPosition[] = [];
    let availableCents = 0;
    let pendingCents = 0;
    let heldCents = 0;

    for (const p of payments) {
        /*
         * NEGATIVE OR ZERO IS NOT A POSITION. Zero is spent money. Negative would mean applications
         * exceed the receipt, which the application path refuses to create — and summing it here
         * would quietly net one receipt's error against another's good money.
         */
        if (p.unappliedCents <= 0) continue;

        /*
         * HELD MONEY IS NOT AVAILABLE MONEY, and it is not pending either — it has arrived. It is
         * carved out of this receipt's unapplied remainder and reported separately.
         *
         * Bounded by the remainder as a defensive floor: the database already refuses a hold that
         * exceeds it, so a larger figure here would mean the two disagree, and the safe direction is
         * to hold no more than exists rather than to publish a negative available balance.
         */
        const held = Math.max(0, Math.min(heldByPayment[p.paymentId] ?? 0, p.unappliedCents));
        const spendable = p.unappliedCents - held;
        const availability: FundAvailability = held >= p.unappliedCents && held > 0
            ? "held"
            : fundAvailabilityOf(p);

        positions.push({
            paymentId: p.paymentId,
            availability,
            unappliedCents: p.unappliedCents,
            heldCents: held,
            payerCustomerId: p.payerCustomerId,
            payerLabel: p.payerLabel,
            receivedAt: p.receivedAt,
        });

        heldCents += held;
        /*
         * Only POSTED money can be offered. A pending receipt's unheld remainder is still pending —
         * holding part of money that has not arrived does not make the rest of it spendable.
         */
        if (fundAvailabilityOf(p) === "available") availableCents += spendable;
        else pendingCents += spendable;
    }

    return {
        availableCents,
        pendingCents,
        heldCents,
        heldSupported: true,
        positions: positions.sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? "")),
        currency: payments[0]?.currency ?? "USD",
    };
}

/**
 * ── OWES NOTHING WITH MONEY ON THE ACCOUNT IS NOT THE SAME AS BEING OWED MONEY ────────────────
 *
 * `owes $0 with $200 prepaid` and `balance −$200` are different facts, and the difference is not
 * cosmetic: the first is an account in good standing holding funds, the second is an account the
 * organisation owes money to. They are already different at rest — the first is a zero obligation
 * balance plus an unallocated receipt, the second would be negative responsibility — so the model
 * has never confused them. Only a screen showing one netted number could.
 *
 * ── CURRENT BALANCE EXCLUDES UNAPPLIED MONEY, AND THAT IS THE EXISTING DOCTRINE ──────────────
 *
 * `buildFinancialsCardVM` computes `balance = responsibility − payments`, where `payments` sums
 * only what was APPLIED to rows in scope. Unallocated money is not in that sum and never was. So
 * prepaid funds do not move Current Balance, and they do not reduce Due until they are applied —
 * which is the correct accounting reading and is why this is a separate figure rather than an
 * adjustment to an existing one.
 *
 * This function does not recompute either number. It pairs them, so a surface can state both
 * without doing arithmetic of its own.
 */
export type AccountFinancialPosition = {
    /** From the balance authority, unchanged. Excludes unapplied money. */
    currentBalanceCents: number;
    /** What is currently owed and collectible, from the balance authority. */
    dueCents: number;
    /** The overdue portion, from the balance authority. */
    pastDueCents: number;
    /** Money held and spendable. Never folded into the three figures above. */
    availablePrepaidCents: number;
    /**
     * True when the account owes nothing AND holds money — the case a single netted figure would
     * misreport as a negative balance.
     */
    settledWithFundsOnAccount: boolean;
};

export function resolveAccountFinancialPosition(input: {
    currentBalanceCents: number;
    dueCents: number;
    pastDueCents: number;
    prepaid: Pick<AccountPrepaidPosition, "availableCents">;
}): AccountFinancialPosition {
    const availablePrepaidCents = input.prepaid.availableCents;
    return {
        currentBalanceCents: input.currentBalanceCents,
        dueCents: input.dueCents,
        pastDueCents: input.pastDueCents,
        availablePrepaidCents,
        settledWithFundsOnAccount: input.currentBalanceCents <= 0 && availablePrepaidCents > 0,
    };
}
