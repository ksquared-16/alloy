/**
 * WHAT AN ORDINARY REFUND DOES TO APPLICATIONS — characterised, not changed.
 *
 * `refundChildcarePayment` reverses active applications oldest-first up to the refunded amount, and
 * it does so WITHOUT first asking whether the receipt still holds unapplied money that could fund
 * the refund instead. A held-lot refund was exempted in `b8e9fb34b` on the narrow ground that a
 * lot's money is unapplied BY CONSTRUCTION — `enforce_payment_hold_within_unapplied` guarantees it.
 * Ordinary unapplied money carries no such guarantee, and changing the ordinary rule would change
 * which of a family's obligations are settled on every tenant.
 *
 * So this suite does not assert what SHOULD happen. It records what DOES, case by case, so the
 * decision packet is argued from measurements rather than from intuition, and so that whichever way
 * the decision goes, the change is visible here.
 */
import { describe, expect, it } from "vitest";

import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import {
    applyPaymentToCharge,
    readChargeBalance,
    readPaymentUnappliedCents,
    recordChildcarePayment,
    refundChildcarePayment,
} from "@/lib/financials/childcarePaymentService";

const AGREEMENT_ID = "agr-1";
const HOUSEHOLD_ID = "cust-1";
const CHARGE_CENTS = 30_000;

function setup(holds: Record<string, unknown>[] = []) {
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
    const extra = store as unknown as Record<string, Record<string, unknown>[]>;
    extra.payment_holds = holds;
    extra.payment_hold_dispositions = [];
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

async function receipt(supabase: ReturnType<typeof setup>["supabase"], cents: number) {
    const { payment } = await recordChildcarePayment(supabase, {
        orgId: ORG_ID, billableSourceType: "enrollment_agreement", billableSourceId: AGREEMENT_ID,
        customerId: HOUSEHOLD_ID, amountCents: cents, paymentMethod: "cash", idempotencyKey: `pay-${cents}`,
    });
    return payment;
}

/** Received, applied, unapplied and what the family owes — the four the decision turns on. */
async function state(supabase: ReturnType<typeof setup>["supabase"], paymentId: string, receivedCents: number) {
    const unapplied = await readPaymentUnappliedCents(supabase, ORG_ID, paymentId, receivedCents);
    const { outstandingCents } = await readChargeBalance(supabase, ORG_ID, "charge-1");
    return { unapplied, outstanding: outstandingCents };
}

describe("A — a fully unapplied receipt is refunded", () => {
    it("reverses nothing, because there is nothing applied to reverse", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 50_000);
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 8_000, idempotencyKey: "r-a",
        });
        expect(r.reversedAllocationIds).toEqual([]);
        const after = await state(supabase, p.id, 50_000);
        expect(after.outstanding).toBe(CHARGE_CENTS);
    });
});

describe("B — partly applied, and the unapplied money alone could fund the refund", () => {
    it("REVERSES THE APPLICATION ANYWAY, and the obligation comes back", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        const before = await state(supabase, p.id, 50_000);
        expect(before.unapplied).toBe(40_000);
        expect(before.outstanding).toBe(20_000);

        /* $8,000 refunded against $40,000 of unapplied money. */
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 8_000, idempotencyKey: "r-b",
        });

        /* THIS IS THE FINDING. The application is reversed and re-applied for the remainder. */
        expect(r.reversedAllocationIds.length).toBe(1);
        expect(r.reappliedAllocation?.allocated_amount_cents).toBe(2_000);
        const after = await state(supabase, p.id, 50_000);
        expect(after.outstanding).toBe(28_000);
        /* The family owes $8,000 more than before a refund that never touched their tuition. */
        expect(after.outstanding - before.outstanding).toBe(8_000);
    });
});

describe("C — partly applied, and the unapplied money cannot cover the refund", () => {
    it("must reverse applications, on any reading", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 32_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 30_000,
        });
        const before = await state(supabase, p.id, 32_000);
        expect(before.unapplied).toBe(2_000);

        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 10_000, idempotencyKey: "r-c",
        });
        expect(r.reversedAllocationIds.length).toBe(1);
        const after = await state(supabase, p.id, 32_000);
        expect(after.outstanding).toBe(10_000);
    });
});

describe("D — a fully applied receipt is refunded", () => {
    it("reverses, and the obligation returns in full", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 30_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 30_000,
        });
        expect((await state(supabase, p.id, 30_000)).outstanding).toBe(0);
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 30_000, idempotencyKey: "r-d",
        });
        expect(r.reversedAllocationIds.length).toBe(1);
        expect((await state(supabase, p.id, 30_000)).outstanding).toBe(30_000);
    });
});

describe("E — held money is present and is NOT what funds the ordinary refund", () => {
    it("the held lot is untouched, and the ordinary rule still reverses the application", async () => {
        const { supabase, store } = setup();
        const p = await receipt(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        (store as unknown as Record<string, Record<string, unknown>[]>).payment_holds.push({
            id: "hold-1", org_id: ORG_ID, payment_id: p.id, amount_cents: 20_000,
            refundable: true, refundable_terms: {}, policy_id: null, reason: "Enrollment deposit",
            held_at: "2026-09-02T00:00:00.000Z", created_by: null, metadata: {},
        });

        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 5_000, idempotencyKey: "r-e",
        });
        /* No lot is named, so no disposition is written and the lot keeps its money. */
        expect(r.reversedAllocationIds.length).toBe(1);
        const dispositions = (store as unknown as Record<string, unknown[]>).payment_hold_dispositions;
        expect(dispositions).toEqual([]);
    });

    it("and a refund that DOES name the lot reverses nothing — the repaired case", async () => {
        const { supabase, store } = setup();
        const p = await receipt(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        (store as unknown as Record<string, Record<string, unknown>[]>).payment_holds.push({
            id: "hold-1", org_id: ORG_ID, payment_id: p.id, amount_cents: 20_000,
            refundable: true, refundable_terms: {}, policy_id: null, reason: "Enrollment deposit",
            held_at: "2026-09-02T00:00:00.000Z", created_by: null, metadata: {},
        });
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 5_000, idempotencyKey: "r-e2",
            heldLotId: "hold-1",
        });
        expect(r.reversedAllocationIds).toEqual([]);
    });
});

/*
 * F — A PROVIDER RETURN IS NOT AN OPERATOR REFUND, and must not be swept into this decision.
 * `providerDispute` calls the same writer because the financial consequence is the same reversal,
 * and the CAUSE is the opposite: a chargeback is money the bank withdrew from revenue Alloy had
 * already recognised. There is no "the operator could have used unapplied money instead" — nobody
 * chose anything. Whatever is decided about the operator refund, this path keeps reversing.
 */
describe("F — the provider return path is separate by construction", () => {
    it("is a different module, and it does not name a held lot", async () => {
        const source = await import("node:fs").then((fs) =>
            fs.readFileSync(`${process.cwd()}/lib/financials/payments/providerDispute.ts`, "utf8"));
        expect(source).toContain("refundChildcarePayment");
        expect(source).not.toContain("heldLotId");
        /* It states its own reason for reusing the writer. */
        expect(source).toMatch(/reverse|outstanding comes back/i);
    });
});
