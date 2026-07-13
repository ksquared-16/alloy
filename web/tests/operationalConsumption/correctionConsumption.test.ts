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

/**
 * D12a — correction facts route through the atomic reconcile RPC. Asserts DB
 * OUTCOMES (row statuses, lineage columns, charge status/voided_at/metadata),
 * not just return values.
 */

const TODAY = "2026-06-29";
const AGREEMENT = "agr-1";
const SITE = "site-1";
const DATE = "2026-06-18";

function tmpl(over: Record<string, unknown>) {
    return {
        org_id: ORG_ID, service_id: "svc-ft", currency_code: "USD", trigger_type: "attendance",
        billable_offset_days: null, default_gl_mapping_key: null, default_responsibility_key: "household",
        is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
        amount_cents: null, ...over,
    };
}
function setup(over?: Partial<OperationalEnrollmentMockStore>) {
    const commercial = commercialTuitionSeed({
        orgId: ORG_ID, agreementId: AGREEMENT,
        rates: [{ basis: "drop_in", cadenceKey: "daily", rateCents: 9000 }, { basis: "hourly", cadenceKey: "hourly", rateCents: 1500 }],
    });
    const store = createOperationalEnrollmentMockStore({
        financial_charge_templates: [
            tmpl({ id: "tpl-late", template_key: "late_pickup", label: "Late Pickup", charge_category: "late_pickup", amount_strategy: "fixed", amount_cents: 2500, occurs_on_strategy: "event_date", billable_on_strategy: "immediate", review_required: true }),
            tmpl({ id: "tpl-hourly", template_key: "hourly_care", label: "Hourly Care", charge_category: "tuition", amount_strategy: "rate_derived", occurs_on_strategy: "event_date", billable_on_strategy: "immediate", review_required: false }),
        ],
        childcare_rate_plans: [{ id: "plan-1", org_id: ORG_ID, scope_type: "org", site_location_id: null, program_category_id: null, room_location_id: null, age_group_key: null, plan_key: "standard", service_id: "svc-ft", label: "Standard", currency_code: "USD", billing_basis: "monthly", calculation_strategy: "scheduled", proration_method: null, billing_cadence: null, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} }],
        childcare_rate_rules: [{ id: "rule-hr", org_id: ORG_ID, rate_plan_id: "plan-1", schedule_basis: "hourly", rate_basis: "hourly", age_group_key: null, amount_cents: 1500, effective_start: "2026-01-01", effective_end: null, metadata: {} }],
        consumption_event_types: [
            { id: "cet-late", org_id: null, event_key: "attendance.late_pickup", charge_template_key: "late_pickup", label: "x", source_family: "attendance", description: null, default_responsibility_key: "household", is_active: true, effective_start: "2000-01-01", effective_end: null, metadata: {} },
            { id: "cet-hr", org_id: null, event_key: "attendance.hourly_care", charge_template_key: "hourly_care", label: "x", source_family: "attendance", description: null, default_responsibility_key: "household", is_active: true, effective_start: "2000-01-01", effective_end: null, metadata: {} },
        ],
        child_enrollment_agreements: [{ id: AGREEMENT, org_id: ORG_ID, site_location_id: SITE, status: "active", start_date: "2026-01-01", customer_member_id: "mem-1" }],
        financial_policies: [{ id: "pol-rev", org_id: ORG_ID, scope_type: "org", policy_type: "posting_review", value: { required: false }, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} }],
        ...commercial,
        ...over,
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}
function att(over: Partial<OperationalFactDto>): OperationalFactDto {
    return { eventKey: "", sourceFamily: "attendance", sourceEntityType: "child_attendance_events", sourceEntityId: "att-1", agreementId: AGREEMENT, subjectType: "customer_member", subjectId: "mem-1", occursOn: DATE, ...over };
}

describe("D12a correction — downward correction eliminates the fee (supersede + void)", () => {
    it("supersedes the prior obligation, voids its draft charge in place, retires the prior event", async () => {
        const { store, supabase } = setup();
        // Original late pickup → obligation + $25 draft charge.
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }), TODAY, "user-1");
        expect(store.resolved_obligations).toHaveLength(1);
        const priorOblId = store.resolved_obligations[0].id;
        expect(store.charges).toHaveLength(1);
        const chargeId = store.charges[0].id;
        expect(store.charges[0]).toMatchObject({ status: "draft", amount_cents: 2500 });

        // Correction: on-time checkout → no late-pickup directive → prior superseded.
        const r = await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-1" }), TODAY, "user-1");

        // Prior obligation superseded, with provenance.
        const priorObl = store.resolved_obligations.find((o) => o.id === priorOblId)!;
        expect(priorObl.status).toBe("superseded");
        expect(priorObl.superseded_by_event_id).toBeTruthy();
        expect(priorObl.review_status).toBe("stale");
        // Draft charge retired IN PLACE to void (not deleted; row preserved).
        const charge = store.charges.find((c) => c.id === chargeId)!;
        expect(charge.status).toBe("void");
        expect(charge.voided_at).toBeTruthy();
        expect((charge.metadata as { retirement?: { reason?: string } }).retirement?.reason).toBe("obligation_superseded");
        expect(store.charges).toHaveLength(1); // not deleted
        // Correction event exists with corrects_event_id; prior event superseded.
        const corrEvent = store.consumption_events.find((e) => e.source_entity_id === "att-2")!;
        expect(corrEvent.corrects_event_id).toBeTruthy();
        const priorEvent = store.consumption_events.find((e) => e.source_entity_id === "att-1")!;
        expect(priorEvent.status).toBe("superseded");
        expect(corrEvent.corrects_event_id).toBe(priorEvent.id);
        // Correction event key is fact-anchored on ITS OWN sourceEntityId (DP-3).
        expect(String(corrEvent.idempotency_key)).toContain(":fact:att-2");
        // Result surface.
        expect(r.superseded?.obligationIds).toContain(priorOblId);
        expect(r.superseded?.voidedDraftChargeIds).toContain(chargeId);
        expect(r.superseded?.priorConsumptionEventId).toBe(priorEvent.id);
    });
});

describe("D12a correction — same-key amount change reparents + recalcs (no supersession, DP-4)", () => {
    it("moves the obligation to the new event, recalculates the draft, marks stale, supersedes nothing", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "hourly_care", hours: 3 }), TODAY, "user-1");
        const oblId = store.resolved_obligations[0].id;
        expect(store.resolved_obligations[0]).toMatchObject({ obligation_kind: "hourly_care", amount_cents: 4500, status: "drafted" });
        const chargeId = store.charges[0].id;
        expect(store.charges[0]).toMatchObject({ status: "draft", amount_cents: 4500 });

        const r = await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "hourly_care", hours: 2, entryType: "correction", correctsFactId: "att-1" }), TODAY, "user-1");

        const corrEvent = store.consumption_events.find((e) => e.source_entity_id === "att-2")!;
        const obl = store.resolved_obligations.find((o) => o.id === oblId)!;
        expect(obl.consumption_event_id).toBe(corrEvent.id); // reparented
        expect(obl.amount_cents).toBe(3000); // recalculated
        expect(obl.status).toBe("drafted");
        expect(obl.review_status).toBe("stale");
        expect(obl.superseded_by_event_id).toBeNull();
        // Draft charge recalculated in place (still draft, not void).
        const charge = store.charges.find((c) => c.id === chargeId)!;
        expect(charge.status).toBe("draft");
        expect(charge.amount_cents).toBe(3000);
        // No supersession; exactly one obligation total.
        expect(store.resolved_obligations).toHaveLength(1);
        expect(r.superseded?.obligationIds ?? []).toHaveLength(0);
        expect(r.superseded?.reparentedObligationIds).toContain(oblId);
    });
});

describe("D12a correction — preview delta + failure fallbacks", () => {
    it("previewConsumption of a correction returns the supersession delta and writes nothing", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }), TODAY, "user-1");
        const beforeEvents = store.consumption_events.length;
        const beforeCharges = JSON.stringify(store.charges);

        const p = await previewConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-1" }), TODAY);
        expect(p.supersession?.supersededObligations).toHaveLength(1);
        expect(p.supersession?.supersededObligations[0].obligationKind).toBe("late_pickup");
        // wrote nothing
        expect(store.consumption_events.length).toBe(beforeEvents);
        expect(JSON.stringify(store.charges)).toBe(beforeCharges);
        expect(store.resolved_obligations.every((o) => o.status !== "superseded")).toBe(true);
    });

    it("missing correctsFactId → treated as original, correction_lineage_missing stamped, no supersession", async () => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-9", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: null }), TODAY, "user-1");
        expect(r.superseded ?? null).toBeNull();
        const ev = store.consumption_events.find((e) => e.source_entity_id === "att-9")!;
        expect((ev.context as { correction_lineage_missing?: boolean }).correction_lineage_missing).toBe(true);
        expect(store.resolved_obligations.some((o) => o.status === "superseded")).toBe(false);
    });

    it("no prior consumption event → proceeds as original (no partial supersession)", async () => {
        const { store, supabase } = setup();
        const r = await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-missing" }), TODAY, "user-1");
        expect(r.superseded ?? null).toBeNull();
        const ev = store.consumption_events.find((e) => e.source_entity_id === "att-2")!;
        expect((ev.context as { corrects_fact_id?: string }).corrects_fact_id).toBe("att-missing");
        expect(store.consumption_events.every((e) => e.status !== "superseded")).toBe(true);
    });
});
