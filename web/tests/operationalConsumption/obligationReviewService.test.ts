import { describe, expect, it } from "vitest";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import {
    getObligationDetail,
    listResolvedObligations,
    recomputeObligation,
    reviewObligation,
} from "@/lib/operationalConsumption/obligationReviewService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";
import {
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
        is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {}, amount_cents: null, ...over,
    };
}
function ratePlan() {
    return { id: "plan-1", org_id: ORG_ID, scope_type: "org", site_location_id: null, program_category_id: null, room_location_id: null, age_group_key: null, plan_key: "standard", service_id: "svc-ft", label: "Standard", currency_code: "USD", billing_basis: "monthly", calculation_strategy: "scheduled", proration_method: null, billing_cadence: null, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} };
}
function eventTypes() {
    const base = { org_id: null, label: "x", source_family: "attendance", description: null, default_responsibility_key: "household", is_active: true, effective_start: "2000-01-01", effective_end: null, metadata: {} };
    return [
        { ...base, id: "cet-late", event_key: "attendance.late_pickup", charge_template_key: "late_pickup" },
        { ...base, id: "cet-di", event_key: "attendance.drop_in", charge_template_key: "drop_in" },
    ];
}
function setup(over?: Partial<OperationalEnrollmentMockStore>) {
    const store = createOperationalEnrollmentMockStore({
        financial_charge_templates: [
            tmpl({ id: "tpl-late", template_key: "late_pickup", label: "Late Pickup", charge_category: "late_pickup", amount_strategy: "fixed", amount_cents: 2500, occurs_on_strategy: "event_date", billable_on_strategy: "immediate", review_required: true }),
            tmpl({ id: "tpl-dropin", template_key: "drop_in", label: "Drop-In", charge_category: "tuition", amount_strategy: "rate_derived", occurs_on_strategy: "event_date", billable_on_strategy: "immediate", review_required: false }),
        ],
        childcare_rate_plans: [ratePlan()],
        childcare_rate_rules: [{ id: "rule-di", org_id: ORG_ID, rate_plan_id: "plan-1", schedule_basis: "drop_in", rate_basis: "daily", age_group_key: null, amount_cents: 9000, effective_start: "2026-01-01", effective_end: null, metadata: {} }],
        consumption_event_types: eventTypes(),
        child_enrollment_agreements: [{ id: AGREEMENT, org_id: ORG_ID, site_location_id: SITE, status: "active", start_date: "2026-01-01", customer_member_id: "mem-1" }],
        financial_policies: [{ id: "pol-rev", org_id: ORG_ID, scope_type: "org", policy_type: "posting_review", value: { required: false }, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {} }],
        ...over,
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

function lateFact(over: Partial<OperationalFactDto> = {}): OperationalFactDto {
    return { eventKey: "", sourceFamily: "attendance", sourceEntityType: "child_attendance_events", sourceEntityId: "att-1", agreementId: AGREEMENT, subjectType: "customer_member", subjectId: "mem-1", occursOn: "2026-06-18", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00", ...over };
}

async function seedLatePickup(supabase: ReturnType<typeof createOperationalEnrollmentMockSupabase>) {
    await draftConsumption(supabase, ORG_ID, lateFact(), TODAY, "user-1");
}

describe("obligation review — list & filtering", () => {
    it("lists obligations joined with their consumption event, newest scoping", async () => {
        const { supabase } = setup();
        await seedLatePickup(supabase);
        const items = await listResolvedObligations(supabase, ORG_ID, {});
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ obligationKind: "late_pickup", sourceFamily: "attendance", eventKey: "attendance.late_pickup", reviewStatus: "review_required", reviewRequired: true, amountCents: 2500, eligibleForPosting: true });
    });

    it("filters by review_required, review_status, and source family", async () => {
        const { supabase } = setup();
        await seedLatePickup(supabase);
        expect(await listResolvedObligations(supabase, ORG_ID, { reviewRequired: true })).toHaveLength(1);
        expect(await listResolvedObligations(supabase, ORG_ID, { reviewStatus: "review_required" })).toHaveLength(1);
        expect(await listResolvedObligations(supabase, ORG_ID, { reviewStatus: "reviewed" })).toHaveLength(0);
        expect(await listResolvedObligations(supabase, ORG_ID, { sourceFamily: "attendance" })).toHaveLength(1);
        expect(await listResolvedObligations(supabase, ORG_ID, { sourceFamily: "schedule" })).toHaveLength(0);
    });

    it("isolates by org", async () => {
        const { supabase } = setup();
        await seedLatePickup(supabase);
        expect(await listResolvedObligations(supabase, "org-OTHER", {})).toHaveLength(0);
    });
});

describe("obligation review — detail, explanation & timeline", () => {
    it("assembles the full reasoning chain + ordered timeline", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        const id = (store.resolved_obligations[0] as { id: string }).id;
        const d = await getObligationDetail(supabase, ORG_ID, id, TODAY);

        expect(d.obligationKind).toBe("late_pickup");
        expect(d.consumptionEvent?.eventKey).toBe("attendance.late_pickup");
        expect(d.draftCharge).toMatchObject({ status: "draft", amountCents: 2500 });
        expect(d.explanation.sourceFact.sourceFamily).toBe("attendance");
        expect(d.explanation.matchedChargeTemplate?.label).toBe("Late Pickup");
        // timeline runs fact -> candidate -> event -> obligation -> draft charge, all present
        expect(d.timeline.map((t) => t.stage)).toEqual(["operational_fact", "candidate", "consumption_event", "resolved_obligation", "draft_charge"]);
        expect(d.timeline.every((t) => t.present)).toBe(true);
    });
});

describe("obligation review — actions (review-only, no posting)", () => {
    it("mark reviewed → reviewed; flag → review_required", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        const id = (store.resolved_obligations[0] as { id: string }).id;
        const reviewed = await reviewObligation(supabase, ORG_ID, id, "mark_reviewed", TODAY, { actorUserId: "u1" });
        expect(reviewed.reviewStatus).toBe("reviewed");
        expect(reviewed.reviewedAt).toBeTruthy();
        const flagged = await reviewObligation(supabase, ORG_ID, id, "flag", TODAY, { actorUserId: "u1" });
        expect(flagged.reviewStatus).toBe("review_required");
    });

    it("suppress → not eligible for posting; restore → eligible again", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        const id = (store.resolved_obligations[0] as { id: string }).id;
        const suppressed = await reviewObligation(supabase, ORG_ID, id, "suppress", TODAY, { reason: "duplicate", actorUserId: "u1" });
        expect(suppressed.reviewStatus).toBe("suppressed");
        expect(suppressed.eligibleForPosting).toBe(false);
        expect(suppressed.suppressionReason).toBe("duplicate");
        const restored = await reviewObligation(supabase, ORG_ID, id, "restore", TODAY, { actorUserId: "u1" });
        expect(restored.reviewStatus).toBe("review_required"); // returns to review_required (it was review_required)
        expect(restored.eligibleForPosting).toBe(true);
        expect(restored.suppressionReason).toBeNull();
    });

    it("review actions never write a charge / never post (charges unchanged)", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        const chargesBefore = store.charges.length;
        const id = (store.resolved_obligations[0] as { id: string }).id;
        await reviewObligation(supabase, ORG_ID, id, "mark_reviewed", TODAY, { actorUserId: "u1" });
        await reviewObligation(supabase, ORG_ID, id, "suppress", TODAY, { actorUserId: "u1" });
        expect(store.charges).toHaveLength(chargesBefore);
        expect(store.charges.every((c) => (c as { status: string }).status !== "posted")).toBe(true);
    });

    it("records reviewer audit metadata (reviewed_by + reviewed_at) on mark_reviewed", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        const id = (store.resolved_obligations[0] as { id: string }).id;
        const reviewed = await reviewObligation(supabase, ORG_ID, id, "mark_reviewed", TODAY, { actorUserId: "auditor-7" });
        // returned detail carries the actor + timestamp …
        expect(reviewed.reviewedBy).toBe("auditor-7");
        expect(reviewed.reviewedAt).toBeTruthy();
        // … and the audit metadata is actually persisted on the row.
        const row = store.resolved_obligations[0] as { reviewed_by: string | null; reviewed_at: string | null; review_status: string };
        expect(row.reviewed_by).toBe("auditor-7");
        expect(row.reviewed_at).toBeTruthy();
        expect(row.review_status).toBe("reviewed");
    });
});

describe("obligation review — recompute (preview replays the pipeline, no charge writes)", () => {
    it("preview reports no change when config is unchanged, and writes nothing", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        const id = (store.resolved_obligations[0] as { id: string }).id;
        const chargesBefore = store.charges.length;
        const rc = await recomputeObligation(supabase, ORG_ID, id, TODAY, { persist: false });
        expect(rc.changed).toBe(false);
        expect(rc.recomputed?.amountCents).toBe(2500);
        expect(rc.persisted).toBe(false);
        expect(store.charges).toHaveLength(chargesBefore); // recompute is a preview — no new charge
    });

    it("detects drift and (persist) marks the obligation stale when the fee changes", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        const id = (store.resolved_obligations[0] as { id: string }).id;
        // change the late-pickup fee in config
        (store.financial_charge_templates.find((t) => (t as { template_key: string }).template_key === "late_pickup") as { amount_cents: number }).amount_cents = 3000;
        const rc = await recomputeObligation(supabase, ORG_ID, id, TODAY, { persist: true, actorUserId: "u1" });
        expect(rc.changed).toBe(true);
        expect(rc.recomputed?.amountCents).toBe(3000);
        expect(rc.persisted).toBe(true);
        const row = store.resolved_obligations[0] as { amount_cents: number; review_status: string };
        expect(row.amount_cents).toBe(3000);
        expect(row.review_status).toBe("stale");
    });

    it("is idempotent — re-running review/recompute does not duplicate obligations or charges", async () => {
        const { store, supabase } = setup();
        await seedLatePickup(supabase);
        await seedLatePickup(supabase); // duplicate attendance fact, same day
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.charges).toHaveLength(1);
        const id = (store.resolved_obligations[0] as { id: string }).id;
        await recomputeObligation(supabase, ORG_ID, id, TODAY, { persist: true });
        await recomputeObligation(supabase, ORG_ID, id, TODAY, { persist: true });
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.charges).toHaveLength(1);
    });
});
