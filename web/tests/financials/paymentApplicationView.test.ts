/**
 * THE VIEW COMPOSES; IT DOES NOT DECIDE.
 *
 * Every money figure an operator reads before moving a payment has to be the same number the balance
 * readers use. These pin that: the view's totals track the canonical readers as money is applied,
 * reversed and re-applied, and reversed applications appear as history without counting as paid.
 */
import { describe, expect, it } from "vitest";

import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import {
    applyPaymentToCharge,
    recordChildcarePayment,
    readPaymentUnappliedCents,
    reversePaymentApplication,
} from "@/lib/financials/childcarePaymentService";
import { resolveHouseholdPaymentViews } from "@/lib/financials/paymentApplicationView";

const HOUSEHOLD_A = "cust-A";
const HOUSEHOLD_B = "cust-B";
const AGREEMENT_A = "agr-A";
const AGREEMENT_B = "agr-B";

function charge(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "charge-A1", org_id: ORG_ID, job_id: null,
        billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT_A,
        source_charge_id: null, charge_type: "service", charge_category: "tuition",
        description: "September Tuition", service_date: "2026-09-01",
        status: "posted", currency_code: "USD", amount_cents: 100_000,
        posted_at: "2026-09-01T00:00:00.000Z", metadata: {},
        ...over,
    };
}

function setup() {
    const store = createOperationalEnrollmentMockStore({
        charges: [
            charge(),
            charge({ id: "charge-A2", description: "October Tuition", service_date: "2026-10-01" }),
            charge({ id: "charge-B1", billable_source_id: AGREEMENT_B, description: "B Tuition" }),
        ],
        child_enrollment_agreements: [
            { id: AGREEMENT_A, org_id: ORG_ID, customer_id: HOUSEHOLD_A, customer_member_id: "m-A" },
            { id: AGREEMENT_B, org_id: ORG_ID, customer_id: HOUSEHOLD_B, customer_member_id: "m-B" },
        ],
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

async function pay(supabase: ReturnType<typeof createOperationalEnrollmentMockSupabase>, amountCents: number) {
    const { payment } = await recordChildcarePayment(supabase, {
        orgId: ORG_ID,
        billableSourceType: "customer",
        billableSourceId: HOUSEHOLD_A,
        customerId: HOUSEHOLD_A,
        amountCents,
        paymentMethod: "card",
    });
    return payment;
}

const viewFor = async (supabase: ReturnType<typeof createOperationalEnrollmentMockSupabase>, id: string) =>
    (await resolveHouseholdPaymentViews(supabase, { orgId: ORG_ID, customerId: HOUSEHOLD_A })).find(
        (v) => v.paymentId === id,
    )!;

describe("the payment application view", () => {
    it("shows the receipt, the payer, and where the money went", async () => {
        const { supabase } = setup();
        const payment = await pay(supabase, 50_000);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-A1", amountCents: 30_000,
        });
        const view = await viewFor(supabase, payment.id);
        expect(view).toMatchObject({
            amountCents: 50_000,
            /*
             * The canonical payer is the household id; the NAME is a lookup on `customers`, which this
             * mock does not model at all — so `payerLabel` is null here and the label is proven where a
             * real database can answer it. Asserting a name the fixture cannot produce would only prove
             * the fixture.
             */
            payerCustomerId: HOUSEHOLD_A,
            paymentMethod: "card",
            refundedCents: 0,
            activeAppliedCents: 30_000,
            unappliedCents: 20_000,
        });
        expect(view.applications).toHaveLength(1);
        expect(view.applications[0]).toMatchObject({
            chargeLabel: "September Tuition",
            appliedCents: 30_000,
            status: "active",
        });
    });

    /* PART 3: the totals are the canonical readers', not a second count. */
    it("keeps its totals equal to the canonical unapplied reader at every step", async () => {
        const { supabase } = setup();
        const payment = await pay(supabase, 50_000);
        const check = async () => {
            const view = await viewFor(supabase, payment.id);
            const canonical = await readPaymentUnappliedCents(supabase, ORG_ID, payment.id, 50_000);
            expect(view.unappliedCents).toBe(canonical);
            expect(view.activeAppliedCents).toBe(50_000 - canonical - view.refundedCents);
        };
        await check();
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-A1", amountCents: 50_000,
        });
        await check();
        await reversePaymentApplication(supabase, {
            orgId: ORG_ID, allocationId: allocation.id, reason: "wrong charge",
        });
        await check();
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-A2", amountCents: 50_000,
        });
        await check();
    });

    /* PART 14: the sequence an operator has to be able to read afterwards. */
    it("keeps the reversed application as history without counting it as paid", async () => {
        const { supabase } = setup();
        const payment = await pay(supabase, 50_000);
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-A1", amountCents: 50_000,
        });
        await reversePaymentApplication(supabase, {
            orgId: ORG_ID, allocationId: allocation.id, reason: "applied to wrong charge",
        });
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-A2", amountCents: 50_000,
        });

        const view = await viewFor(supabase, payment.id);
        expect(view.activeAppliedCents, "only the new application counts").toBe(50_000);
        expect(view.unappliedCents).toBe(0);
        const byCharge = Object.fromEntries(view.applications.map((a) => [a.chargeId, a]));
        expect(byCharge["charge-A1"]).toMatchObject({
            status: "reversed",
            appliedCents: 50_000,
            reversalReason: "applied to wrong charge",
        });
        expect(byCharge["charge-A1"]!.reversedAt).toBeTruthy();
        expect(byCharge["charge-A2"]).toMatchObject({ status: "active", appliedCents: 50_000 });
    });

    it("shows only this household's receipts", async () => {
        const { supabase } = setup();
        await pay(supabase, 10_000);
        await recordChildcarePayment(supabase, {
            orgId: ORG_ID,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGREEMENT_B,
            amountCents: 90_000,
            paymentMethod: "check",
        });
        const views = await resolveHouseholdPaymentViews(supabase, {
            orgId: ORG_ID, customerId: HOUSEHOLD_A,
        });
        expect(views).toHaveLength(1);
        expect(views[0]!.amountCents).toBe(10_000);
    });
});
