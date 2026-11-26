/**
 * THE CHOOSER, AND WHY IT IS NOT THE BOUNDARY.
 *
 * `resolveEligibleTargetCharges` decides what an operator is OFFERED when moving money. The refusal
 * that matters lives in `applyPaymentToCharge`, which rejects another household's charge whether or
 * not this function ever mentioned it. So these tests assert two different things: that the offer is
 * useful and correctly scoped, and — in the last test — that omitting a charge here is not what keeps
 * a forged target out.
 */
import { describe, expect, it } from "vitest";

import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import { applyPaymentToCharge, recordChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { resolveEligibleTargetCharges } from "@/lib/financials/eligibleTargetCharges";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";

const HOUSEHOLD_A = "cust-A";
const HOUSEHOLD_B = "cust-B";
const AGREEMENT_A = "agr-A";
const AGREEMENT_B = "agr-B";

function charge(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "charge-A1",
        org_id: ORG_ID,
        job_id: null,
        billable_source_type: "enrollment_agreement",
        billable_source_id: AGREEMENT_A,
        source_charge_id: null,
        charge_type: "service",
        charge_category: "tuition",
        description: "September Tuition",
        service_date: "2026-09-01",
        status: "posted",
        currency_code: "USD",
        amount_cents: 100_000,
        posted_at: "2026-09-01T00:00:00.000Z",
        metadata: {},
        ...over,
    };
}

function setup(
    charges: Record<string, unknown>[],
    financial_charge_templates: Record<string, unknown>[] = [],
) {
    const store = createOperationalEnrollmentMockStore({
        charges,
        financial_charge_templates,
        child_enrollment_agreements: [
            { id: AGREEMENT_A, org_id: ORG_ID, customer_id: HOUSEHOLD_A, customer_member_id: "m-A" },
            { id: AGREEMENT_B, org_id: ORG_ID, customer_id: HOUSEHOLD_B, customer_member_id: "m-B" },
        ],
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

async function householdAPayment(supabase: ReturnType<typeof createOperationalEnrollmentMockSupabase>) {
    const { payment } = await recordChildcarePayment(supabase, {
        orgId: ORG_ID,
        billableSourceType: "customer",
        billableSourceId: HOUSEHOLD_A,
        amountCents: 50_000,
        paymentMethod: "check",
    });
    return payment;
}

describe("eligible target charges", () => {
    it("offers this household's outstanding charges, newest service date first", async () => {
        const { supabase } = setup([
            charge(),
            charge({ id: "charge-A2", description: "October Tuition", service_date: "2026-10-01" }),
        ]);
        const payment = await householdAPayment(supabase);
        const targets = await resolveEligibleTargetCharges(supabase, {
            orgId: ORG_ID,
            paymentId: payment.id,
        });
        expect(targets.map((t) => t.chargeId)).toEqual(["charge-A2", "charge-A1"]);
        expect(targets[0]).toMatchObject({ label: "October Tuition", outstandingCents: 100_000 });
    });

    /* The household boundary, as an offer. A household payment may answer a child's agreement charge. */
    it("never offers another household's charge", async () => {
        const { supabase } = setup([
            charge(),
            charge({ id: "charge-B1", billable_source_id: AGREEMENT_B, description: "B Tuition" }),
        ]);
        const payment = await householdAPayment(supabase);
        const targets = await resolveEligibleTargetCharges(supabase, {
            orgId: ORG_ID,
            paymentId: payment.id,
        });
        expect(targets.map((t) => t.chargeId)).toEqual(["charge-A1"]);
    });

    it("drops a charge that is already settled — money cannot go where nothing is owed", async () => {
        const { supabase } = setup([charge({ amount_cents: 20_000 })]);
        const payment = await householdAPayment(supabase);
        await applyPaymentToCharge(supabase, {
            orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-A1", amountCents: 20_000,
        });
        const targets = await resolveEligibleTargetCharges(supabase, {
            orgId: ORG_ID, paymentId: payment.id,
        });
        expect(targets).toEqual([]);
    });

    it("can exclude the charge the money is being moved off", async () => {
        const { supabase } = setup([
            charge(),
            charge({ id: "charge-A2", description: "October Tuition", service_date: "2026-10-01" }),
        ]);
        const payment = await householdAPayment(supabase);
        const targets = await resolveEligibleTargetCharges(supabase, {
            orgId: ORG_ID, paymentId: payment.id, excludeChargeIds: ["charge-A2"],
        });
        expect(targets.map((t) => t.chargeId)).toEqual(["charge-A1"]);
    });

    /*
     * THE POINT OF THE WHOLE FILE. The chooser omitting a charge is a courtesy; the service refusing
     * it is the rule. If this ever passes because the chooser filtered it, the security story is
     * wrong — so it asks the service directly, exactly as a forged request would.
     */
    it("is a courtesy, not a boundary: the service still refuses a target it never offered", async () => {
        const { supabase } = setup([
            charge(),
            charge({ id: "charge-B1", billable_source_id: AGREEMENT_B, description: "B Tuition" }),
        ]);
        const payment = await householdAPayment(supabase);
        const offered = await resolveEligibleTargetCharges(supabase, {
            orgId: ORG_ID, paymentId: payment.id,
        });
        expect(offered.map((t) => t.chargeId), "never offered").not.toContain("charge-B1");
        await expect(
            applyPaymentToCharge(supabase, {
                orgId: ORG_ID, paymentId: payment.id, chargeId: "charge-B1", amountCents: 10_000,
            }),
        ).rejects.toThrow(/different household/i);
    });

    /*
     * A template-created charge carries no description, so the label falls back to the stored
     * category. That value is a KEY. Mounted certification found the chooser showing
     * `registration_fee` to the operator deciding where money goes.
     */
    it("never puts a stored category key in front of the operator", async () => {
        const { supabase } = setup([
            charge({ id: "charge-known", description: null, charge_category: "late_pickup" }),
            // The category actually stored on the charge that exposed this is NOT in the vocabulary.
            charge({ id: "charge-unknown", description: null, charge_category: "registration_fee",
                     service_date: "2026-08-28" }),
        ]);
        const payment = await householdAPayment(supabase);
        const targets = await resolveEligibleTargetCharges(supabase, { orgId: ORG_ID, paymentId: payment.id });
        const label = (id: string) => targets.find((t) => t.chargeId === id)!.label;
        expect(label("charge-known"), "a known category reads as its declared label")
            .toBe(chargeCategoryLabel("late_pickup"));
        expect(label("charge-unknown"), "an unknown one is still not a key").not.toBe("registration_fee");
        expect(label("charge-unknown")).toBe("Registration fee");
    });

    /*
     * `writeTemplateDraftCharge` stores the TEMPLATE KEY as a charge's description, so the stored
     * description of a template-created charge is `registration_fee`. The card's read model resolves
     * the tenant's configured label; this proves the chooser resolves the same one, because a
     * mounted Move offered `registration_fee` as a destination while the card beside it said
     * "Registration fee" for the very same charge.
     */
    it("names a template-created charge the way the tenant named the template", async () => {
        const { supabase } = setup(
            [charge({ id: "charge-T", charge_template_id: "tpl-1", description: "registration_fee" })],
            [{ id: "tpl-1", org_id: ORG_ID, label: "Registration fee" }],
        );
        const payment = await householdAPayment(supabase);
        const targets = await resolveEligibleTargetCharges(supabase, { orgId: ORG_ID, paymentId: payment.id });
        expect(targets).toHaveLength(1);
        expect(targets[0].label, "the stored template key must not reach the chooser")
            .not.toBe("registration_fee");
        expect(targets[0].label).toBe("Registration fee");
    });
});
