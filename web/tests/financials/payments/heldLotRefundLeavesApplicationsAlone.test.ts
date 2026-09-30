/**
 * REFUNDING A DEPOSIT MUST NOT UN-SETTLE WHAT THE FAMILY ALREADY PAID.
 *
 * `refundChildcarePayment` reverses active applications oldest-first up to the refunded amount,
 * which is right for an ordinary refund: money that settled an obligation went back, so the
 * obligation comes back. It was doing it for a HELD LOT too, and a lot's money is restricted and
 * unapplied by construction — `enforce_payment_hold_within_unapplied` refuses a hold larger than
 * the receipt's unapplied balance. Refunding it settles nothing and must un-settle nothing.
 *
 * MEASURED ON DEPLOYED STAGING (build 3741a80ba) before this was fixed. An $80 deposit refunded
 * against a $700 cash receipt that still held $582 unapplied:
 *
 *   reversed_allocation_ids  three of them — every application on the receipt
 *   reapplied_allocation_id  one, for $38
 *   CURRENT BALANCE          $75.00  ->  $137.00
 *   PAID                     $100.00 ->  $38.00
 *   AVAILABLE PREPAID        $387.00 ->  $467.00   (+$80, exactly the refund)
 *   HELD DEPOSIT             $195.00 ->  $115.00
 *
 * The deposit became spendable prepaid and the refund came out of settled obligations — the
 * release-then-refund shape the held-money design exists to refuse, arrived at by another route.
 */
import { describe, expect, it } from "vitest";

import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import {
    readChargeBalance,
    recordAndApplyChildcarePayment,
    refundChildcarePayment,
} from "@/lib/financials/childcarePaymentService";

const AGREEMENT_ID = "agr-1";
const HOUSEHOLD_ID = "cust-1";
const CHARGE_CENTS = 30_000;

/* A receipt far larger than the charge, so money is left over to hold — the deployed shape. */
const RECEIPT_CENTS = 100_000;
const REFUND_CENTS = 8_000;

function setup() {
    const store = createOperationalEnrollmentMockStore({
        charges: [{
            id: "charge-1", org_id: ORG_ID, job_id: null,
            billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT_ID,
            source_charge_id: null, charge_type: "service", charge_category: "tuition",
            status: "posted", currency_code: "USD", amount_cents: CHARGE_CENTS,
            posted_at: "2026-09-01T00:00:00.000Z", metadata: {},
        }],
        child_enrollment_agreements: [{
            id: AGREEMENT_ID, org_id: ORG_ID, customer_id: HOUSEHOLD_ID, customer_member_id: "member-1",
        }],
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

/** A receipt whose charge is settled and which still has money over. */
async function paidWithChangeLeft(supabase: ReturnType<typeof setup>["supabase"]) {
    return recordAndApplyChildcarePayment(supabase, {
        orgId: ORG_ID,
        chargeId: "charge-1",
        amountCents: RECEIPT_CENTS,
        paymentMethod: "cash",
        idempotencyKey: "pay-1",
    });
}

describe("a refund raised from a held lot", () => {
    it("reverses no application and leaves the charge settled", async () => {
        const { store, supabase } = setup();
        const paid = await paidWithChangeLeft(supabase);
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(0);

        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG_ID,
            paymentId: paid.payment.id,
            amountCents: REFUND_CENTS,
            reason: "deposit returned",
            idempotencyKey: "refund-held-1",
            heldLotId: "hold-1",
        });

        expect(refunded.reversedAllocationIds).toEqual([]);
        expect(refunded.reappliedAllocation).toBeNull();

        /* The application the family paid with is untouched, and so is what they owe. */
        const alloc = store.payment_allocations.find((a) => a.id === paid.allocation!.id)!;
        expect(alloc.status).toBe("active");
        expect(alloc.reversed_at ?? null).toBeNull();
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(0);
    });

    it("still writes the refund itself, so the money genuinely went back", async () => {
        const { supabase } = setup();
        const paid = await paidWithChangeLeft(supabase);
        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG_ID,
            paymentId: paid.payment.id,
            amountCents: REFUND_CENTS,
            idempotencyKey: "refund-held-2",
            heldLotId: "hold-1",
        });
        expect(refunded.refund.direction).toBe("outbound");
        expect(refunded.refund.refunds_payment_id).toBe(paid.payment.id);
        expect(refunded.refund.amount_cents).toBe(REFUND_CENTS);
        expect(refunded.alreadyRefunded).toBe(false);
    });
});

/*
 * THE CONTROL. Without it, "reverses nothing" would also pass if the reversal had simply been
 * deleted. An ordinary refund — no lot — must still give the obligation back.
 */
describe("an ordinary refund, with no lot behind it", () => {
    it("still reverses the application and restores the balance", async () => {
        const { store, supabase } = setup();
        const paid = await paidWithChangeLeft(supabase);

        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG_ID,
            paymentId: paid.payment.id,
            amountCents: REFUND_CENTS,
            reason: "recorded against the wrong family",
            idempotencyKey: "refund-plain-1",
        });

        expect(refunded.reversedAllocationIds).toEqual([paid.allocation!.id]);
        const alloc = store.payment_allocations.find((a) => a.id === paid.allocation!.id)!;
        expect(alloc.status).toBe("reversed");
        /* Reversed in full and the kept remainder re-applied — a partial refund is arithmetic. */
        expect(refunded.reappliedAllocation).not.toBeNull();
        expect(refunded.reappliedAllocation!.allocated_amount_cents).toBe(CHARGE_CENTS - REFUND_CENTS);
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(REFUND_CENTS);
    });
});
