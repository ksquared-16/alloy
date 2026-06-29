import { describe, expect, it } from "vitest";
import {
    createChargeTemplate,
    createChargeTemplateVersion,
    listChargeTemplates,
    retireChargeTemplate,
    voidScheduledChargeTemplate,
} from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

const TODAY = "2026-06-29";

function setup() {
    const store = createOperationalEnrollmentMockStore();
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

const baseInput = {
    orgId: ORG_ID,
    templateKey: "registration_fee",
    label: "Registration Fee",
    chargeCategory: "fee",
    triggerType: "manual",
    amountStrategy: "fixed",
    amountCents: 15000,
    occursOnStrategy: "now",
    billableOnStrategy: "immediate",
    effectiveStart: "2026-01-01",
};

describe("chargeTemplateAuthoringService", () => {
    it("creates a fixed-amount template and lists it", async () => {
        const { store, supabase } = setup();
        const tpl = await createChargeTemplate(supabase, { ...baseInput, serviceId: "svc-1" });
        expect(tpl).toMatchObject({ template_key: "registration_fee", charge_category: "fee", amount_cents: 15000, service_id: "svc-1" });
        expect(store.financial_charge_templates).toHaveLength(1);
        expect(await listChargeTemplates(supabase, ORG_ID)).toHaveLength(1);
    });

    it("supersedes a template: closes prior, no in-place overwrite, links lineage", async () => {
        const { store, supabase } = setup();
        const tpl = await createChargeTemplate(supabase, baseInput);
        const versioned = await createChargeTemplateVersion(supabase, {
            ...baseInput,
            priorId: tpl.id,
            effectiveStart: "2027-01-01",
            amountCents: 18000,
        });
        expect(versioned.priorCloseDate).toBe("2026-12-31");
        expect(versioned.template.amount_cents).toBe(18000);
        expect(versioned.template.metadata.supersedes_id).toBe(tpl.id);
        // prior value unchanged, only effective_end closed (no in-place overwrite)
        const prior = store.financial_charge_templates.find((t) => t.id === tpl.id) as ChargeTemplateRow;
        expect(prior.amount_cents).toBe(15000);
        expect(prior.effective_end).toBe("2026-12-31");
        expect(prior.template_key).toBe(versioned.template.template_key);
    });

    it("retires (closes window) and voids a scheduled version (reopens predecessor)", async () => {
        const { store, supabase } = setup();
        const tpl = await createChargeTemplate(supabase, baseInput);
        const versioned = await createChargeTemplateVersion(supabase, { ...baseInput, priorId: tpl.id, effectiveStart: "2027-01-01", amountCents: 18000 });

        await retireChargeTemplate(supabase, { orgId: ORG_ID, id: versioned.template.id, effectiveEnd: "2030-12-31", todayYmd: TODAY });
        expect((store.financial_charge_templates.find((t) => t.id === versioned.template.id) as ChargeTemplateRow).effective_end).toBe("2030-12-31");

        const voided = await voidScheduledChargeTemplate(supabase, { orgId: ORG_ID, id: versioned.template.id, todayYmd: TODAY });
        expect(voided.reopenedPriorId).toBe(tpl.id);
        expect(store.financial_charge_templates.find((t) => t.id === versioned.template.id)).toBeUndefined();
        expect((store.financial_charge_templates.find((t) => t.id === tpl.id) as ChargeTemplateRow).effective_end).toBeNull();
    });

    it("validates charge category, amount shape, and offset shape", async () => {
        const { supabase } = setup();
        await expect(createChargeTemplate(supabase, { ...baseInput, chargeCategory: "nonsense" })).rejects.toMatchObject({ code: "invalid_input" });
        // fixed requires an amount
        await expect(createChargeTemplate(supabase, { ...baseInput, amountCents: null })).rejects.toMatchObject({ code: "invalid_input" });
        // offset_days requires an offset
        await expect(
            createChargeTemplate(supabase, { ...baseInput, billableOnStrategy: "offset_days", billableOffsetDays: null }),
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("allows non-fixed strategies without an amount (usage-derived)", async () => {
        const { supabase } = setup();
        const tpl = await createChargeTemplate(supabase, {
            orgId: ORG_ID,
            templateKey: "diapers",
            label: "Diapers",
            chargeCategory: "consumable_fee",
            triggerType: "schedule",
            amountStrategy: "usage_derived",
            occursOnStrategy: "service_period_start",
            billableOnStrategy: "next_billing_cycle",
            effectiveStart: "2026-01-01",
        });
        expect(tpl.amount_cents).toBeNull();
        expect(tpl.amount_strategy).toBe("usage_derived");
    });

    it("refuses to void an already-effective version", async () => {
        const { supabase } = setup();
        const tpl = await createChargeTemplate(supabase, baseInput);
        await expect(voidScheduledChargeTemplate(supabase, { orgId: ORG_ID, id: tpl.id, todayYmd: TODAY })).rejects.toMatchObject({
            code: "invalid_state",
        });
    });
});
