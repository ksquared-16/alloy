/**
 * PREPAID IS A POSITION OVER EXISTING MONEY, NOT A SECOND LEDGER.
 *
 * The distinction these exist to protect: `owes $0 with $200 prepaid` is not `balance −$200`. The
 * first is an account in good standing holding funds; the second is an account the organisation
 * owes money to. They were never confused at rest — only a screen showing one netted number could
 * confuse them — so the fix is a separate figure, not new arithmetic.
 *
 * And the second distinction, which is the one that can lose money: UNAPPLIED is not AVAILABLE.
 */
import { describe, expect, it } from "vitest";

import {
    fundAvailabilityOf,
    resolveAccountFinancialPosition,
    resolveAccountPrepaidPosition,
} from "@/lib/financials/prepaid/availableFunds";
import type { PaymentView } from "@/lib/financials/paymentApplicationView";

const pay = (over: Partial<PaymentView>): PaymentView =>
    ({
        paymentId: "pay-1",
        status: "posted",
        amountCents: 50_000,
        currency: "USD",
        receivedAt: "2026-09-01",
        paymentMethod: "ach",
        processor: null,
        processorTransactionId: null,
        referenceNumber: null,
        payerCustomerId: "cust-1",
        payerLabel: "Dana Alvarez",
        refundedCents: 0,
        activeAppliedCents: 0,
        unappliedCents: 50_000,
        applications: [],
        ...over,
    }) as PaymentView;

describe("unapplied is not the same word as available", () => {
    it("counts a posted, unallocated receipt as available", () => {
        const p = resolveAccountPrepaidPosition([pay({ unappliedCents: 50_000 })]);
        expect(p.availableCents).toBe(50_000);
        expect(p.pendingCents).toBe(0);
    });

    /*
     * THE ONE THAT CAN LOSE MONEY. A pending receipt is money the platform has been TOLD about.
     * Offering it as prepaid invites an operator to settle an obligation with funds that may never
     * arrive.
     */
    it("never offers pending money as available", () => {
        const p = resolveAccountPrepaidPosition([pay({ status: "pending", unappliedCents: 50_000 })]);
        expect(p.availableCents).toBe(0);
        expect(p.pendingCents).toBe(50_000);
    });

    /* Fails toward "do not offer it" for any state this build does not recognise. */
    it("treats an unrecognised payment state as not available", () => {
        expect(fundAvailabilityOf({ status: "who_knows", unappliedCents: 1 })).toBe("pending");
        expect(fundAvailabilityOf({ status: "", unappliedCents: 1 })).toBe("pending");
    });

    /*
     * A fully applied receipt is HISTORY, not a position. Listing it as a zero would put
     * "prepaid: $0.00" beside every settled receipt an account ever had.
     */
    it("omits receipts with nothing left unapplied", () => {
        const p = resolveAccountPrepaidPosition([pay({ unappliedCents: 0 }), pay({ paymentId: "p2", unappliedCents: -100 })]);
        expect(p.positions).toEqual([]);
        expect(p.availableCents).toBe(0);
    });

    it("keeps available and pending money in separate totals across several receipts", () => {
        const p = resolveAccountPrepaidPosition([
            pay({ paymentId: "a", unappliedCents: 20_000 }),
            pay({ paymentId: "b", status: "pending", unappliedCents: 30_000 }),
            pay({ paymentId: "c", unappliedCents: 5_000 }),
        ]);
        expect(p.availableCents).toBe(25_000);
        expect(p.pendingCents).toBe(30_000);
        expect(p.positions).toHaveLength(3);
    });

    /*
     * THIS EXPECTATION FLIPPED IN W4, AND THAT IS THE POINT.
     *
     * It used to assert `heldSupported: false` — "0, and we cannot measure this" — which was the
     * honest answer while nothing marked a receipt as held. W4 shipped `payment_holds`, so a zero is
     * now a MEASUREMENT. What has not changed is the thing the old note protected: held money is
     * never silently counted as spendable.
     */
    it("reports held money as measured, not as an absent capability", () => {
        const p = resolveAccountPrepaidPosition([pay({})]);
        expect(p.heldCents).toBe(0);
        expect(p.heldSupported, "the zero is now a measurement").toBe(true);
    });

    it("carves held money out of available, and reports it separately", () => {
        const p = resolveAccountPrepaidPosition([pay({ paymentId: "pay-h", unappliedCents: 50_000 })], { "pay-h": 30_000 });
        expect(p.heldCents).toBe(30_000);
        expect(p.availableCents, "available = unapplied − held").toBe(20_000);
        /* The receipt's own remainder is unchanged — a hold restricts money, it does not spend it. */
        expect(p.positions[0]!.unappliedCents).toBe(50_000);
        expect(p.positions[0]!.heldCents).toBe(30_000);
    });

    it("classifies a fully held receipt as held rather than available", () => {
        const p = resolveAccountPrepaidPosition([pay({ paymentId: "pay-f", unappliedCents: 50_000 })], { "pay-f": 50_000 });
        expect(p.positions[0]!.availability).toBe("held");
        expect(p.availableCents).toBe(0);
        expect(p.heldCents).toBe(50_000);
    });

    /*
     * A HOLD ON PENDING MONEY DOES NOT MAKE THE REST OF IT SPENDABLE. The receipt has not arrived;
     * holding part of it changes nothing about the other part.
     */
    it("never promotes a pending receipt to available by holding part of it", () => {
        const p = resolveAccountPrepaidPosition(
            [pay({ paymentId: "pay-p", unappliedCents: 40_000, status: "pending" })],
            { "pay-p": 10_000 },
        );
        expect(p.availableCents).toBe(0);
        expect(p.pendingCents).toBe(30_000);
        expect(p.heldCents).toBe(10_000);
    });

    /* Defensive floor: if the two authorities ever disagreed, never publish negative available money. */
    it("never reports negative available money if a hold exceeds the remainder", () => {
        const p = resolveAccountPrepaidPosition([pay({ paymentId: "pay-x", unappliedCents: 10_000 })], { "pay-x": 99_000 });
        expect(p.availableCents).toBe(0);
        expect(p.heldCents).toBe(10_000);
    });

    /* The payer travels with the money. Prepaid funds do not become the household's anonymously. */
    it("keeps the payer identity on each position", () => {
        const p = resolveAccountPrepaidPosition([pay({ payerLabel: "Rosa Alvarez", payerCustomerId: "cust-9" })]);
        expect(p.positions[0]!.payerLabel).toBe("Rosa Alvarez");
        expect(p.positions[0]!.payerCustomerId).toBe("cust-9");
    });
});

describe("THE GATE — owing nothing with money on account is not a negative balance", () => {
    it("states a settled account holding funds as two facts, not one netted number", () => {
        const prepaid = resolveAccountPrepaidPosition([pay({ unappliedCents: 20_000 })]);
        const position = resolveAccountFinancialPosition({
            currentBalanceCents: 0,
            dueCents: 0,
            pastDueCents: 0,
            prepaid,
        });
        expect(position.currentBalanceCents).toBe(0);
        expect(position.availablePrepaidCents).toBe(20_000);
        expect(position.settledWithFundsOnAccount).toBe(true);
        // The two are never combined into -20_000.
        expect(position.currentBalanceCents).not.toBe(-20_000);
    });

    /*
     * CURRENT BALANCE EXCLUDES UNAPPLIED MONEY — the existing doctrine, not a new rule.
     * `balance = responsibility − payments` sums only what was APPLIED, so prepaid funds do not
     * move the balance and do not reduce Due until allocation.
     */
    it("leaves Current Balance and Due untouched by unapplied money", () => {
        const prepaid = resolveAccountPrepaidPosition([pay({ unappliedCents: 50_000 })]);
        const position = resolveAccountFinancialPosition({
            currentBalanceCents: 30_000,
            dueCents: 30_000,
            pastDueCents: 10_000,
            prepaid,
        });
        expect(position.currentBalanceCents, "prepaid did not pay anything down").toBe(30_000);
        expect(position.dueCents).toBe(30_000);
        expect(position.pastDueCents).toBe(10_000);
        expect(position.availablePrepaidCents).toBe(50_000);
    });

    it("does not call an account with debt 'settled' merely because it holds funds", () => {
        const prepaid = resolveAccountPrepaidPosition([pay({ unappliedCents: 50_000 })]);
        expect(
            resolveAccountFinancialPosition({ currentBalanceCents: 1, dueCents: 1, pastDueCents: 0, prepaid })
                .settledWithFundsOnAccount,
        ).toBe(false);
    });

    it("does not call an empty account 'settled with funds'", () => {
        const prepaid = resolveAccountPrepaidPosition([]);
        expect(
            resolveAccountFinancialPosition({ currentBalanceCents: 0, dueCents: 0, pastDueCents: 0, prepaid })
                .settledWithFundsOnAccount,
        ).toBe(false);
    });
});

describe("the deposit story the instruction asks to be provable", () => {
    /*
     * Receive $500 with nothing owed; charge $300; apply $300; $200 remains. Modelled here as what
     * the canonical reader reports at each step — this asserts the POSITION follows the money, not
     * that allocation works, which `payment_allocations` already owns.
     */
    it("follows $500 in, $300 applied, $200 remaining", () => {
        const before = resolveAccountPrepaidPosition([pay({ unappliedCents: 50_000 })]);
        expect(before.availableCents).toBe(50_000);
        expect(
            resolveAccountFinancialPosition({ currentBalanceCents: 0, dueCents: 0, pastDueCents: 0, prepaid: before })
                .settledWithFundsOnAccount,
        ).toBe(true);

        // A $300 obligation arrives. Nothing about the held money changes until it is applied.
        const owing = resolveAccountFinancialPosition({
            currentBalanceCents: 30_000,
            dueCents: 30_000,
            pastDueCents: 0,
            prepaid: before,
        });
        expect(owing.availablePrepaidCents, "still held, not auto-applied").toBe(50_000);
        expect(owing.currentBalanceCents).toBe(30_000);

        // $300 applied: the reader now reports $200 unapplied on the same receipt.
        const after = resolveAccountPrepaidPosition([pay({ unappliedCents: 20_000, activeAppliedCents: 30_000 })]);
        const settled = resolveAccountFinancialPosition({
            currentBalanceCents: 0,
            dueCents: 0,
            pastDueCents: 0,
            prepaid: after,
        });
        expect(settled.availablePrepaidCents).toBe(20_000);
        expect(settled.currentBalanceCents).toBe(0);
    });
});
