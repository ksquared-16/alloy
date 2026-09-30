/**
 * HELD MONEY IS NOT AVAILABLE TO APPLY.
 *
 * `applyPaymentToCharge` bounded an ordinary application by `unapplied`, which counts the WHOLE
 * receipt — deposits included. A hold is a restriction WITHIN the receipt, and nothing subtracted
 * it, so the ordinary path could spend a deposit: no disposition, no decision about the lot, no
 * refusal. The held figure simply shrank.
 *
 * MEASURED ON DEPLOYED STAGING (build e9694c5c8). A receipt showing AVAILABLE PREPAID $7.00 beside
 * HELD DEPOSIT $515.00 applied $75.00 to a registration fee:
 *
 *   allocation 0347c641…  applied_amount_cents 7500  already_applied false
 *   AVAILABLE PREPAID  $7.00    ->  (silent, i.e. zero)
 *   HELD DEPOSIT       $515.00  ->  $447.00
 *   CURRENT BALANCE    $137.00  ->  $62.00
 *
 * $7 of available prepaid and $68 of held money settled tuition — the one thing the surface's own
 * sentence promises cannot happen: "It is not available prepaid and it does not reduce what the
 * family owes until it is applied."
 *
 * The database could not catch it. `enforce_payment_hold_within_unapplied` fires when a HOLD is
 * written; an allocation eroding the money an existing hold depends on changes no hold row, so the
 * trigger never runs.
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
    recordChildcarePayment,
} from "@/lib/financials/childcarePaymentService";

const AGREEMENT_ID = "agr-1";
const HOUSEHOLD_ID = "cust-1";

/** The charge is larger than what is left unrestricted, which is the whole point. */
const CHARGE_CENTS = 30_000;
const RECEIPT_CENTS = 50_000;
const HELD_CENTS = 40_000;
/** 50,000 received − 40,000 held = 10,000 that may answer an obligation. */
const APPLICABLE_CENTS = RECEIPT_CENTS - HELD_CENTS;

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
    /*
     * The mock store has a fixed shape and drops unknown seed keys, while its reader answers any
     * table it finds on the object — so the hold tables are attached rather than seeded.
     */
    const extra = store as unknown as Record<string, Record<string, unknown>[]>;
    extra.payment_holds = holds;
    extra.payment_hold_dispositions = [];
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

async function receipt(supabase: ReturnType<typeof setup>["supabase"]) {
    const { payment } = await recordChildcarePayment(supabase, {
        orgId: ORG_ID,
        billableSourceType: "enrollment_agreement",
        billableSourceId: AGREEMENT_ID,
        customerId: HOUSEHOLD_ID,
        amountCents: RECEIPT_CENTS,
        paymentMethod: "cash",
        idempotencyKey: "pay-1",
    });
    return payment;
}

const hold = (paymentId: string, amountCents: number) => ({
    id: "hold-1", org_id: ORG_ID, payment_id: paymentId, amount_cents: amountCents,
    refundable: true, refundable_terms: {}, policy_id: null, reason: "Enrollment deposit",
    held_at: "2026-09-02T00:00:00.000Z", created_by: null, metadata: {},
});

describe("with a deposit held on the receipt", () => {
    /* One store, seeded so the hold exists before the receipt is applied. */
    async function withHold() {
        const s = setup();
        const payment = await receipt(s.supabase);
        (s.store as unknown as Record<string, Record<string, unknown>[]>).payment_holds.push(
            hold(payment.id, HELD_CENTS),
        );
        return { ...s, payment };
    }

    it("applies only the unrestricted money by default, not the whole receipt", async () => {
        const { supabase, payment } = await withHold();
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-1",
        });
        /* The charge wants 30,000 and the receipt holds 50,000 — but only 10,000 is free. */
        expect(allocation.allocated_amount_cents).toBe(APPLICABLE_CENTS);
        expect((await readChargeBalance(supabase, ORG_ID, "charge-1")).outstandingCents)
            .toBe(CHARGE_CENTS - APPLICABLE_CENTS);
    });

    it("refuses a named amount that would reach into the deposit, and says so", async () => {
        const { supabase, payment } = await withHold();
        await expect(
            applyPaymentToCharge(supabase, {
                orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-1",
                amountCents: APPLICABLE_CENTS + 1,
            }),
        ).rejects.toThrow(/held/i);
    });

    /*
     * THE CONTROL. Without it, "refuses" would also pass if applying had simply been broken. An
     * application that DISCHARGES the lot is the exception: it is bounded by the lot, not by what
     * is left unrestricted, and it is the only way held money may settle anything.
     */
    it("still lets an application that discharges the lot reach into it", async () => {
        const { supabase, payment } = await withHold();
        /*
         * The atomic RPC is a database function the mock has no answer for, so this asserts the
         * BOUND rather than the write: a discharging application must get past the ceiling that
         * refuses the ordinary one, and fail later for a reason that is not the ceiling.
         */
        let message = "";
        try {
            await applyPaymentToCharge(supabase, {
                orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-1",
                amountCents: APPLICABLE_CENTS + 1,
                disposeHoldId: "hold-1",
            });
        } catch (e) {
            message = e instanceof Error ? e.message : String(e);
        }
        /* It got past the ceiling: whatever stopped it, it was not "this money is held". */
        expect(message).not.toMatch(/held money|remain unapplied/i);
    });
});
