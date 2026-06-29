import { describe, expect, it } from "vitest";
import { draftConsumption, previewConsumption } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const AGREEMENT = "agr-1";
const RESOLUTION_KEY = `tpl:registration_fee:${TODAY}:${AGREEMENT}`;
const IDEMPOTENCY_KEY = `cev:enrollment.registration:child_enrollment_agreements:${AGREEMENT}:${TODAY}`;

function registrationTemplate(over: Record<string, unknown> = {}) {
    return {
        id: "tpl-1",
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

function globalEventType(over: Record<string, unknown> = {}) {
    return {
        id: "cet-global",
        org_id: null,
        event_key: "enrollment.registration",
        label: "Enrollment Registration",
        source_family: "agreement",
        description: null,
        charge_template_key: "registration_fee",
        default_responsibility_key: "household",
        is_active: true,
        effective_start: "2000-01-01",
        effective_end: null,
        metadata: {},
        ...over,
    };
}

function fact(over: Partial<OperationalFactDto> = {}): OperationalFactDto {
    return {
        eventKey: "enrollment.registration",
        sourceFamily: "agreement",
        sourceEntityType: "child_enrollment_agreements",
        sourceEntityId: AGREEMENT,
        subjectType: "customer_member",
        subjectId: "member-1",
        ...over,
    };
}

function setup(seed?: Partial<OperationalEnrollmentMockStore>) {
    const store = createOperationalEnrollmentMockStore({
        financial_charge_templates: [registrationTemplate()],
        consumption_event_types: [globalEventType()],
        ...seed,
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

describe("consumptionService — preview (writes nothing)", () => {
    it("resolves event type, matches the Commercial Model template, and previews an obligation", async () => {
        const { store, supabase } = setup();
        const r = await previewConsumption(supabase, ORG_ID, fact(), TODAY);

        expect(r.eventType).toMatchObject({ eventKey: "enrollment.registration", scope: "global" });
        expect(r.matchedCommercial).toMatchObject({ chargeTemplateKey: "registration_fee", chargeTemplateLabel: "Registration Fee" });
        expect(r.resolution.event.status).toBe("resolved");
        expect(r.resolution.obligations).toHaveLength(1);
        expect(r.resolution.obligations[0]).toMatchObject({ amountCents: 15000, occursOn: TODAY, billableOn: TODAY, resolutionKey: RESOLUTION_KEY });
        expect(r.chargePreview?.wouldWrite).toBe("create");

        // PREVIEW PERSISTS NOTHING
        expect(store.consumption_events).toHaveLength(0);
        expect(store.resolved_obligations).toHaveLength(0);
        expect(store.charges).toHaveLength(0);
    });

    it("throws not_found when the event type is not registered (org isolation)", async () => {
        // Event type only registered for a DIFFERENT org → invisible here, and no global row.
        const { supabase } = setup({ consumption_event_types: [globalEventType({ id: "cet-other", org_id: "org-2" })] });
        await expect(previewConsumption(supabase, ORG_ID, fact(), TODAY)).rejects.toMatchObject({ code: "not_found" });
    });

    it("produces NO obligation when the org has no template for the mapped key", async () => {
        const { store, supabase } = setup({ financial_charge_templates: [] });
        const r = await previewConsumption(supabase, ORG_ID, fact(), TODAY);
        expect(r.matchedCommercial).toBeNull();
        expect(r.resolution.obligations).toHaveLength(0);
        expect(r.resolution.event.status).toBe("no_obligation");
        expect(store.charges).toHaveLength(0);
    });

    it("prefers an org-specific event type override over the global registry row", async () => {
        const { supabase } = setup({
            consumption_event_types: [globalEventType(), globalEventType({ id: "cet-org", org_id: ORG_ID, label: "Org Registration" })],
        });
        const r = await previewConsumption(supabase, ORG_ID, fact(), TODAY);
        expect(r.eventType).toMatchObject({ scope: "org", label: "Org Registration" });
    });
});

describe("consumptionService — draft (persists only safe draft objects)", () => {
    it("persists consumption event + obligation + a draft charge, idempotently", async () => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, fact(), TODAY, "user-1");

        expect(store.consumption_events).toHaveLength(1);
        expect(store.consumption_events[0]).toMatchObject({ idempotency_key: IDEMPOTENCY_KEY, status: "resolved", event_key: "enrollment.registration" });
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.resolved_obligations[0]).toMatchObject({ status: "drafted", amount_cents: 15000, resolution_key: RESOLUTION_KEY });
        expect(store.charges).toHaveLength(1);
        expect(store.charges[0]).toMatchObject({ status: "draft", amount_cents: 15000, billable_source_id: AGREEMENT });

        // obligation links the draft charge
        expect(store.resolved_obligations[0].draft_charge_id).toBe((store.charges[0] as { id: string }).id);
        expect(r.persisted.draftChargeStatus).toBe("created");

        // RE-RUN → idempotent, no duplicates
        await draftConsumption(supabase, ORG_ID, fact(), TODAY, "user-1");
        expect(store.consumption_events).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.charges).toHaveLength(1);
    });

    it("never mutates a posted charge; leaves no draft_charge link", async () => {
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
        const r = await draftConsumption(supabase, ORG_ID, fact(), TODAY, "user-1");
        expect(r.persisted.draftChargeStatus).toBe("skipped_posted");
        expect(r.persisted.draftChargeId).toBeNull();
        // posted charge untouched, no new charge created
        expect(store.charges).toHaveLength(1);
        expect((store.charges[0] as { amount_cents: number }).amount_cents).toBe(99999);
        // obligation persisted as a preview (no draft link)
        expect(store.resolved_obligations[0]).toMatchObject({ status: "previewed", draft_charge_id: null });
    });

    it("persists the consumption event with no obligation when no template matches", async () => {
        const { store, supabase } = setup({ financial_charge_templates: [] });
        await draftConsumption(supabase, ORG_ID, fact(), TODAY, "user-1");
        expect(store.consumption_events).toHaveLength(1);
        expect(store.consumption_events[0].status).toBe("no_obligation");
        expect(store.resolved_obligations).toHaveLength(0);
        expect(store.charges).toHaveLength(0);
    });
});
