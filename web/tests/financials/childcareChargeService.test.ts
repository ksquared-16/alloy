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
        const { charge: posted } = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
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
        const { charge: posted } = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
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
        const { charge: posted } = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
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
        const { charge: posted } = await postChildcareCharge(supabase, { orgId: ORG_ID, chargeId: draft.id });
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

    /*
     * The guarantees that protect an enrolment charge protect a HOUSEHOLD charge too. `customer` was
     * admitted as a billable source so a family can be charged before anyone is enrolled; the service
     * still tested the `enrollment_agreement` literal, so those charges could be created and then
     * neither posted nor corrected.
     */
    it("posts and corrects a HOUSEHOLD (customer-source) charge, not only an enrolment one", async () => {
        const { supabase } = setup([
            {
                id: "household-charge-1",
                org_id: ORG_ID,
                job_id: null,
                billable_source_type: "customer",
                billable_source_id: "cust-1",
                charge_type: "fee",
                charge_category: "one_time",
                status: "draft",
                currency_code: "USD",
                amount_cents: 7500,
                source_charge_id: null,
                metadata: {},
            },
        ]);
        const { charge: posted, alreadyPosted } = await postChildcareCharge(supabase, {
            orgId: ORG_ID,
            chargeId: "household-charge-1",
            actorUserId: "user-9",
        });
        expect(alreadyPosted).toBe(false);
        expect(posted.status).toBe("posted");
        expect(posted.posted_by).toBe("user-9");
        expect(posted.posted_at).toBeTruthy();

        const reversal = await createChildcareCorrection(supabase, {
            orgId: ORG_ID,
            sourceChargeId: posted.id,
            kind: "reversal",
            actorUserId: "user-9",
        });
        // The correction stays on the HOUSEHOLD; it is never re-pinned onto an agreement.
        expect(reversal.billable_source_type).toBe("customer");
        expect(reversal.billable_source_id).toBe("cust-1");
        expect(reversal.amount_cents).toBe(-7500);
        expect(reversal.source_charge_id).toBe(posted.id);
        expect(reversal.posted_by).toBe("user-9");
    });

    it("posting is idempotent: a retry reports the existing posting and writes nothing", async () => {
        const { store, supabase } = setup();
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 110000,
            actorUserId: "user-1",
        });
        expect(draft.created_by).toBe("user-1");

        const first = await postChildcareCharge(supabase, {
            orgId: ORG_ID,
            chargeId: draft.id,
            actorUserId: "user-1",
        });
        const second = await postChildcareCharge(supabase, {
            orgId: ORG_ID,
            chargeId: draft.id,
            actorUserId: "user-2",
        });
        expect(first.alreadyPosted).toBe(false);
        expect(second.alreadyPosted).toBe(true);
        // The second call must not re-stamp the posting: the first actor is the one who posted it.
        expect(second.charge.posted_at).toBe(first.charge.posted_at);
        expect(second.charge.posted_by).toBe("user-1");
        // And it must not have produced a second row.
        expect((store.charges as ChargeRow[]).length).toBe(1);
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
