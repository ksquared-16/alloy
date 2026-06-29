import { describe, expect, it } from "vitest";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

let seq = 0;
function policy(p: Partial<FinancialPolicyRow> & { scope_type: FinancialPolicyRow["scope_type"]; policy_type: FinancialPolicyRow["policy_type"] }): FinancialPolicyRow {
    seq += 1;
    return {
        id: p.id ?? `pol-${seq}`,
        org_id: "org-1",
        scope_type: p.scope_type,
        location_id: p.location_id ?? null,
        service_id: p.service_id ?? null,
        rate_plan_id: p.rate_plan_id ?? null,
        policy_type: p.policy_type,
        label: null,
        description: null,
        value: p.value ?? {},
        is_active: p.is_active ?? true,
        effective_start: p.effective_start ?? "2026-01-01",
        effective_end: p.effective_end ?? null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
    };
}

const TODAY = "2026-06-29";

describe("resolveFinancialPolicy — most-specific-wins", () => {
    it("rate_plan beats service beats location beats org", () => {
        const policies = [
            policy({ scope_type: "org", policy_type: "billing_cadence", value: { cadence: "monthly" } }),
            policy({ scope_type: "service", service_id: "svc-1", policy_type: "billing_cadence", value: { cadence: "weekly" } }),
            policy({ scope_type: "rate_plan", rate_plan_id: "plan-1", policy_type: "billing_cadence", value: { cadence: "biweekly" } }),
        ];
        // org context → org wins
        expect(resolveFinancialPolicy(policies, "billing_cadence", {}, TODAY)).toMatchObject({ resolved: true, sourceScope: "org" });
        // service context → service wins over org
        expect(resolveFinancialPolicy(policies, "billing_cadence", { serviceId: "svc-1" }, TODAY)).toMatchObject({ resolved: true, sourceScope: "service" });
        // rate_plan context → rate_plan wins over all
        expect(resolveFinancialPolicy(policies, "billing_cadence", { serviceId: "svc-1", ratePlanId: "plan-1" }, TODAY)).toMatchObject({
            resolved: true,
            sourceScope: "rate_plan",
        });
    });

    it("filters by policy_type and effective dating; later effective_start wins within a scope", () => {
        const policies = [
            policy({ scope_type: "org", policy_type: "proration", effective_start: "2026-01-01", value: { method: "daily" } }),
            policy({ scope_type: "org", policy_type: "proration", effective_start: "2026-06-01", value: { method: "business_day" } }),
            policy({ scope_type: "org", policy_type: "grace_period", value: { days: 5 } }),
        ];
        const r = resolveFinancialPolicy(policies, "proration", {}, TODAY);
        expect(r.resolved && r.policy.value.method).toBe("business_day");
    });

    it("returns no_policy when nothing matches or all are out of window", () => {
        const policies = [policy({ scope_type: "org", policy_type: "proration", effective_start: "2030-01-01", value: { method: "daily" } })];
        expect(resolveFinancialPolicy(policies, "proration", {}, TODAY)).toEqual({ resolved: false, reason: "no_policy" });
        expect(resolveFinancialPolicy(policies, "refund", {}, TODAY)).toEqual({ resolved: false, reason: "no_policy" });
    });
});
