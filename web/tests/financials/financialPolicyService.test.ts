import { describe, expect, it } from "vitest";
import {
    createFinancialPolicy,
    createFinancialPolicyVersion,
    listFinancialPolicies,
    retireFinancialPolicy,
    voidScheduledFinancialPolicy,
} from "@/lib/financials/policies/financialPolicyService";
import { validatePolicyValue } from "@/lib/financials/policies/financialPolicyTypes";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

const TODAY = "2026-06-29";
function setup() {
    const store = createOperationalEnrollmentMockStore();
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

describe("financialPolicyService", () => {
    it("creates an org-scoped policy with a validated value", async () => {
        const { store, supabase } = setup();
        const p = await createFinancialPolicy(supabase, {
            orgId: ORG_ID,
            scopeType: "org",
            policyType: "grace_period",
            value: { days: 5 },
            effectiveStart: "2026-01-01",
        });
        expect(p).toMatchObject({ scope_type: "org", policy_type: "grace_period", value: { days: 5 } });
        expect(store.financial_policies).toHaveLength(1);
        expect(await listFinancialPolicies(supabase, ORG_ID)).toHaveLength(1);
    });

    it("supersedes a policy without overwriting the prior value in place", async () => {
        const { store, supabase } = setup();
        const p = await createFinancialPolicy(supabase, { orgId: ORG_ID, scopeType: "org", policyType: "late_fee", value: { amount_cents: 2500, after_days: 10 }, effectiveStart: "2026-01-01" });
        const v = await createFinancialPolicyVersion(supabase, { orgId: ORG_ID, priorId: p.id, effectiveStart: "2027-01-01", value: { amount_cents: 3000, after_days: 7 } });
        expect(v.priorCloseDate).toBe("2026-12-31");
        expect(v.policy.value).toMatchObject({ amount_cents: 3000, after_days: 7 });
        expect(v.policy.metadata.supersedes_id).toBe(p.id);
        const prior = store.financial_policies.find((r) => r.id === p.id) as FinancialPolicyRow;
        expect(prior.value).toMatchObject({ amount_cents: 2500, after_days: 10 }); // unchanged
        expect(prior.effective_end).toBe("2026-12-31");
    });

    it("retires and voids a scheduled version (reopens predecessor)", async () => {
        const { store, supabase } = setup();
        const p = await createFinancialPolicy(supabase, { orgId: ORG_ID, scopeType: "org", policyType: "proration", value: { method: "daily" }, effectiveStart: "2026-01-01" });
        const v = await createFinancialPolicyVersion(supabase, { orgId: ORG_ID, priorId: p.id, effectiveStart: "2027-01-01", value: { method: "business_day" } });
        await retireFinancialPolicy(supabase, { orgId: ORG_ID, id: v.policy.id, effectiveEnd: "2030-12-31", todayYmd: TODAY });
        expect((store.financial_policies.find((r) => r.id === v.policy.id) as FinancialPolicyRow).effective_end).toBe("2030-12-31");
        const voided = await voidScheduledFinancialPolicy(supabase, { orgId: ORG_ID, id: v.policy.id, todayYmd: TODAY });
        expect(voided.reopenedPriorId).toBe(p.id);
        expect(store.financial_policies.find((r) => r.id === v.policy.id)).toBeUndefined();
        expect((store.financial_policies.find((r) => r.id === p.id) as FinancialPolicyRow).effective_end).toBeNull();
    });

    it("validates scope shape and typed value", async () => {
        const { supabase } = setup();
        // service scope requires a service target
        await expect(createFinancialPolicy(supabase, { orgId: ORG_ID, scopeType: "service", policyType: "billing_cadence", value: { cadence: "weekly" }, effectiveStart: "2026-01-01" })).rejects.toMatchObject({ code: "invalid_input" });
        // invalid select value for the type
        await expect(createFinancialPolicy(supabase, { orgId: ORG_ID, scopeType: "org", policyType: "proration", value: { method: "nope" }, effectiveStart: "2026-01-01" })).rejects.toMatchObject({ code: "invalid_input" });
        // money/number must be non-negative integers
        await expect(createFinancialPolicy(supabase, { orgId: ORG_ID, scopeType: "org", policyType: "grace_period", value: { days: -1 }, effectiveStart: "2026-01-01" })).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("creates a service-scoped policy when a target is provided", async () => {
        const { supabase } = setup();
        const p = await createFinancialPolicy(supabase, { orgId: ORG_ID, scopeType: "service", serviceId: "svc-1", policyType: "billing_cadence", value: { cadence: "weekly" }, effectiveStart: "2026-01-01" });
        expect(p).toMatchObject({ scope_type: "service", service_id: "svc-1" });
    });
});

describe("validatePolicyValue (pure)", () => {
    it("normalizes typed fields and rejects bad input", () => {
        expect(validatePolicyValue("deposit", { amount_cents: 50000, refundable: "yes" })).toEqual({ ok: true, value: { amount_cents: 50000, refundable: true } });
        expect(validatePolicyValue("posting_review", { required: true })).toEqual({ ok: true, value: { required: true } });
        expect(validatePolicyValue("billing_cadence", { cadence: "nope" }).ok).toBe(false);
    });
});
