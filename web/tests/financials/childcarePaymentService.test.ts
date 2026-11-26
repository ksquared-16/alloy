/**
 * CHILDCARE PAYMENT SERVICE — the service's own rules.
 *
 * ── WHAT THIS FILE CAN AND CANNOT PROVE ──
 *
 * The mock has no partial unique index, no trigger and no row lock. So it proves the SERVICE's
 * behaviour — the shape of what is written, the amounts chosen, the refusals stated in sentences —
 * and it cannot prove the guarantees that exist precisely because a service check races with itself.
 * "One active application per (payment, charge)" and "an application cannot over-pay a charge" are
 * asserted here as the service's mirror; they are certified as the DATABASE's rule by
 * `certification/financials/payment-application.cert.sh`, which runs against real Postgres. That
 * split is deliberate: `chargeLifecycleService` wrote `updated_by` against a column that did not
 * exist for months because a mock cannot fail the way a database does.
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
    recordAndApplyChildcarePayment,
    recordChildcarePayment,
    refundChildcarePayment,
    reversePaymentApplication,
} from "@/lib/financials/childcarePaymentService";

const AGREEMENT_ID = "agr-1";
const HOUSEHOLD_ID = "cust-1";

function postedCharge(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "charge-1",
        org_id: ORG_ID,
        job_id: null,
        billable_source_type: "enrollment_agreement",
        billable_source_id: AGREEMENT_ID,
        source_charge_id: null,
        charge_type: "service",
        charge_category: "tuition",
        status: "posted",
        currency_code: "USD",
        amount_cents: 130_000,
        posted_at: "2026-09-01T00:00:00.000Z",
        metadata: {},
        ...over,
    };
}

/*
 * The agreement is seeded because a charge's household is resolved THROUGH it. Without this row the
 * service cannot establish whose the charge is and refuses to apply — correctly, since "we could not
 * tell whose this is" must never open the gate. A fixture that omits it is not a lighter fixture; it
 * is a different scenario, one where the account genuinely cannot be identified.
 */
function agreement(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: AGREEMENT_ID,
        org_id: ORG_ID,
        customer_id: HOUSEHOLD_ID,
        customer_member_id: "member-1",
        ...over,
    };
}

function setup(
    charges: Record<string, unknown>[] = [postedCharge()],
    agreements: Record<string, unknown>[] = [agreement()],
) {
    const store = createOperationalEnrollmentMockStore({
        charges,
        child_enrollment_agreements: agreements,
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

describe("recording money received", () => {
    it("writes a childcare payment with job_id NULL on the generic billable-source dimension", async () => {
        const { supabase } = setup();
        const { payment, alreadyRecorded } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGREEMENT_ID,
            customerId: HOUSEHOLD_ID,
            amountCents: 50_000,
            paymentMethod: "check",
        });
        expect(alreadyRecorded).toBe(false);
        expect(payment.job_id).toBeNull();
        expect(payment.billable_source_type).toBe("enrollment_agreement");
        expect(payment.billable_source_id).toBe(AGREEMENT_ID);
        // The legacy column carries the household so job-era readers still resolve "whose payment".
        expect(payment.customer_id).toBe(HOUSEHOLD_ID);
        expect(payment.direction).toBe("inbound");
        expect(payment.status).toBe("posted");
        expect(payment.posted_at).not.toBeNull();
    });

    it("defaults a household payment's customer_id to the household it was received against", async () => {
        const { supabase } = setup();
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "customer",
            billableSourceId: HOUSEHOLD_ID,
            amountCents: 7_500,
            paymentMethod: "cash",
        });
        expect(payment.customer_id).toBe(HOUSEHOLD_ID);
    });

    it("records a PENDING attempt without a posted_at — an attempt is not money", async () => {
        const { supabase } = setup();
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "customer",
            billableSourceId: HOUSEHOLD_ID,
            amountCents: 7_500,
            paymentMethod: "card",
            status: "pending",
        });
        expect(payment.status).toBe("pending");
        expect(payment.posted_at).toBeNull();
    });

    it("returns the SAME payment for a replayed idempotency key instead of writing a second one", async () => {
        const { store, supabase } = setup();
        const input = {
            orgId: ORG_ID,
            billableSourceType: "customer" as const,
            billableSourceId: HOUSEHOLD_ID,
            amountCents: 50_000,
            paymentMethod: "cash" as const,
            idempotencyKey: "retry-me",
        };
        const first = await recordChildcarePayment(supabase, input);
        const second = await recordChildcarePayment(supabase, input);
        expect(second.alreadyRecorded).toBe(true);
        expect(second.payment.id).toBe(first.payment.id);
        expect(store.payments).toHaveLength(1);
    });

    it("refuses a zero or negative amount rather than writing a payment of nothing", async () => {
        const { supabase } = setup();
        for (const amountCents of [0, -100, 1.5]) {
            await expect(
                recordChildcarePayment(supabase, {
                    orgId: ORG_ID,
                    billableSourceType: "customer",
                    billableSourceId: HOUSEHOLD_ID,
                    amountCents,
                    paymentMethod: "cash",
                }),
            ).rejects.toMatchObject({ code: "invalid_input" });
        }
    });

    it("refuses a job source — job billing owns its own write path", async () => {
        const { supabase } = setup();
        await expect(
            recordChildcarePayment(supabase, {
                orgId: ORG_ID,
                // @ts-expect-error deliberately outside the childcare vocabulary
                billableSourceType: "job",
                billableSourceId: "job-1",
                amountCents: 100,
                paymentMethod: "cash",
            }),
        ).rejects.toMatchObject({ code: "invalid_input" });
    });
});

describe("applying money to an obligation", () => {
    it("reduces what is owed exactly once, without touching the posted charge", async () => {
        const { store, supabase } = setup();
        const before = await readChargeBalance(supabase, ORG_ID, "charge-1");
        expect(before.outstandingCents).toBe(130_000);

        const result = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "check",
            idempotencyKey: "pay-1",
        });
        expect(result.allocation?.allocated_amount_cents).toBe(130_000);

        const after = await readChargeBalance(supabase, ORG_ID, "charge-1");
        expect(after.appliedCents).toBe(130_000);
        expect(after.outstandingCents).toBe(0);

        // The charge itself is unchanged: its principal, category and posting stamp are as posted.
        const charge = store.charges.find((c) => c.id === "charge-1")!;
        expect(charge.amount_cents).toBe(130_000);
        expect(charge.status).toBe("posted");
        expect(charge.posted_at).toBe("2026-09-01T00:00:00.000Z");
    });

    it("a replayed request moves the balance ZERO further times", async () => {
        const { store, supabase } = setup();
        const input = {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "check" as const,
            idempotencyKey: "pay-1",
        };
        await recordAndApplyChildcarePayment(supabase, input);
        const replay = await recordAndApplyChildcarePayment(supabase, input);

        expect(replay.alreadyRecorded).toBe(true);
        expect(replay.alreadyApplied).toBe(true);
        expect(store.payments).toHaveLength(1);
        expect(store.payment_allocations.filter((a) => a.status === "active")).toHaveLength(1);
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(0);
    });

    it("applies a PARTIAL payment and leaves an exact residual", async () => {
        const { supabase } = setup();
        await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 50_000,
            paymentMethod: "cash",
            idempotencyKey: "part-1",
        });
        const after = await readChargeBalance(supabase, ORG_ID, "charge-1");
        expect(after.appliedCents).toBe(50_000);
        expect(after.outstandingCents).toBe(80_000);
    });

    it("takes a SECOND payment against the same charge without disturbing the first", async () => {
        const { store, supabase } = setup();
        const first = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 50_000,
            paymentMethod: "cash",
            idempotencyKey: "part-1",
        });
        const second = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 80_000,
            paymentMethod: "check",
            idempotencyKey: "part-2",
        });

        expect(second.payment.id).not.toBe(first.payment.id);
        const stillThere = store.payment_allocations.find((a) => a.id === first.allocation!.id)!;
        expect(stillThere.status).toBe("active");
        expect(stillThere.allocated_amount_cents).toBe(50_000);
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(0);
    });

    it("applies only what the charge still owes, and leaves the overpayment on the account", async () => {
        const { supabase } = setup();
        const result = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 200_000,
            paymentMethod: "ach",
            idempotencyKey: "over-1",
        });
        expect(result.allocation?.allocated_amount_cents).toBe(130_000);
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(0);
        // The remaining $700 is money the family really sent. It stays on the account, unapplied.
        expect(
            await readPaymentUnappliedCents(supabase, ORG_ID, result.payment.id, result.payment.amount_cents),
        ).toBe(70_000);
    });

    it("refuses an explicit over-application rather than silently truncating it", async () => {
        const { supabase } = setup();
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGREEMENT_ID,
            amountCents: 200_000,
            paymentMethod: "ach",
        });
        await expect(
            applyPaymentToCharge(supabase, {
                orgId: ORG_ID,
                paymentId: payment.id,
                chargeId: "charge-1",
                amountCents: 200_000,
            }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("refuses to pay a DRAFT charge — a draft is not owed", async () => {
        const { supabase } = setup([postedCharge({ status: "draft", posted_at: null })]);
        await expect(
            recordAndApplyChildcarePayment(supabase, {
                orgId: ORG_ID,
                chargeId: "charge-1",
                amountCents: 1_000,
                paymentMethod: "cash",
            }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("refuses to pay a VOID charge", async () => {
        const { supabase } = setup([postedCharge({ status: "void" })]);
        await expect(
            recordAndApplyChildcarePayment(supabase, {
                orgId: ORG_ID,
                chargeId: "charge-1",
                amountCents: 1_000,
                paymentMethod: "cash",
            }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("refuses to pay a JOB charge — job billing owns that path", async () => {
        const { supabase } = setup([
            postedCharge({ billable_source_type: "job", billable_source_id: "job-1", job_id: "job-1" }),
        ]);
        await expect(
            recordAndApplyChildcarePayment(supabase, {
                orgId: ORG_ID,
                chargeId: "charge-1",
                amountCents: 1_000,
                paymentMethod: "cash",
            }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("a PENDING attempt is recorded and applied to nothing — the balance does not move", async () => {
        const { store, supabase } = setup();
        const result = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "card",
            status: "pending",
            idempotencyKey: "attempt-1",
        });
        expect(result.payment.status).toBe("pending");
        expect(result.allocation).toBeNull();
        expect(store.payment_allocations).toHaveLength(0);
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(130_000);
    });

    it("a charge in another org is not found — the org comes from the caller, never the charge", async () => {
        const { supabase } = setup([postedCharge({ org_id: "other-org" })]);
        await expect(
            recordAndApplyChildcarePayment(supabase, {
                orgId: ORG_ID,
                chargeId: "charge-1",
                amountCents: 1_000,
                paymentMethod: "cash",
            }),
        ).rejects.toMatchObject({ code: "not_found" });
    });
});

describe("refunding — the original is never rewritten", () => {
    it("leaves the receipt intact, writes a linked outbound row, and gives the balance back", async () => {
        const { store, supabase } = setup();
        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "check",
            idempotencyKey: "pay-1",
        });
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(0);

        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG_ID,
            paymentId: paid.payment.id,
            reason: "recorded against the wrong family",
            idempotencyKey: "refund-1",
        });

        // 1. The receipt still reads exactly as received.
        const original = store.payments.find((p) => p.id === paid.payment.id)!;
        expect(original.amount_cents).toBe(130_000);
        expect(original.direction).toBe("inbound");
        expect(original.status).toBe("posted");

        // 2. The refund is its own row, with lineage.
        expect(refunded.refund.id).not.toBe(paid.payment.id);
        expect(refunded.refund.refunds_payment_id).toBe(paid.payment.id);
        expect(refunded.refund.direction).toBe("outbound");
        expect(refunded.refund.amount_cents).toBe(130_000);

        // 3. The application is REVERSED, not deleted — the history stays legible.
        const alloc = store.payment_allocations.find((a) => a.id === paid.allocation!.id)!;
        expect(alloc.status).toBe("reversed");
        expect(alloc.reversed_at).toBeTruthy();
        expect(alloc.reversal_reason).toBe("recorded against the wrong family");

        // 4. The balance is back.
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents).toBe(130_000);
    });

    it("refunded money is not available to apply again", async () => {
        const { supabase } = setup();
        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "check",
            idempotencyKey: "pay-1",
        });
        await refundChildcarePayment(supabase, { orgId: ORG_ID, paymentId: paid.payment.id });
        // Every application is reversed, so a naive read would call the whole receipt unapplied.
        // It left the building: nothing of it remains applicable.
        expect(
            await readPaymentUnappliedCents(supabase, ORG_ID, paid.payment.id, paid.payment.amount_cents),
        ).toBe(0);
    });

    it("a PARTIAL refund re-applies the kept remainder instead of editing the application", async () => {
        const { store, supabase } = setup();
        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "check",
            idempotencyKey: "pay-1",
        });
        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG_ID,
            paymentId: paid.payment.id,
            amountCents: 30_000,
        });

        // The original application is reversed in full and a new one carries what was kept.
        expect(store.payment_allocations.find((a) => a.id === paid.allocation!.id)!.status).toBe("reversed");
        expect(refunded.reappliedAllocation?.allocated_amount_cents).toBe(100_000);
        expect(refunded.reappliedAllocation?.status).toBe("active");

        const after = await readChargeBalance(supabase, ORG_ID, "charge-1");
        expect(after.appliedCents).toBe(100_000);
        expect(after.outstandingCents).toBe(30_000);
    });

    it("refuses to refund more than was received", async () => {
        const { supabase } = setup();
        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 50_000,
            paymentMethod: "cash",
            idempotencyKey: "pay-1",
        });
        await expect(
            refundChildcarePayment(supabase, {
                orgId: ORG_ID,
                paymentId: paid.payment.id,
                amountCents: 60_000,
            }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("refuses to refund a pending attempt — nothing was received to give back", async () => {
        const { supabase } = setup();
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "customer",
            billableSourceId: HOUSEHOLD_ID,
            amountCents: 50_000,
            paymentMethod: "card",
            status: "pending",
        });
        await expect(
            refundChildcarePayment(supabase, { orgId: ORG_ID, paymentId: payment.id }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("a replayed refund does not give the money back twice", async () => {
        const { store, supabase } = setup();
        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "check",
            idempotencyKey: "pay-1",
        });
        const input = { orgId: ORG_ID, paymentId: paid.payment.id, idempotencyKey: "refund-1" };
        await refundChildcarePayment(supabase, input);
        const replay = await refundChildcarePayment(supabase, input);

        expect(replay.alreadyRefunded).toBe(true);
        expect(store.payments.filter((p) => p.direction === "outbound")).toHaveLength(1);
    });

    it("refuses to refund a refund", async () => {
        const { supabase } = setup();
        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG_ID,
            chargeId: "charge-1",
            amountCents: 130_000,
            paymentMethod: "check",
            idempotencyKey: "pay-1",
        });
        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG_ID,
            paymentId: paid.payment.id,
        });
        await expect(
            refundChildcarePayment(supabase, { orgId: ORG_ID, paymentId: refunded.refund.id }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });
});

/*
 * UNDOING AN APPLICATION WITHOUT UNDOING THE PAYMENT.
 *
 * The correction an operator had no way to make: money applied to the wrong charge previously had to
 * be refunded to be moved. These pin the service's half — what is written, what is refused, and what
 * is deliberately left alone. The database's own guarantees (the partial unique index that makes the
 * re-apply exactly-once, and a real row lock under concurrency) belong to the Postgres certification
 * for the same reason the header of this file gives.
 */
describe("reversing a payment application", () => {
    const SECOND_CHARGE = postedCharge({ id: "charge-2", amount_cents: 40_000 });

    async function applied() {
        const { store, supabase } = setup([postedCharge(), SECOND_CHARGE]);
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGREEMENT_ID,
            customerId: HOUSEHOLD_ID,
            amountCents: 50_000,
            paymentMethod: "check",
        });
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG_ID,
            paymentId: payment.id,
            chargeId: "charge-1",
            amountCents: 50_000,
        });
        return { store, supabase, payment, allocation };
    }

    it("returns the obligation to the charge and the money to unapplied in one write", async () => {
        const { supabase, payment, allocation } = await applied();
        expect(await readPaymentUnappliedCents(supabase, ORG_ID, payment.id, 50_000)).toBe(0);

        const result = await reversePaymentApplication(supabase, {
            orgId: ORG_ID,
            allocationId: allocation.id,
            reason: "applied to the wrong charge",
        });

        expect(result.reversedAmountCents).toBe(50_000);
        expect(result.paymentUnappliedCents, "the money is available again").toBe(50_000);
        expect(result.chargeOutstandingCents, "and the charge owes it again").toBe(130_000);
        expect(await readChargeBalance(supabase, ORG_ID, "charge-1")).toMatchObject({
            appliedCents: 0,
            outstandingCents: 130_000,
        });
    });

    it("keeps the original application as history rather than editing it away", async () => {
        const { store, supabase, allocation } = await applied();
        await reversePaymentApplication(supabase, {
            orgId: ORG_ID,
            allocationId: allocation.id,
            reason: "operator correction",
        });
        const row = (store.payment_allocations as Record<string, unknown>[]).find(
            (r) => r.id === allocation.id,
        )!;
        // What was applied stays readable; only the fact that it was undone is added.
        expect(row.status).toBe("reversed");
        expect(row.allocated_amount_cents, "the amount is not rewritten").toBe(50_000);
        expect(row.charge_id, "nor the obligation it answered").toBe("charge-1");
        expect(row.reversed_at).toBeTruthy();
        expect(row.reversal_reason).toBe("operator correction");
    });

    it("lets the same money answer a different obligation afterwards", async () => {
        const { supabase, payment, allocation } = await applied();
        await reversePaymentApplication(supabase, {
            orgId: ORG_ID,
            allocationId: allocation.id,
            reason: "wrong charge",
        });
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID,
            paymentId: payment.id,
            chargeId: "charge-2",
            amountCents: 40_000,
        });
        expect(await readChargeBalance(supabase, ORG_ID, "charge-2")).toMatchObject({
            appliedCents: 40_000,
            outstandingCents: 0,
        });
        expect(await readPaymentUnappliedCents(supabase, ORG_ID, payment.id, 50_000)).toBe(10_000);
    });

    it("refuses a second reversal instead of double-crediting the charge", async () => {
        const { supabase, allocation } = await applied();
        await reversePaymentApplication(supabase, {
            orgId: ORG_ID,
            allocationId: allocation.id,
            reason: "first",
        });
        await expect(
            reversePaymentApplication(supabase, {
                orgId: ORG_ID,
                allocationId: allocation.id,
                reason: "second",
            }),
        ).rejects.toThrow(/already reversed/i);
    });

    it("leaves the receipt, its payer and its provider reference completely alone", async () => {
        const { store, supabase, payment, allocation } = await applied();
        const before = JSON.stringify(
            (store.payments as Record<string, unknown>[]).find((r) => r.id === payment.id),
        );
        await reversePaymentApplication(supabase, {
            orgId: ORG_ID,
            allocationId: allocation.id,
            reason: "correction",
        });
        const after = JSON.stringify(
            (store.payments as Record<string, unknown>[]).find((r) => r.id === payment.id),
        );
        expect(after, "reversal never writes to payments").toBe(before);
    });

    it("creates no refund — unapplied is not the same as given back", async () => {
        const { store, supabase, allocation } = await applied();
        const refundsBefore = (store.payments as Record<string, unknown>[]).filter(
            (r) => r.refunds_payment_id,
        ).length;
        await reversePaymentApplication(supabase, {
            orgId: ORG_ID,
            allocationId: allocation.id,
            reason: "correction",
        });
        const refundsAfter = (store.payments as Record<string, unknown>[]).filter(
            (r) => r.refunds_payment_id,
        ).length;
        expect(refundsAfter).toBe(refundsBefore);
        expect(refundsAfter).toBe(0);
    });

    it("requires a reason, because the row is the only account of why the money moved", async () => {
        const { supabase, allocation } = await applied();
        await expect(
            reversePaymentApplication(supabase, {
                orgId: ORG_ID,
                allocationId: allocation.id,
                reason: "   ",
            }),
        ).rejects.toThrow(/reason is required/i);
    });

    it("answers NOT FOUND for another tenant's application rather than admitting it exists", async () => {
        const { supabase, allocation } = await applied();
        await expect(
            reversePaymentApplication(supabase, {
                orgId: "00000000-0000-0000-0000-0000000000ff",
                allocationId: allocation.id,
                reason: "correction",
            }),
        ).rejects.toThrow(/not found/i);
    });
});

/*
 * ONE FAMILY'S MONEY MAY ONLY ANSWER THAT FAMILY'S OBLIGATIONS.
 *
 * This was reachable: a household-A payment applied in full to a charge raised against a household-B
 * agreement, same org, allocation created, no complaint. Everything the service checked looked at the
 * payment and the charge separately, and nothing asked whether they belonged to the same family.
 *
 * The boundary is the HOUSEHOLD, not the billable source — a household pays and the money answers a
 * charge raised against one of its children's agreements, which is a supported flow and must stay
 * allowed. And it is enforced in the service that inserts the allocation, because a target the UI
 * never offered is still reachable by anyone who can call it.
 */
describe("a payment may only be applied within its own household", () => {
    const HOUSEHOLD_B = "cust-B";
    const AGREEMENT_B = "agr-B";

    function twoHouseholds() {
        const store = createOperationalEnrollmentMockStore({
            charges: [
                postedCharge(),
                postedCharge({ id: "charge-B", billable_source_id: AGREEMENT_B, amount_cents: 90_000 }),
            ],
            child_enrollment_agreements: [
                agreement(),
                agreement({ id: AGREEMENT_B, customer_id: HOUSEHOLD_B, customer_member_id: "member-B" }),
            ],
        });
        return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
    }

    /** PART F — the load-bearing positive: the household pays, a child's agreement charge is answered. */
    it("lets a household payment answer a charge raised against its own child's agreement", async () => {
        const { supabase } = setup();
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "customer",
            billableSourceId: HOUSEHOLD_ID,
            amountCents: 40_000,
            paymentMethod: "check",
        });
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG_ID,
            paymentId: payment.id,
            chargeId: "charge-1",
            amountCents: 40_000,
        });
        expect(allocation.charge_id, "cross-GRAIN within one household is allowed").toBe("charge-1");
    });

    /** PART G — household is the boundary, not the child. */
    it("lets one household payment answer two different children's charges", async () => {
        const store = createOperationalEnrollmentMockStore({
            charges: [
                postedCharge(),
                postedCharge({ id: "charge-sibling", billable_source_id: "agr-2", amount_cents: 30_000 }),
            ],
            child_enrollment_agreements: [
                agreement(),
                agreement({ id: "agr-2", customer_id: HOUSEHOLD_ID, customer_member_id: "member-2" }),
            ],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "customer",
            billableSourceId: HOUSEHOLD_ID,
            amountCents: 50_000,
            paymentMethod: "check",
        });
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-1", amountCents: 20_000,
        });
        const second = await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-sibling", amountCents: 30_000,
        });
        expect(second.allocation.charge_id, "two children, one household, one payment").toBe("charge-sibling");
    });

    /** PART H/I — the defect, refused. Called directly, as a forged target would be. */
    it("refuses another household's charge, and changes nothing when it does", async () => {
        const { store, supabase } = twoHouseholds();
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGREEMENT_ID,
            customerId: HOUSEHOLD_ID,
            amountCents: 50_000,
            paymentMethod: "check",
        });
        const allocationsBefore = (store.payment_allocations as unknown[]).length;
        const paymentsBefore = JSON.stringify(store.payments);

        await expect(
            applyPaymentToCharge(supabase, {
                orgId: ORG_ID,
                paymentId: payment.id,
                chargeId: "charge-B",
                amountCents: 50_000,
            }),
        ).rejects.toThrow(/different household/i);

        // A refusal that still moved money would be worse than no refusal at all.
        expect((store.payment_allocations as unknown[]).length, "no allocation was created").toBe(
            allocationsBefore,
        );
        expect(JSON.stringify(store.payments), "no payment row changed").toBe(paymentsBefore);
        expect(await readPaymentUnappliedCents(supabase, ORG_ID, payment.id, 50_000)).toBe(50_000);
        expect(await readChargeBalance(supabase, ORG_ID, "charge-B")).toMatchObject({
            appliedCents: 0,
            outstandingCents: 90_000,
        });
    });

    /* An unresolvable household refuses too: a dangling source id must not read as "no objection". */
    it("refuses when the charge's household cannot be established at all", async () => {
        const store = createOperationalEnrollmentMockStore({
            charges: [postedCharge({ id: "charge-orphan", billable_source_id: "agr-missing" })],
            child_enrollment_agreements: [agreement()],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "customer",
            billableSourceId: HOUSEHOLD_ID,
            amountCents: 10_000,
            paymentMethod: "cash",
        });
        await expect(
            applyPaymentToCharge(supabase, {
                orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-orphan", amountCents: 10_000,
            }),
        ).rejects.toThrow(/cannot establish the household/i);
    });
});
