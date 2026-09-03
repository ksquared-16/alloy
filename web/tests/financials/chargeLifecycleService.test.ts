import { describe, expect, it } from "vitest";
import {
    previewTemplateCharge,
    writeTemplateDraftCharge,
} from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const AGREEMENT = "agr-1";
const TEMPLATE_ID = "tpl-1";

function fixedTemplate(over: Record<string, unknown> = {}) {
    return {
        id: TEMPLATE_ID,
        org_id: ORG_ID,
        service_id: "svc-1",
        template_key: "registration_fee",
        label: "Registration Fee",
        charge_category: "fee",
        trigger_type: "manual",
        amount_strategy: "fixed",
        amount_cents: 15000,
        currency_code: "USD",
        occurs_on_strategy: "now",
        billable_on_strategy: "immediate",
        billable_offset_days: null,
        default_gl_mapping_key: "fee_revenue",
        default_responsibility_key: "household",
        review_required: false,
        is_active: true,
        effective_start: "2026-01-01",
        effective_end: null,
        metadata: {},
        ...over,
    };
}

function setup(seed?: Partial<OperationalEnrollmentMockStore>) {
    const store = createOperationalEnrollmentMockStore({ financial_charge_templates: [fixedTemplate()], ...seed });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

const RESOLUTION_KEY = `tpl:registration_fee:${TODAY}:${AGREEMENT}`;

describe("chargeLifecycleService — preview", () => {
    it("previews a draft intent and reports it would create a draft (with an agreement)", async () => {
        const { supabase } = setup();
        const r = await previewTemplateCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        expect(r.intent).toMatchObject({ eligible: true, amountCents: 15000, occursOn: TODAY, billableOn: TODAY, lifecycleStatus: "draft" });
        expect(r.wouldWrite).toBe("create");
        expect(r.intent.resolutionKey).toBe(RESOLUTION_KEY);
    });

    it("is preview-only (not writable) without an agreement", async () => {
        const { supabase } = setup();
        const r = await previewTemplateCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, today: TODAY });
        expect(r.wouldWrite).toBe("not_writable");
    });

    it("consumes a posting_review policy", async () => {
        const { supabase } = setup({
            financial_policies: [
                { id: "pol-1", org_id: ORG_ID, scope_type: "org", policy_type: "posting_review", value: { required: true }, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} },
            ],
        });
        const r = await previewTemplateCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        expect(r.intent.reviewRequired).toBe(true);
    });
});

/*
 * A HOUSEHOLD charge is a real charge, so it gets real idempotency.
 *
 * The dedupe lookup was hardcoded to `enrollment_agreement` and only ran when the caller had an
 * agreement, and the resolution key fell back to the literal `"org"` for anything else. Two
 * submissions of one family's registration fee therefore wrote two drafts — and two DIFFERENT
 * families' fees shared a key. Both are duplicate-money defects; neither is visible from the
 * enrolment path.
 */
describe("chargeLifecycleService — a household (customer) source is deduped like any other", () => {
    const HOUSEHOLD = { type: "customer" as const, id: "cust-1" };

    it("scopes the resolution key to the billable source, not to the literal 'org'", async () => {
        const { supabase } = setup();
        const r = await previewTemplateCharge(supabase, ORG_ID, {
            templateId: TEMPLATE_ID,
            billableSource: HOUSEHOLD,
            today: TODAY,
        });
        expect(r.intent.resolutionKey).toBe(`tpl:registration_fee:${TODAY}:cust-1`);
        expect(r.wouldWrite).toBe("create");
    });

    it("writes ONE draft for a repeated household submission", async () => {
        const { store, supabase } = setup();
        const first = await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: TEMPLATE_ID,
            billableSource: HOUSEHOLD,
            today: TODAY,
        });
        const second = await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: TEMPLATE_ID,
            billableSource: HOUSEHOLD,
            today: TODAY,
        });
        expect(first.status).toBe("created");
        expect(second.status).toBe("unchanged");
        expect((store.charges as Array<Record<string, unknown>>).length).toBe(1);
        expect((store.charges as Array<Record<string, unknown>>)[0]!.billable_source_type).toBe("customer");
    });

    it("does not collide two households on the same template and day", async () => {
        const { store, supabase } = setup();
        await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: TEMPLATE_ID,
            billableSource: HOUSEHOLD,
            today: TODAY,
        });
        const other = await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: TEMPLATE_ID,
            billableSource: { type: "customer", id: "cust-2" },
            today: TODAY,
        });
        expect(other.status).toBe("created");
        expect((store.charges as Array<Record<string, unknown>>).length).toBe(2);
    });
});

describe("chargeLifecycleService — idempotent draft write", () => {
    it("creates a draft once, is unchanged on re-run, links template + occurs/billable", async () => {
        const { store, supabase } = setup();
        const created = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        expect(created.status).toBe("created");
        expect(store.charges).toHaveLength(1);
        const row = store.charges[0] as Record<string, unknown>;
        expect(row).toMatchObject({ status: "draft", amount_cents: 15000, charge_template_id: TEMPLATE_ID, occurs_on: TODAY, billable_on: TODAY, billable_source_id: AGREEMENT });
        expect((row.metadata as { resolution_key?: string }).resolution_key).toBe(RESOLUTION_KEY);

        // re-run → idempotent, no duplicate
        const again = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        expect(again.status).toBe("unchanged");
        expect(store.charges).toHaveLength(1);
    });

    it("recalculates an existing draft when the template amount changes (no duplicate)", async () => {
        const { store, supabase } = setup();
        await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        // change the template amount, then re-run
        (store.financial_charge_templates[0] as Record<string, unknown>).amount_cents = 16000;
        const recalc = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        expect(recalc.status).toBe("recalculated");
        expect(store.charges).toHaveLength(1);
        expect((store.charges[0] as Record<string, unknown>).amount_cents).toBe(16000);
    });

    it("never mutates a posted charge (skipped_posted)", async () => {
        const { store, supabase } = setup({
            charges: [
                {
                    id: "chg-posted",
                    org_id: ORG_ID,
                    billable_source_type: "enrollment_agreement",
                    billable_source_id: AGREEMENT,
                    status: "posted",
                    amount_cents: 99999,
                    metadata: { resolution_key: RESOLUTION_KEY },
                },
            ],
        });
        const r = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        expect(r.status).toBe("skipped_posted");
        // posted charge untouched
        expect((store.charges[0] as Record<string, unknown>).amount_cents).toBe(99999);
        expect(store.charges).toHaveLength(1);
    });

    it("refuses to write without an agreement, and never writes non-fixed (unresolvable) amounts", async () => {
        const { store, supabase } = setup({ financial_charge_templates: [fixedTemplate({ amount_strategy: "attendance_derived", amount_cents: null })] });
        await expect(writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, today: TODAY })).rejects.toMatchObject({ code: "invalid_input" });
        const r = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE_ID, agreementId: AGREEMENT, today: TODAY });
        expect(r.status).toBe("not_writable");
        expect(store.charges).toHaveLength(0);
    });
});
