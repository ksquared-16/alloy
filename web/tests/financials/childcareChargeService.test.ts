import { describe, expect, it } from "vitest";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import {
    createChildcareCorrection,
    createChildcareDraftCharge,
    postChildcareCharge,
    recalculateDraftCharge,
    type ChargeRow,
} from "@/lib/financials/childcareChargeService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

const AGREEMENT_ID = "agr-1";

function setup(seedCharges: Record<string, unknown>[] = []) {
    const store = createOperationalEnrollmentMockStore({ charges: seedCharges });
    const supabase = createOperationalEnrollmentMockSupabase(store);
    return { store, supabase };
}

describe("childcareChargeService (P3.1)", () => {
    it("creates a draft childcare charge on the generic billable-source dimension (job_id NULL)", async () => {
        const { supabase } = setup();
        const charge = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 120000,
        });
        expect(charge.job_id).toBeNull();
        expect(charge.billable_source_type).toBe("enrollment_agreement");
        expect(charge.billable_source_id).toBe(AGREEMENT_ID);
        expect(charge.charge_category).toBe("tuition");
        expect(charge.status).toBe("draft");
        expect(charge.currency_code).toBe("USD");
    });

    it("recalculates a draft charge in place", async () => {
        const { supabase } = setup();
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 120000,
        });
        const updated = await recalculateDraftCharge(supabase, {
            orgId: ORG_ID,
            chargeId: draft.id,
            amountCents: 130000,
        });
        expect(updated.amount_cents).toBe(130000);
        expect(updated.status).toBe("draft");
    });

    it("blocks in-place recalculation once posted", async () => {
        const { supabase } = setup();
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 120000,
        });
        const posted = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
        expect(posted.status).toBe("posted");
        await expect(
            recalculateDraftCharge(supabase, { orgId: ORG_ID, chargeId: posted.id, amountCents: 1 })
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("corrects a posted charge via a NEW reversal row referencing source_charge_id", async () => {
        const { store, supabase } = setup();
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 130000,
        });
        const posted = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
        const reversal = await createChildcareCorrection(supabase, {
            orgId: ORG_ID,
            sourceChargeId: posted.id,
            kind: "reversal",
        });
        expect(reversal.id).not.toBe(posted.id);
        expect(reversal.source_charge_id).toBe(posted.id);
        expect(reversal.amount_cents).toBe(-130000);
        expect(reversal.billable_source_type).toBe("enrollment_agreement");
        // original row remains posted and untouched (two distinct rows in store)
        const rows = store.charges as ChargeRow[];
        expect(rows.length).toBe(2);
        const original = rows.find((r) => r.id === posted.id)!;
        expect(original.amount_cents).toBe(130000);
        expect(original.status).toBe("posted");
    });

    it("derives reversal amount and rejects an explicit amount for reversal", async () => {
        const { supabase } = setup();
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 100000,
        });
        const posted = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
        await expect(
            createChildcareCorrection(supabase, {
                orgId: ORG_ID,
                sourceChargeId: posted.id,
                kind: "reversal",
                amountCents: -5,
            })
        ).rejects.toBeInstanceOf(OperationalEnrollmentServiceError);
    });

    it("requires an explicit amount for credit/replacement corrections", async () => {
        const { supabase } = setup();
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 100000,
        });
        const posted = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
        await expect(
            createChildcareCorrection(supabase, { orgId: ORG_ID, sourceChargeId: posted.id, kind: "credit" })
        ).rejects.toMatchObject({ code: "invalid_input" });
        const credit = await createChildcareCorrection(supabase, {
            orgId: ORG_ID,
            sourceChargeId: posted.id,
            kind: "credit",
            amountCents: -2500,
        });
        expect(credit.amount_cents).toBe(-2500);
        expect(credit.source_charge_id).toBe(posted.id);
    });

    it("refuses to govern a job charge (no childcare regression onto job billing)", async () => {
        const { supabase } = setup([
            {
                id: "job-charge-1",
                org_id: ORG_ID,
                job_id: "job-1",
                billable_source_type: "job",
                billable_source_id: "job-1",
                charge_type: "service",
                charge_category: null,
                status: "posted",
                currency_code: "USD",
                amount_cents: 5000,
                source_charge_id: null,
                metadata: {},
            },
        ]);
        await expect(
            recalculateDraftCharge(supabase, { orgId: ORG_ID, chargeId: "job-charge-1", amountCents: 1 })
        ).rejects.toMatchObject({ code: "invalid_state" });
        await expect(
            createChildcareCorrection(supabase, { orgId: ORG_ID, sourceChargeId: "job-charge-1", kind: "reversal" })
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("rejects invalid charge_category and zero/non-integer amounts", async () => {
        const { supabase } = setup();
        await expect(
            createChildcareDraftCharge(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: AGREEMENT_ID,
                // @ts-expect-error invalid category on purpose
                chargeCategory: "nope",
                amountCents: 100,
            })
        ).rejects.toMatchObject({ code: "invalid_input" });
        await expect(
            createChildcareDraftCharge(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: AGREEMENT_ID,
                chargeCategory: "tuition",
                amountCents: 0,
            })
        ).rejects.toMatchObject({ code: "invalid_input" });
    });
});
