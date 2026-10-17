/**
 * H3-2 — agreement activation cannot bill a registration fee Enrollment already charged.
 *
 * Enrollment charges a child's registration fee when the paperwork is done, as a household charge
 * whose subject is the child. `enrollment.registration` resolves the same template against the
 * AGREEMENT — a different source, so a different idempotency key — and would bill again without the
 * guard. Only that event is narrowed; the guard reads, it never writes.
 */
import { describe, expect, it } from "vitest";

import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    withCanonicalBillingChain,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const template = {
    id: "tpl-1", org_id: ORG_ID, service_id: "svc-1", template_key: "registration_fee", label: "Registration Fee",
    charge_category: "fee", trigger_type: "manual", amount_strategy: "fixed", amount_cents: 15000, currency_code: "USD",
    occurs_on_strategy: "now", billable_on_strategy: "immediate", billable_offset_days: null, default_gl_mapping_key: "fee_revenue",
    default_responsibility_key: "household", review_required: false, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
};
const eventType = {
    id: "cet-global", org_id: null, event_key: "enrollment.registration", label: "Enrollment Registration", source_family: "agreement",
    description: null, charge_template_key: "registration_fee", default_responsibility_key: "household", is_active: true,
    effective_start: "2000-01-01", effective_end: null, metadata: {},
};
const fact = (agreementId: string): OperationalFactDto => ({
    eventKey: "enrollment.registration",
    sourceFamily: "agreement",
    sourceEntityType: "child_enrollment_agreements",
    sourceEntityId: agreementId,
    subjectType: "customer_member",
    subjectId: "member-1",
});
const enrollmentFeeFor = (child: string) => ({
    id: `chg-enrollment-${child}`, org_id: ORG_ID, billable_source_type: "customer", billable_source_id: "hh-1", status: "posted",
    amount_cents: 15000, metadata: { charge_template_key: "registration_fee", subject_customer_member_id: child },
});

function setup(seed: Record<string, unknown[]>) {
    const base = withCanonicalBillingChain({ financial_charge_templates: [template], consumption_event_types: [eventType] });
    const store = createOperationalEnrollmentMockStore({
        ...base,
        ...seed,
        child_enrollment_agreements: [...((base as Record<string, unknown[]>).child_enrollment_agreements ?? []), ...(seed.child_enrollment_agreements ?? [])],
        charges: [...((base as Record<string, unknown[]>).charges ?? []), ...(seed.charges ?? [])],
    } as never);
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

describe("enrollment.registration after Enrollment charged the fee", () => {
    it("drafts no second charge for a child already charged by Enrollment", async () => {
        const { store, supabase } = setup({
            child_enrollment_agreements: [{ id: "agr-h32", org_id: ORG_ID, customer_member_id: "member-1", customer_id: "hh-1", status: "active" }],
            charges: [enrollmentFeeFor("member-1")],
        });
        const before = store.charges.length;
        const r = await draftConsumption(supabase, ORG_ID, fact("agr-h32"), TODAY, "user-1");
        expect(store.charges.length).toBe(before);
        expect(JSON.stringify(r)).toContain("already_charged");
    });

    it("still bills a sibling whose fee Enrollment has not charged", async () => {
        const { store, supabase } = setup({
            child_enrollment_agreements: [{ id: "agr-h32b", org_id: ORG_ID, customer_member_id: "member-2", customer_id: "hh-1", status: "active" }],
            charges: [enrollmentFeeFor("member-1")],
        });
        const before = store.charges.length;
        await draftConsumption(supabase, ORG_ID, fact("agr-h32b"), TODAY, "user-1");
        expect(store.charges.length).toBe(before + 1);
    });
});
