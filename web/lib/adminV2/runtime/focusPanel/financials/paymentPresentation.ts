/**
 * HOW A PAYMENT READS TO AN OPERATOR — received, applied, and what is left doing nothing.
 *
 * ── WHY THIS IS A MODULE AND NOT JSX ──
 *
 * The same reason `offersReverseTransition` is: a rule written inside a component exists twice, once
 * in the component and once in every test that restates it, and a test that restates a rule proves
 * only that it can restate it. Everything here is decided once and asserted directly.
 *
 * ── THE DISTINCTION THIS EXISTS TO PROTECT ──
 *
 * Money RECEIVED and money APPLIED are different facts with different dates, and the difference
 * between them is money sitting on the account doing nothing. The card had no way to say this at all:
 * `vm.payments` was composed by the read model, carried `appliedCents`, and was never rendered — so a
 * family could send $500, have $300 applied, and the surface showed neither number.
 *
 * The unapplied part is called UNAPPLIED. It is not called account credit, and that is not pedantry:
 * a credit is a charge-side concept in this platform (`charge_category = 'credit'`, a reduction line
 * on the ledger written through the correction path). Labelling unapplied cash as credit would merge
 * two things the schema keeps apart, and an operator reading "credit" would look for a ledger row
 * that does not exist.
 */

import type { FinancialsPaymentRow } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

export type PaymentPresentation = {
    paymentId: string;
    /** A receipt is money in; a refund is money going back out and names the receipt it reverses. */
    kind: "receipt" | "refund";
    /** Human-facing, never the raw status key. */
    statusLabel: string;
    /** True only for `posted` — the one status that is money. */
    isMoney: boolean;
    receivedCents: number;
    appliedCents: number;
    /** Received − applied. Zero for a fully applied payment; never negative. */
    unappliedCents: number;
    currencyCode: string;
    /** `Cash`, `Check`, … — the operator's word for how it arrived. */
    methodLabel: string;
    /** The receipt this refund reverses, for lineage. Null on a receipt. */
    refundsPaymentId: string | null;
    /**
     * Whether the card offers `payment.refund` on this row.
     *
     * Posted inbound money that is not itself a refund. The service holds the real bounds — it
     * refuses refunding more than was received and refuses refunding a refund — so this anticipates
     * the obvious cases and lets the domain answer the rest. It never pre-empts a refusal the
     * service would not make.
     */
    offersRefund: boolean;
};

/** `pending | posted | failed | voided` → the operator's word for it. */
const STATUS_LABELS: Record<string, string> = {
    posted: "Received",
    pending: "Pending",
    failed: "Failed",
    voided: "Voided",
};

const METHOD_LABELS: Record<string, string> = {
    cash: "Cash",
    check: "Check",
    ach: "Bank transfer",
    card: "Card",
    manual: "Manual",
    other: "Other",
};

/** Title-case fallback, so an unmapped key still reads as words rather than as a key. */
function humanize(value: string): string {
    const s = value.trim().replace(/[_-]+/g, " ");
    return s ? s[0].toUpperCase() + s.slice(1) : "";
}

export function presentPayment(payment: FinancialsPaymentRow): PaymentPresentation {
    const received = Math.abs(Number(payment.amountCents) || 0);
    const applied = Math.abs(Number(payment.appliedCents) || 0);
    const isRefund = payment.direction === "outbound";
    const isPosted = payment.status === "posted";
    return {
        paymentId: payment.paymentId,
        kind: isRefund ? "refund" : "receipt",
        statusLabel:
            isRefund && isPosted
                ? "Refunded"
                : STATUS_LABELS[payment.status] ?? humanize(payment.status),
        isMoney: isPosted,
        receivedCents: received,
        appliedCents: applied,
        // Clamped at zero: an over-applied payment is refused by the allocation bounds trigger, so a
        // negative remainder here would be reporting a state the database does not allow.
        unappliedCents: Math.max(0, received - applied),
        currencyCode: payment.currencyCode,
        methodLabel: METHOD_LABELS[payment.method] ?? humanize(payment.method),
        refundsPaymentId: payment.refundsPaymentId,
        offersRefund: isPosted && !isRefund && !payment.refundsPaymentId,
    };
}

/**
 * Money on the account that is not doing anything yet.
 *
 * Summed over POSTED receipts only, because a pending attempt has not arrived and a failed one never
 * will. This is a statement about cash, NOT a balance: it is deliberately not subtracted from what is
 * owed anywhere, because applying money to an obligation is a separate act with its own record. The
 * balance stays `responsibility − payments applied`, decided by the read model.
 */
export function unappliedTotalCents(payments: readonly FinancialsPaymentRow[]): number {
    return payments
        .map(presentPayment)
        .filter((p) => p.isMoney && p.kind === "receipt")
        .reduce((sum, p) => sum + p.unappliedCents, 0);
}
