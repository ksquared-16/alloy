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
import fs from "node:fs";
import path from "node:path";

import {
    readChargeBalance,
    recordAndApplyChildcarePayment,
    refundChildcarePayment,
} from "@/lib/financials/childcarePaymentService";
import { heldRefundEligibility, type HeldDeposit } from "@/lib/financials/prepaid/heldDeposits";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

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
    /*
     * THE CONTROL. Without it, "reverses nothing" would also pass if the reversal had been
     * deleted. The receipt here is FULLY applied, so there is no unapplied money to fund the
     * refund and an application must come back — which is the Director decision's own case D.
     */
    it("still reverses the application when nothing else can fund it", async () => {
        const { store, supabase } = setup();
        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID, chargeId: "charge-1", amountCents: CHARGE_CENTS,
            paymentMethod: "cash", idempotencyKey: "pay-full",
        });
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(0);

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

/*
 * ── THE TERMS BELONG TO ELIGIBILITY, NOT ONLY TO EXECUTION ──────────────────────────────────
 *
 * `execute` has always refused a non-refundable lot before any provider call. `resolveEligibility`
 * did not look at the lot at all, so a PREVIEW of refunding a deposit marked "Taken as
 * non-refundable" was indistinguishable from one against a refundable lot: `eligible: true`, no
 * blockers. Measured on deployed staging (build 3741a80ba), both lots on the same account answered
 * identically.
 *
 * That hook is the answer other surfaces read — previews, and BOS proposals, which never reach
 * `execute` before telling an operator what is possible.
 */
describe("refund eligibility reads the terms the money was taken under", () => {
    const hold = (over: Partial<HeldDeposit> = {}): HeldDeposit => ({
        id: "hold-1", orgId: "org-1", paymentId: "pay-1",
        originalAmountCents: 50_000, remainingCents: 50_000,
        releasedCents: 0, appliedCents: 0, refundedCents: 0,
        refundable: true, refundableTerms: {}, policyId: null,
        reason: "Enrollment deposit", heldAt: null, createdBy: null,
        dispositions: [], open: true,
        ...over,
    });

    it("refuses a non-refundable lot, in the operator's words", () => {
        const refusal = heldRefundEligibility(hold({ refundable: false }), 50_000);
        expect(refusal.ok).toBe(false);
        if (refusal.ok) throw new Error("expected a refusal");
        expect(refusal.message).toBe("This deposit was taken as non-refundable, so it cannot be refunded.");
        /* Business language: no table, no column, no action key. */
        expect(refusal.message).not.toMatch(/payment_holds|hold_id|disposition|refundable=/);
    });

    it("bounds the amount by the lot, not by the receipt", () => {
        const refusal = heldRefundEligibility(hold({ remainingCents: 17_500 }), 50_000);
        expect(refusal.ok).toBe(false);
        if (refusal.ok) throw new Error("expected a refusal");
        expect(refusal.message).toMatch(/more than is still held/i);
    });

    it("allows a refundable lot within what remains", () => {
        expect(heldRefundEligibility(hold(), 50_000).ok).toBe(true);
        expect(heldRefundEligibility(hold(), 1).ok).toBe(true);
    });

    /*
     * THE WIRING. The guard above is only worth anything if the action's own eligibility hook asks
     * it — which is the half that was missing.
     */
    it("the refund action's eligibility hook consults it", () => {
        const source = read("lib/adminV2/actions/definitions/financialPaymentActions.ts");
        /* The DEFINITION, not the first mention of the key — which is its own `export const`. */
        const refundStart = source.indexOf("    actionKey: PAYMENT_REFUND_ACTION_KEY,");
        expect(refundStart, "the refund action definition was not found").toBeGreaterThan(-1);
        const hookStart = source.indexOf("async resolveEligibility", refundStart);
        const hookEnd = source.indexOf("async buildPreview", hookStart);
        expect(hookStart).toBeGreaterThan(refundStart);
        expect(hookEnd).toBeGreaterThan(hookStart);
        const hook = source.slice(hookStart, hookEnd);
        expect(hook).toContain("heldRefundEligibility");
        expect(hook).toContain("hold_not_refundable");
    });
});
