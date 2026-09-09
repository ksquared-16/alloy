/**
 * WHAT IS LEFT TO REFUND, and how the panel is allowed to ask for it.
 *
 * Two rules this slice added, kept where they can be asserted directly rather than restated inside a
 * component: the remaining refundable amount is a sum over canonical reversals, and the mounted
 * surface reads the platform's own action envelope.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { FinancialsPaymentRow } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { presentPayments, unappliedTotalCents } from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";

const receipt = (over: Partial<FinancialsPaymentRow> = {}): FinancialsPaymentRow => ({
    paymentId: "pay-1",
    direction: "inbound",
    refundsPaymentId: null,
    amountCents: 1_000,
    currencyCode: "USD",
    status: "posted",
    method: "card",
    processor: "stripe",
    receivedAt: null,
    postedAt: null,
    appliedCents: 1_000,
    reference: null,
    notes: null,
    reversalOrigin: null,
    ...over,
});

const reversal = (cents: number, over: Partial<FinancialsPaymentRow> = {}): FinancialsPaymentRow =>
    receipt({
        paymentId: `refund-${cents}-${over.status ?? "posted"}-${over.reversalOrigin ?? "operator"}`,
        direction: "outbound",
        refundsPaymentId: "pay-1",
        amountCents: cents,
        appliedCents: 0,
        reversalOrigin: "operator",
        ...over,
    });

describe("remaining refundable comes from canonical reversals, never from the provider", () => {
    it("a receipt with no reversals is refundable in full", () => {
        const [p] = presentPayments([receipt()]);
        expect(p.refundedCents).toBe(0);
        expect(p.refundableCents).toBe(1_000);
        expect(p.offersRefund).toBe(true);
    });

    it("sums several partial reversals against the receipt they name", () => {
        const [p] = presentPayments([receipt(), reversal(400), reversal(300)]);
        expect(p.refundedCents).toBe(700);
        expect(p.refundableCents).toBe(300);
        expect(p.offersRefund).toBe(true);
    });

    it("stops offering a refund once nothing is left", () => {
        const [p] = presentPayments([receipt(), reversal(1_000)]);
        expect(p.refundedCents).toBe(1_000);
        expect(p.refundableCents).toBe(0);
        expect(p.offersRefund, "a fully refunded receipt must not invite another refund").toBe(false);
    });

    it("counts only POSTED reversals — a pending or failed one has taken nothing back", () => {
        const [p] = presentPayments([
            receipt(),
            reversal(400, { status: "pending" }),
            reversal(200, { status: "failed" }),
        ]);
        expect(p.refundedCents).toBe(0);
        expect(p.refundableCents).toBe(1_000);
    });

    it("never lets a reversal for another receipt reduce this one", () => {
        const [p] = presentPayments([receipt(), reversal(400, { refundsPaymentId: "someone-else" })]);
        expect(p.refundedCents).toBe(0);
        expect(p.refundableCents).toBe(1_000);
    });

    it("a refund row is not itself refundable", () => {
        const rows = presentPayments([receipt(), reversal(400)]);
        const refundRow = rows.find((r) => r.kind === "refund")!;
        expect(refundRow.offersRefund).toBe(false);
        expect(refundRow.refundableCents).toBe(0);
    });
});

const CARD_SRC = readFileSync(
    join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"),
    "utf8",
);

describe("the mounted surface reads the platform action envelope", () => {
    /*
     * `/api/admin/actions/execute` answers `data.execution_result: { … }`. Reading a `detail`
     * wrapper the envelope does not have returned `{}` for every field, so a card collection handed
     * Stripe Elements an empty client secret and the Payment Element refused to mount — after the
     * PaymentIntent had already been created on the connected account.
     */
    it("takes the execution result itself, not a detail wrapper that may not exist", () => {
        expect(CARD_SRC).toMatch(/json\.data\?\.execution_result \?\? \{\}/);
        expect(
            CARD_SRC,
            "no path may depend on `execution_result.detail` alone",
        ).not.toMatch(/execution_result\?\.detail \?\? \{\}/);
    });

    it("collection and refund both go through the one action runner", () => {
        // One envelope reader, so neither rail can grow its own parsing.
        expect(CARD_SRC.match(/const runPaymentAction = useCallback/g) ?? []).toHaveLength(1);
        expect(CARD_SRC).toMatch(/runPaymentAction\(\s*"payment\.collect_card"/);
        expect(CARD_SRC).toMatch(/runPaymentAction\(\s*"payment\.refund"/);
        // …and the browser never reaches the provider or the domain service directly.
        expect(CARD_SRC).not.toMatch(/api\.stripe\.com/);
        expect(CARD_SRC).not.toMatch(/refundChildcarePayment/);
    });

    it("a payment is attributed to a resolved entity, never to a hardcoded grain", () => {
        // The route refuses a call with no entity; a pre-enrolment family has no child to name.
        expect(CARD_SRC).toMatch(/paymentEntityFor\(/);
        expect(CARD_SRC).toMatch(/entity_type: entity\?\.entityType/);
        expect(CARD_SRC).toMatch(/entity_id: entity\?\.entityId/);
    });

    it("the refund acts on the payment the operator selected", () => {
        // The committed payload names the row's own id — no implicit first-payment assumption.
        expect(CARD_SRC).toMatch(/payment_id: p\.paymentId/);
        expect(CARD_SRC).toMatch(/data-financials-refund-for=\{p\.paymentId\}/);
    });
});

describe("the refunded parameter can never be filled in by accident", () => {
    /*
     * `presentPayment` takes (payment, refundedCents). `Array.map` passes (element, index, array),
     * so a point-free `.map(presentPayment)` hands the INDEX in as money — the second payment reads
     * as 1 cent refunded, the third as 2. This asserts the totals helper is immune, and that no
     * point-free use returns.
     */
    it("unapplied totals do not shift with position in the list", () => {
        const rows = [
            receipt({ paymentId: "a", amountCents: 500, appliedCents: 0 }),
            receipt({ paymentId: "b", amountCents: 500, appliedCents: 0 }),
            receipt({ paymentId: "c", amountCents: 500, appliedCents: 0 }),
        ];
        expect(unappliedTotalCents(rows)).toBe(1_500);
        // Same rows, reversed: position must not change the answer.
        expect(unappliedTotalCents([...rows].reverse())).toBe(1_500);
    });

    it("refundable amounts do not shift with position in the list", () => {
        const rows = [
            receipt({ paymentId: "a", amountCents: 500 }),
            receipt({ paymentId: "b", amountCents: 500 }),
            receipt({ paymentId: "c", amountCents: 500 }),
        ];
        expect(presentPayments(rows).map((p) => p.refundableCents)).toEqual([500, 500, 500]);
    });

    it("no point-free map of presentPayment survives in the module", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/paymentPresentation.ts"),
            "utf8",
        );
        // Comments are allowed to name the mistake — code is not allowed to make it.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(code).not.toMatch(/\.map\(presentPayment\)/);
    });
});


describe("a return is not a refund, and the surface must not say it is", () => {
    /*
     * The two wear the same shape — an outbound payment naming the receipt it reverses — and mean
     * opposite things about who acted. An operator shown "Refunded" for a returned ACH would
     * believe somebody here decided it and would go looking for the person who did.
     */
    it("an operator refund reads as a refund", () => {
        const rows = presentPayments([receipt(), reversal(400, { reversalOrigin: "operator" })]);
        const out = rows.find((r) => r.paymentId !== "pay-1")!;
        expect(out.kind).toBe("refund");
        expect(out.statusLabel).toBe("Refunded");
        expect(out.reversalOrigin).toBe("operator");
    });

    it("a provider return reads as a return, and never as a refund", () => {
        const rows = presentPayments([receipt(), reversal(400, { reversalOrigin: "provider" })]);
        const out = rows.find((r) => r.paymentId !== "pay-1")!;
        expect(out.kind).toBe("return");
        expect(out.statusLabel).toBe("Returned");
        expect(out.statusLabel.toLowerCase()).not.toMatch(/refund/);
        expect(out.reversalOrigin).toBe("provider");
    });

    it("both still reduce what remains refundable, because the money really did go back", () => {
        const [rec] = presentPayments([
            receipt({ amountCents: 1_000 }),
            reversal(400, { reversalOrigin: "provider" }),
        ]);
        expect(rec.refundedCents, "a return is money that left, whoever sent it").toBe(400);
        expect(rec.refundableCents).toBe(600);
    });

    it("a receipt never carries a reversal origin", () => {
        const [rec] = presentPayments([receipt()]);
        expect(rec.kind).toBe("receipt");
        expect(rec.reversalOrigin).toBeNull();
    });
});
