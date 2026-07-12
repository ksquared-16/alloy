/**
 * Shared TEST fixture for the D12a correction/reversal service suites (pure test
 * scaffolding — no product code, no architectural capability). Seeds a late-pickup
 * (fixed) + hourly-care (rate-derived) commercial config so tests can exercise
 * supersede/void, reparent/recalc, chains, replay, and atomicity.
 */

import {
    commercialTuitionSeed,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
    type ReconcileFault,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";

export const TODAY = "2026-06-29";
export const AGREEMENT = "agr-1";
export const SITE = "site-1";
export const DATE = "2026-06-18";
export { ORG_ID };

function tmpl(over: Record<string, unknown>) {
    return {
        org_id: ORG_ID, service_id: "svc-ft", currency_code: "USD", trigger_type: "attendance",
        billable_offset_days: null, default_gl_mapping_key: null, default_responsibility_key: "household",
        is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
        amount_cents: null, ...over,
    };
}

export function setup(opts?: { over?: Partial<OperationalEnrollmentMockStore>; reconcileFault?: ReconcileFault }) {
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
        ...opts?.over,
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store, opts?.reconcileFault ? { reconcileFault: opts.reconcileFault } : undefined) };
}

export function att(over: Partial<OperationalFactDto>): OperationalFactDto {
    return {
        eventKey: "", sourceFamily: "attendance", sourceEntityType: "child_attendance_events",
        sourceEntityId: "att-1", agreementId: AGREEMENT, subjectType: "customer_member", subjectId: "mem-1",
        occursOn: DATE, ...over,
    };
}
