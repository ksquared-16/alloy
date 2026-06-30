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
const PERIOD = "2026-06-01"; // firstOfMonth(TODAY)
const AGREEMENT = "agr-1";
const SITE = "site-1";

function tuitionTemplate() {
    return {
        id: "tpl-tuition", org_id: ORG_ID, service_id: "svc-ft", template_key: "tuition", label: "Recurring Tuition",
        charge_category: "tuition", trigger_type: "schedule", amount_strategy: "rate_derived", amount_cents: null,
        currency_code: "USD", occurs_on_strategy: "service_period_start", billable_on_strategy: "next_billing_cycle",
        billable_offset_days: null, default_gl_mapping_key: "tuition_revenue", default_responsibility_key: "household",
        review_required: false, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
    };
}
function dropInTemplate() {
    return {
        id: "tpl-dropin", org_id: ORG_ID, service_id: "svc-ft", template_key: "drop_in", label: "Drop-In Day",
        charge_category: "tuition", trigger_type: "schedule", amount_strategy: "rate_derived", amount_cents: null,
        currency_code: "USD", occurs_on_strategy: "event_date", billable_on_strategy: "immediate",
        billable_offset_days: null, default_gl_mapping_key: "tuition_revenue", default_responsibility_key: "household",
        review_required: false, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
    };
}
function ratePlan() {
    return {
        id: "plan-1", org_id: ORG_ID, scope_type: "org", site_location_id: null, program_category_id: null,
        room_location_id: null, age_group_key: null, plan_key: "standard_tuition", service_id: "svc-ft",
        label: "Standard Tuition", currency_code: "USD", billing_basis: "monthly", calculation_strategy: "scheduled",
        proration_method: null, billing_cadence: null, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
    };
}
function rateRules() {
    return [
        { id: "rule-3", org_id: ORG_ID, rate_plan_id: "plan-1", schedule_basis: "three_day", rate_basis: "monthly", age_group_key: null, amount_cents: 82000, effective_start: "2026-01-01", effective_end: null, metadata: {} },
        { id: "rule-di", org_id: ORG_ID, rate_plan_id: "plan-1", schedule_basis: "drop_in", rate_basis: "daily", age_group_key: null, amount_cents: 9000, effective_start: "2026-01-01", effective_end: null, metadata: {} },
    ];
}
function eventTypes() {
    const base = { org_id: null, label: "x", source_family: "schedule", description: null, default_responsibility_key: "household", is_active: true, effective_start: "2000-01-01", effective_end: null, metadata: {} };
    return [
        { ...base, id: "cet-rt", event_key: "schedule.recurring_tuition", charge_template_key: "tuition" },
        { ...base, id: "cet-pr", event_key: "schedule.proration", charge_template_key: "tuition" },
        { ...base, id: "cet-di", event_key: "schedule.drop_in", charge_template_key: "drop_in" },
        { ...base, id: "cet-ed", event_key: "schedule.extra_day", charge_template_key: "drop_in" },
    ];
}
function agreement() {
    return { id: AGREEMENT, org_id: ORG_ID, site_location_id: SITE, status: "active", start_date: "2026-01-01", customer_member_id: "mem-1" };
}
function policies(extra: Record<string, unknown>[] = []) {
    return [
        { id: "pol-pror", org_id: ORG_ID, scope_type: "org", policy_type: "proration", value: { method: "daily" }, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} },
        { id: "pol-cad", org_id: ORG_ID, scope_type: "org", policy_type: "billing_cadence", value: { cadence: "monthly" }, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} },
        { id: "pol-rev", org_id: ORG_ID, scope_type: "org", policy_type: "posting_review", value: { required: false }, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} },
        ...extra,
    ];
}

function setup(over?: Partial<OperationalEnrollmentMockStore>) {
    const store = createOperationalEnrollmentMockStore({
        financial_charge_templates: [tuitionTemplate(), dropInTemplate()],
        childcare_rate_plans: [ratePlan()],
        childcare_rate_rules: rateRules(),
        consumption_event_types: eventTypes(),
        child_enrollment_agreements: [agreement()],
        financial_policies: policies(),
        ...over,
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

function scheduleFact(over: Partial<OperationalFactDto>): OperationalFactDto {
    return {
        eventKey: "",
        sourceFamily: "schedule",
        sourceEntityType: "child_enrollment_agreements",
        sourceEntityId: AGREEMENT,
        subjectType: "customer_member",
        subjectId: "mem-1",
        ...over,
    };
}

describe("schedule consumption — milestone: active agreement + MWF → recurring tuition", () => {
    it("resolves Service→Rate Plan→Rate Rule→Charge Template→Obligation and previews a draft charge", async () => {
        const { store, supabase } = setup();
        const r = await previewConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "recurring", scheduleBasis: "three_day" }), TODAY);

        expect(r.resolution.event.status).toBe("resolved");
        expect(r.resolution.obligations).toHaveLength(1);
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "recurring_tuition", amountCents: 82000, occursOn: PERIOD, billableOn: "2026-07-01", draftable: true });
        // Commercial objects consulted (rate plan + rate rule + charge template)
        const kinds = (r.commercialObjectsUsed ?? []).map((c) => c.kind);
        expect(kinds).toContain("rate_plan");
        expect(kinds).toContain("rate_rule");
        expect(kinds).toContain("charge_template");
        // Policies surfaced
        expect((r.policiesApplied ?? []).map((p) => p.policyType)).toEqual(expect.arrayContaining(["proration", "billing_cadence", "posting_review"]));
        // PREVIEW PERSISTS NOTHING
        expect(store.consumption_events).toHaveLength(0);
        expect(store.resolved_obligations).toHaveLength(0);
        expect(store.charges).toHaveLength(0);
    });

    it("derives three_day from MWF weekdays when basis is not supplied", async () => {
        const { supabase } = setup();
        const r = await previewConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "recurring", weekdays: [1, 3, 5] }), TODAY);
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "recurring_tuition", amountCents: 82000 });
    });

    it("draft persists consumption event + obligation + ONE draft charge, idempotently", async () => {
        const { store, supabase } = setup();
        const fact = scheduleFact({ scheduleChangeKind: "recurring", scheduleBasis: "three_day" });
        await draftConsumption(supabase, ORG_ID, fact, TODAY, "user-1");
        expect(store.consumption_events).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.resolved_obligations[0]).toMatchObject({ obligation_kind: "recurring_tuition", status: "drafted", amount_cents: 82000, period_start: PERIOD });
        expect(store.charges).toHaveLength(1);
        expect(store.charges[0]).toMatchObject({ status: "draft", amount_cents: 82000, charge_template_id: "tpl-tuition" });
        expect(store.resolved_obligations[0].draft_charge_id).toBe((store.charges[0] as { id: string }).id);

        // re-run same period → idempotent, no duplicates
        await draftConsumption(supabase, ORG_ID, fact, TODAY, "user-1");
        expect(store.consumption_events).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.charges).toHaveLength(1);

        // a DIFFERENT service period → a new obligation + new charge (recurrence is period-scoped)
        await draftConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "recurring", scheduleBasis: "three_day", periodStart: "2026-07-01" }), TODAY, "user-1");
        expect(store.resolved_obligations).toHaveLength(2);
        expect(store.charges).toHaveLength(2);
    });

    it("never mutates a posted charge for the period (skipped_posted, no draft link)", async () => {
        const { store, supabase } = setup({
            charges: [
                { id: "chg-posted", org_id: ORG_ID, billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT, status: "posted", amount_cents: 99999, metadata: { resolution_key: `tpl:tuition:${PERIOD}:${AGREEMENT}` } },
            ],
        });
        const r = await draftConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "recurring", scheduleBasis: "three_day" }), TODAY, "user-1");
        expect(r.persisted.obligations[0].draftChargeStatus).toBe("skipped_posted");
        expect(store.charges).toHaveLength(1);
        expect((store.charges[0] as { amount_cents: number }).amount_cents).toBe(99999);
        expect(store.resolved_obligations[0]).toMatchObject({ status: "previewed", draft_charge_id: null });
    });
});

describe("schedule consumption — other scenarios", () => {
    it("extra day → drop-in-rate obligation + draft charge (9000)", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "extra_day", eventDate: "2026-06-18" }), TODAY, "user-1");
        expect(store.resolved_obligations[0]).toMatchObject({ obligation_kind: "extra_day", amount_cents: 9000, status: "drafted" });
        expect(store.charges[0]).toMatchObject({ status: "draft", amount_cents: 9000, charge_template_id: "tpl-dropin" });
    });

    it("temporary schedule → proration obligation (preview only, NO draft charge)", async () => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "temporary", scheduleBasis: "three_day", proratedDays: 10, periodDays: 22 }), TODAY, "user-1");
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "proration", draftable: false, amountCents: Math.round((82000 * 10) / 22) });
        expect(store.resolved_obligations[0]).toMatchObject({ obligation_kind: "proration", status: "previewed", draft_charge_id: null });
        expect(store.charges).toHaveLength(0); // proration does not draft a charge in Slice 2
    });

    it("schedule replacement → TWO obligations: a proration credit (preview) + replacement tuition (draft)", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "replacement", scheduleBasis: "three_day", priorScheduleBasis: "five_day", proratedDays: 8, periodDays: 22 }), TODAY, "user-1");
        const kinds = store.resolved_obligations.map((o) => (o as { obligation_kind: string }).obligation_kind).sort();
        expect(kinds).toEqual(["proration_credit", "recurring_tuition"]);
        // only the replacement tuition drafts a charge
        expect(store.charges).toHaveLength(1);
        expect(store.charges[0]).toMatchObject({ amount_cents: 82000 });
    });

    it.each(["holiday_override", "exception", "no_op"] as const)("%s → no obligation, event no_obligation, no charges", async (kind) => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: kind }), TODAY, "user-1");
        expect(r.resolution.event.status).toBe("no_obligation");
        expect(r.interpretation?.noImpactReason).toBeTruthy();
        expect(store.consumption_events).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(0);
        expect(store.charges).toHaveLength(0);
    });

    it("recurring with a basis that has no rate rule → obligation resolves to no_charge (no duplicate, no charge)", async () => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, scheduleFact({ scheduleChangeKind: "recurring", scheduleBasis: "four_day" }), TODAY, "user-1");
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "recurring_tuition", status: "no_charge", amountCents: null });
        expect(store.charges).toHaveLength(0);
    });
});
