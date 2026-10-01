/**
 * WHAT FUNDS AN OPERATOR'S REFUND — the Director decision, bound case by case.
 *
 * An operator-initiated refund is funded from eligible ordinary unapplied RETAINED money first:
 *
 *     unapplied-funded  = min(X, U)
 *     must reverse      = max(0, X − U)
 *     U                 = received − already refunded − actively applied − held
 *
 * Before this, every refund reversed applications for its whole amount. Measured on the previous
 * run: an $80 refund against $400 of unapplied money reversed the application and added $80 to
 * what the family owed — a refund of a credit balance silently re-opening settled obligations.
 *
 * Three things the decision deliberately does NOT change, each locked below:
 *   held money is not eligible funding (E), and a refund that names a lot is funded by it (F);
 *   a provider return reverses in full, because nobody chose how to fund it (G);
 *   the reversal ORDER is untouched — this decides WHEN a reversal is required, not which
 *   allocation goes first.
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

describe("B — partly applied, and the unapplied money alone can fund the refund", () => {
    it("reverses NOTHING, and what the family owes does not move", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        const before = await state(supabase, p.id, 50_000);
        expect(before.unapplied).toBe(40_000);
        expect(before.outstanding).toBe(20_000);

        /* X = 8,000 · U = 50,000 − 0 refunded − 10,000 applied − 0 held = 40,000 · reverse max(0, −32,000) = 0 */
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 8_000, idempotencyKey: "r-b",
        });

        expect(r.reversedAllocationIds).toEqual([]);
        expect(r.reappliedAllocation).toBeNull();
        const after = await state(supabase, p.id, 50_000);
        expect(after.outstanding).toBe(before.outstanding);
        /* The refund is real: a new outbound row against the receipt. */
        expect(r.refund.direction).toBe("outbound");
        expect(r.refund.amount_cents).toBe(8_000);
    });

    it("counts money already refunded out of what is still eligible", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        /* First refund: U = 40,000, funded entirely, nothing reverses. */
        await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 35_000, idempotencyKey: "r-b2a",
        });
        /* Second: U = 50,000 − 35,000 − 10,000 = 5,000, so 3,000 of an 8,000 refund must reverse. */
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 8_000, idempotencyKey: "r-b2b",
        });
        expect(r.reversedAllocationIds.length).toBe(1);
        expect(r.reappliedAllocation?.allocated_amount_cents).toBe(7_000);
        expect((await state(supabase, p.id, 50_000)).outstanding).toBe(23_000);
    });
});

describe("C — partly applied, and the unapplied money covers only part of the refund", () => {
    it("reverses the shortfall and no more", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 32_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 30_000,
        });
        const before = await state(supabase, p.id, 32_000);
        expect(before.unapplied).toBe(2_000);
        expect(before.outstanding).toBe(0);

        /* X = 10,000 · U = 2,000 · reverse 8,000 — not the whole 10,000. */
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 10_000, idempotencyKey: "r-c",
        });
        expect(r.reversedAllocationIds.length).toBe(1);
        /* The straddling allocation is reversed in full and its kept remainder re-applied. */
        expect(r.reappliedAllocation?.allocated_amount_cents).toBe(22_000);
        const after = await state(supabase, p.id, 32_000);
        expect(after.outstanding).toBe(8_000);
        expect(after.outstanding - before.outstanding).toBe(8_000);
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

describe("E — held money is present, and is not eligible to fund an ordinary refund", () => {
    /* A receipt with more than enough unapplied money — but most of it is restricted. */
    async function heldTopology() {
        const s2 = setup();
        const p = await receipt(s2.supabase, 50_000);
        await applyPaymentToCharge(s2.supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        (s2.store as unknown as Record<string, Record<string, unknown>[]>).payment_holds.push({
            id: "hold-1", org_id: ORG_ID, payment_id: p.id, amount_cents: 38_000,
            refundable: true, refundable_terms: {}, policy_id: null, reason: "Enrollment deposit",
            held_at: "2026-09-02T00:00:00.000Z", created_by: null, metadata: {},
        });
        return { ...s2, payment: p };
    }

    it("subtracts the held lot out of what may fund the refund", async () => {
        const { supabase, store, payment } = await heldTopology();
        /*
         * Unapplied is 40,000 and would have funded this refund entirely — but 38,000 of it is
         * held, so U = 2,000 and 3,000 of a 5,000 refund must come from applications.
         */
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: payment.id, amountCents: 5_000, idempotencyKey: "r-e",
        });
        expect(r.reversedAllocationIds.length).toBe(1);
        expect(r.reappliedAllocation?.allocated_amount_cents).toBe(7_000);
        /* And the lot is untouched: no disposition, because no lot was named. */
        expect((store as unknown as Record<string, unknown[]>).payment_hold_dispositions).toEqual([]);
        expect((await state(supabase, payment.id, 50_000)).outstanding).toBe(23_000);
    });

    it("cannot be spent by an ordinary refund even when the receipt looks unapplied", async () => {
        const { supabase, store, payment } = await heldTopology();
        /* The whole unrestricted 2,000 funds this, so nothing reverses and the lot stays whole. */
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: payment.id, amountCents: 2_000, idempotencyKey: "r-e2",
        });
        expect(r.reversedAllocationIds).toEqual([]);
        expect((store as unknown as Record<string, unknown[]>).payment_hold_dispositions).toEqual([]);
    });
});

describe("F — an explicit held-lot refund keeps its own semantics", () => {
    it("is funded by the lot it names and reverses nothing", async () => {
        const s2 = setup();
        const p = await receipt(s2.supabase, 50_000);
        await applyPaymentToCharge(s2.supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 30_000,
        });
        (s2.store as unknown as Record<string, Record<string, unknown>[]>).payment_holds.push({
            id: "hold-1", org_id: ORG_ID, payment_id: p.id, amount_cents: 20_000,
            refundable: true, refundable_terms: {}, policy_id: null, reason: "Enrollment deposit",
            held_at: "2026-09-02T00:00:00.000Z", created_by: null, metadata: {},
        });
        /*
         * U is zero here — 50,000 − 30,000 applied − 20,000 held — so an ORDINARY refund of this
         * size would reverse in full. Naming the lot is what makes the difference, exactly as
         * #1348 established.
         */
        const r = await refundChildcarePayment(s2.supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 5_000, idempotencyKey: "r-f",
            heldLotId: "hold-1",
        });
        expect(r.reversedAllocationIds).toEqual([]);
        expect((await state(s2.supabase, p.id, 50_000)).outstanding).toBe(0);
    });
});

describe("G — a provider return is not an operator choosing how to fund a refund", () => {
    it("reverses in full even when the receipt is holding unapplied money", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        /* 40,000 unapplied would fund this entirely — for an operator. The bank did not choose. */
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 8_000, idempotencyKey: "r-g",
            reversalOrigin: "provider",
        });
        expect(r.reversedAllocationIds.length).toBe(1);
        expect(r.reappliedAllocation?.allocated_amount_cents).toBe(2_000);
        expect((await state(supabase, p.id, 50_000)).outstanding).toBe(28_000);
        /*
         * The cause is WRITTEN to `reversal_origin` — see the insert — but `PAYMENT_COLUMNS` does
         * not select it back, so the returned row genuinely does not carry it and asserting on it
         * here would be testing the mock's fidelity rather than the product. The behaviour above
         * is the proof; the unread column is carried as debt.
         */
    });

    it("and the operator default is the other behaviour, from the same call shape", async () => {
        const { supabase } = setup();
        const p = await receipt(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: p.id, chargeId: "charge-1", amountCents: 10_000,
        });
        const r = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 8_000, idempotencyKey: "r-g2",
        });
        expect(r.reversedAllocationIds).toEqual([]);
    });

    it("providerDispute is the caller that sets it, and names no lot", async () => {
        const source = await import("node:fs").then((fs) =>
            fs.readFileSync(`${process.cwd()}/lib/financials/payments/providerDispute.ts`, "utf8"));
        expect(source).toContain("refundChildcarePayment");
        expect(source).toContain('reversalOrigin: "provider"');
        expect(source).not.toContain("heldLotId");
    });
});
