import { describe, expect, it } from "vitest";
import { draftConsumption, previewConsumption } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";
import {
    commercialTuitionSeed,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const AGREEMENT = "agr-1";
const SITE = "site-1";

function tmpl(over: Record<string, unknown>) {
    return {
        org_id: ORG_ID, service_id: "svc-ft", currency_code: "USD", trigger_type: "attendance",
        billable_offset_days: null, default_gl_mapping_key: null, default_responsibility_key: "household",
        is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
        amount_cents: null, ...over,
    };
}
function charkeTemplates() {
    return [
        tmpl({ id: "tpl-late", template_key: "late_pickup", label: "Late Pickup", charge_category: "late_pickup", amount_strategy: "fixed", amount_cents: 2500, occurs_on_strategy: "event_date", billable_on_strategy: "immediate", review_required: true }),
        tmpl({ id: "tpl-dropin", template_key: "drop_in", label: "Drop-In", charge_category: "tuition", amount_strategy: "rate_derived", occurs_on_strategy: "event_date", billable_on_strategy: "immediate", review_required: false }),
        tmpl({ id: "tpl-hourly", template_key: "hourly_care", label: "Hourly Care", charge_category: "tuition", amount_strategy: "rate_derived", occurs_on_strategy: "event_date", billable_on_strategy: "immediate", review_required: false }),
    ];
}
function ratePlan() {
    return { id: "plan-1", org_id: ORG_ID, scope_type: "org", site_location_id: null, program_category_id: null, room_location_id: null, age_group_key: null, plan_key: "standard", service_id: "svc-ft", label: "Standard", currency_code: "USD", billing_basis: "monthly", calculation_strategy: "scheduled", proration_method: null, billing_cadence: null, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} };
}
function rateRules() {
    return [
        { id: "rule-di", org_id: ORG_ID, rate_plan_id: "plan-1", schedule_basis: "drop_in", rate_basis: "daily", age_group_key: null, amount_cents: 9000, effective_start: "2026-01-01", effective_end: null, metadata: {} },
        { id: "rule-hr", org_id: ORG_ID, rate_plan_id: "plan-1", schedule_basis: "hourly", rate_basis: "hourly", age_group_key: null, amount_cents: 1500, effective_start: "2026-01-01", effective_end: null, metadata: {} },
    ];
}
function eventTypes() {
    const base = { org_id: null, label: "x", source_family: "attendance", description: null, default_responsibility_key: "household", is_active: true, effective_start: "2000-01-01", effective_end: null, metadata: {} };
    return [
        { ...base, id: "cet-late", event_key: "attendance.late_pickup", charge_template_key: "late_pickup" },
        { ...base, id: "cet-di", event_key: "attendance.drop_in", charge_template_key: "drop_in" },
        { ...base, id: "cet-ed", event_key: "attendance.extra_day", charge_template_key: "drop_in" },
        { ...base, id: "cet-hr", event_key: "attendance.hourly_care", charge_template_key: "hourly_care" },
        { ...base, id: "cet-ns", event_key: "attendance.no_show", charge_template_key: null },
        { ...base, id: "cet-vc", event_key: "attendance.vacation_credit", charge_template_key: null },
    ];
}
function setup(over?: Partial<OperationalEnrollmentMockStore>) {
    // Phase 9 — Commercial config reproduces the attendance rates (drop_in=9000/day, hourly=1500/hr).
    const commercial = commercialTuitionSeed({
        orgId: ORG_ID,
        agreementId: AGREEMENT,
        rates: [
            { basis: "drop_in", cadenceKey: "daily", rateCents: 9000 },
            { basis: "hourly", cadenceKey: "hourly", rateCents: 1500 },
        ],
    });
    const store = createOperationalEnrollmentMockStore({
        financial_charge_templates: charkeTemplates(),
        childcare_rate_plans: [ratePlan()],
        childcare_rate_rules: rateRules(),
        consumption_event_types: eventTypes(),
        child_enrollment_agreements: [{ id: AGREEMENT, org_id: ORG_ID, site_location_id: SITE, status: "active", start_date: "2026-01-01", customer_member_id: "mem-1" }],
        financial_policies: [{ id: "pol-rev", org_id: ORG_ID, scope_type: "org", policy_type: "posting_review", value: { required: false }, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} }],
        ...commercial,
        ...over,
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

function attFact(over: Partial<OperationalFactDto>): OperationalFactDto {
    return {
        eventKey: "",
        sourceFamily: "attendance",
        sourceEntityType: "child_attendance_events",
        sourceEntityId: "att-1",
        agreementId: AGREEMENT,
        subjectType: "customer_member",
        subjectId: "mem-1",
        occursOn: "2026-06-18",
        ...over,
    };
}

describe("attendance consumption — product goal: a child checked out at 5:18 PM", () => {
    it("becomes a late-pickup Consumption Event with a $25 draft-charge preview, via the pipeline", async () => {
        const { store, supabase } = setup();
        const r = await previewConsumption(supabase, ORG_ID, attFact({ attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }), TODAY);

        expect(r.candidate).toMatchObject({ domain: "attendance", factType: "check_out", agreementId: AGREEMENT });
        expect(r.resolution.event.status).toBe("resolved");
        expect(r.resolution.obligations).toHaveLength(1);
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "late_pickup", amountCents: 2500, draftable: true, reviewRequired: true });
        expect((r.commercialObjectsUsed ?? []).some((c) => c.kind === "charge_template" && c.label === "Late Pickup")).toBe(true);
        // preview persists nothing
        expect(store.consumption_events).toHaveLength(0);
        expect(store.resolved_obligations).toHaveLength(0);
        expect(store.charges).toHaveLength(0);
    });

    it("on-time check-out is DISCARDED — no event, with an explanation", async () => {
        const { store, supabase } = setup();
        const r = await previewConsumption(supabase, ORG_ID, attFact({ attendanceFactType: "check_out", checkOutTime: "16:30", lateThresholdTime: "17:00" }), TODAY);
        expect(r.attendanceInterpretation?.discardReason).toBeTruthy();
        expect(r.resolution.event.status).toBe("no_obligation");
        expect(r.resolution.obligations).toHaveLength(0);
        expect(store.charges).toHaveLength(0);
    });

    it("draft persists event + obligation + draft charge; duplicate facts do NOT duplicate", async () => {
        const { store, supabase } = setup();
        const fact = attFact({ attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" });
        await draftConsumption(supabase, ORG_ID, fact, TODAY, "user-1");
        expect(store.consumption_events).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.resolved_obligations[0]).toMatchObject({ obligation_kind: "late_pickup", status: "drafted", amount_cents: 2500 });
        expect(store.charges).toHaveLength(1);
        expect(store.charges[0]).toMatchObject({ status: "draft", amount_cents: 2500, charge_template_id: "tpl-late" });

        // duplicate attendance fact (same day) → idempotent
        await draftConsumption(supabase, ORG_ID, { ...fact, sourceEntityId: "att-2" }, TODAY, "user-1");
        expect(store.consumption_events).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.charges).toHaveLength(1);
    });
});

describe("attendance consumption — other scenarios through the same pipeline", () => {
    it("drop-in → $90 draft charge at the drop-in rate", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, attFact({ attendanceFactType: "drop_in" }), TODAY, "user-1");
        expect(store.resolved_obligations[0]).toMatchObject({ obligation_kind: "drop_in", amount_cents: 9000, status: "drafted" });
    });

    it("hourly care for 3h → $45 (rate × hours)", async () => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, attFact({ attendanceFactType: "hourly_care", hours: 3 }), TODAY, "user-1");
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "hourly_care", amountCents: 4500 });
        expect(store.charges[0]).toMatchObject({ amount_cents: 4500 });
    });

    it("absence + vacation eligibility → a preview-only vacation credit (no draft charge)", async () => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, attFact({ attendanceFactType: "absence", vacationEligible: true }), TODAY, "user-1");
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "vacation_credit", draftable: false });
        expect(store.charges).toHaveLength(0);
    });

    it("absence without eligibility, room transfer, excused absence → no event", async () => {
        for (const ft of ["absence", "room_transfer", "excused_absence"] as const) {
            const { store, supabase } = setup();
            const r = await draftConsumption(supabase, ORG_ID, attFact({ attendanceFactType: ft }), TODAY, "user-1");
            expect(r.resolution.event.status).toBe("no_obligation");
            expect(store.resolved_obligations).toHaveLength(0);
            expect(store.charges).toHaveLength(0);
        }
    });

    it("no-show with no configured fee → event resolved but obligation SUPPRESSED (no_charge), explained", async () => {
        const { store, supabase } = setup();
        const r = await previewConsumption(supabase, ORG_ID, attFact({ attendanceFactType: "no_show" }), TODAY);
        expect(r.resolution.obligations[0]).toMatchObject({ obligationKind: "no_show", status: "no_charge", amountCents: null });
        expect(r.resolution.explanation.suppressed_obligation_count).toBe(1);
        expect(typeof (r.resolution.obligations[0].explanation as { no_charge_reason?: string }).no_charge_reason).toBe("string");
        expect(store.charges).toHaveLength(0);
    });
});
