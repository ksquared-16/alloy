import { describe, expect, it } from "vitest";

import {
    presentPayment,
    unappliedTotalCents,
} from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";
import { offersPaymentTransition } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FinancialsPaymentRow } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

function payment(over: Partial<FinancialsPaymentRow>): FinancialsPaymentRow {
    return {
        paymentId: "p1",
        direction: "inbound",
        refundsPaymentId: null,
        amountCents: 50_000,
        currencyCode: "USD",
        status: "posted",
        method: "check",
        processor: null,
        receivedAt: "2026-09-10T00:00:00Z",
        postedAt: "2026-09-10T00:00:00Z",
        appliedCents: 50_000,
        reference: null,
        notes: null,
        ...over,
    };
}

/**
 * RECEIVED IS NOT APPLIED, AND UNAPPLIED IS NOT CREDIT.
 *
 * The read model has always carried both numbers; nothing rendered them, so a family could send $500,
 * have $300 applied, and the card showed neither. These cases pin the distinction the surface now
 * makes, including the label — "credit" is a charge-side ledger row in this platform, and calling
 * unapplied cash by that name would send an operator looking for a row that does not exist.
 */
describe("payment presentation", () => {
    it("separates what was received from what it is doing", () => {
        const p = presentPayment(payment({ amountCents: 50_000, appliedCents: 30_000 }));
        expect(p.receivedCents).toBe(50_000);
        expect(p.appliedCents).toBe(30_000);
        expect(p.unappliedCents).toBe(20_000);
        expect(p.kind).toBe("receipt");
        expect(p.isMoney).toBe(true);
    });

    it("reports a fully applied payment as having nothing unapplied", () => {
        expect(presentPayment(payment({})).unappliedCents).toBe(0);
    });

    it("never reports a negative remainder", () => {
        // Over-application is refused by the allocation bounds trigger, so a negative remainder here
        // would be describing a state the database does not permit.
        const p = presentPayment(payment({ amountCents: 10_000, appliedCents: 12_000 }));
        expect(p.unappliedCents).toBe(0);
    });

    it("gives the operator words, never status or method keys", () => {
        expect(presentPayment(payment({ status: "posted" })).statusLabel).toBe("Received");
        expect(presentPayment(payment({ status: "pending" })).statusLabel).toBe("Pending");
        expect(presentPayment(payment({ method: "ach" })).methodLabel).toBe("Bank transfer");
        // An unmapped key still reads as words rather than leaking as a key.
        expect(presentPayment(payment({ method: "wire_transfer" })).methodLabel).toBe("Wire transfer");
    });

    it("reads a refund as money going back, naming what it reverses", () => {
        const p = presentPayment(
            payment({ paymentId: "p2", direction: "outbound", refundsPaymentId: "p1", appliedCents: 0 }),
        );
        expect(p.kind).toBe("refund");
        expect(p.statusLabel).toBe("Refunded");
        expect(p.refundsPaymentId).toBe("p1");
        // A refund is not itself refundable.
        expect(p.offersRefund).toBe(false);
    });

    it("offers a refund only on posted money that is not already one", () => {
        expect(presentPayment(payment({})).offersRefund).toBe(true);
        expect(presentPayment(payment({ status: "pending" })).offersRefund).toBe(false);
        expect(presentPayment(payment({ status: "failed" })).offersRefund).toBe(false);
        expect(presentPayment(payment({ direction: "outbound" })).offersRefund).toBe(false);
    });

    it("totals unapplied cash over posted receipts only", () => {
        const total = unappliedTotalCents([
            payment({ paymentId: "a", amountCents: 50_000, appliedCents: 30_000 }),
            // Pending money has not arrived; it cannot be sitting on the account.
            payment({ paymentId: "b", status: "pending", amountCents: 90_000, appliedCents: 0 }),
            // A refund is not a receipt.
            payment({ paymentId: "c", direction: "outbound", amountCents: 10_000, appliedCents: 0 }),
        ]);
        expect(total).toBe(20_000);
    });
});

/**
 * The mirror of `offersReverseTransition`, and the reason it lives in the read model: the card must
 * not decide what money may be received against.
 */
describe("offersPaymentTransition", () => {
    const base = { status: "posted", correctsChargeId: null, outstandingCents: 7_500 };

    it("offers payment on a posted charge that still owes something", () => {
        expect(offersPaymentTransition(base)).toBe(true);
    });

    it("refuses a draft — paying one settles an obligation nobody was told about", () => {
        expect(offersPaymentTransition({ ...base, status: "draft" })).toBe(false);
    });

    it("refuses a void charge", () => {
        expect(offersPaymentTransition({ ...base, status: "void" })).toBe(false);
    });

    it("refuses a correction — a credit is money the other way, not a receivable", () => {
        expect(offersPaymentTransition({ ...base, correctsChargeId: "c-original" })).toBe(false);
    });

    it("refuses a charge that is already settled", () => {
        expect(offersPaymentTransition({ ...base, outstandingCents: 0 })).toBe(false);
        expect(offersPaymentTransition({ ...base, outstandingCents: -500 })).toBe(false);
    });
});
