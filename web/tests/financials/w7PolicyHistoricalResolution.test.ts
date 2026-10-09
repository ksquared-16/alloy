/**
 * W7-F006 — A RETIRED POLICY STILL ANSWERS FOR THE DATES IT GOVERNED.
 *
 * Measured on deployed staging (Firefly Early Learning, 2026-10-08): the four org `due_date` rows below,
 * exactly as stored after the W7 baseline. The two oldest were retired through the policies API, which
 * wrote `is_active = false` beside their end dates, and the resolver read that flag as "never applied" —
 * so every service date from Aug 1 to Sep 18 resolved no due date at all.
 *
 * W7-F007 — while the location registry is still loading, an override does not claim its location is gone.
 */
import { describe, expect, it } from "vitest";

import { buildBillingTimingModel } from "@/lib/financials/policies/billingTimingViewModel";
import { retireFinancialPolicy, createFinancialPolicy } from "@/lib/financials/policies/financialPolicyService";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";
import { isWithdrawnPolicy, resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { policyScopeNarrowingNeeded } from "@/lib/financials/policies/resolveFinancialPolicyScope";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

function row(over: Partial<FinancialPolicyRow> & { id: string }): FinancialPolicyRow {
    return {
        org_id: "org", scope_type: "org", location_id: null, service_id: null, rate_plan_id: null,
        customer_id: null, policy_type: "due_date", label: null, description: null, value: {}, is_active: true,
        effective_start: "2026-01-01", effective_end: null, source_key: "config", metadata: {},
        created_by: null, updated_by: null, created_at: "", updated_at: "", ...over,
    } as FinancialPolicyRow;
}

/* The staging lineage, verbatim (POLICIES_AFTER, run 2). */
const STAGING_DUE_ROWS = [
    row({ id: "9fd72758", value: { strategy: "days_after_invoice", offset_days: 10 }, is_active: false, effective_start: "2026-08-01", effective_end: "2026-09-17" }),
    row({ id: "99f9511b", value: { strategy: "on_invoice", offset_days: 0 }, is_active: false, effective_start: "2026-09-18", effective_end: "2026-09-18" }),
    row({ id: "71d6b7ed", value: { strategy: "days_after_invoice", offset_days: 10 }, is_active: true, effective_start: "2026-09-19", effective_end: "2026-10-07" }),
    row({ id: "c2b4ffdc", value: { strategy: "on_period_start", offset_days: 0 }, is_active: true, effective_start: "2026-10-08", effective_end: null }),
];

const resolvedId = (date: string, rows = STAGING_DUE_ROWS) => {
    const r = resolveFinancialPolicy(rows, "due_date", {}, date);
    return r.resolved ? r.policy.id : null;
};

describe("W7-F006 — historical due-date resolution follows the stored windows", () => {
    it.each([
        ["2026-07-31", null],
        ["2026-08-01", "9fd72758"],
        ["2026-09-17", "9fd72758"],
        ["2026-09-18", "99f9511b"],
        ["2026-09-19", "71d6b7ed"],
        ["2026-10-07", "71d6b7ed"],
        ["2026-10-08", "c2b4ffdc"],
        ["2026-11-05", "c2b4ffdc"],
        ["2027-06-01", "c2b4ffdc"],
    ])("%s resolves %s", (date, id) => {
        expect(resolvedId(date)).toBe(id);
    });

    it("a retired rule never competes with the current one", () => {
        for (const date of ["2026-10-08", "2026-10-09", "2026-12-31"]) expect(resolvedId(date)).toBe("c2b4ffdc");
    });

    it("a withdrawn rule (inactive, no window end) still never applies", () => {
        const withdrawn = row({ id: "withdrawn", value: { strategy: "on_invoice" }, is_active: false, effective_start: "2026-01-01" });
        expect(isWithdrawnPolicy(withdrawn)).toBe(true);
        expect(isWithdrawnPolicy(STAGING_DUE_ROWS[0])).toBe(false);
        expect(resolvedId("2026-03-01", [withdrawn])).toBeNull();
    });

    it("a retired account-scoped rule still buys the scope read its dates need", () => {
        const retired = row({ id: "acct", scope_type: "customer", customer_id: "c1", is_active: false, effective_start: "2026-01-01", effective_end: "2026-06-30" });
        expect(policyScopeNarrowingNeeded([retired], "due_date")).toBe(true);
        const withdrawn = { ...retired, effective_end: null };
        expect(policyScopeNarrowingNeeded([withdrawn], "due_date")).toBe(false);
    });

    it("retiring records the last day and keeps the rule resolvable inside it", async () => {
        const store = createOperationalEnrollmentMockStore();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const p = await createFinancialPolicy(supabase, {
            orgId: ORG_ID, scopeType: "org", policyType: "due_date",
            value: { strategy: "days_after_invoice", offset_days: 10 }, effectiveStart: "2026-08-01",
        });
        const retired = await retireFinancialPolicy(supabase, { orgId: ORG_ID, id: p.id, effectiveEnd: "2026-09-17", todayYmd: "2026-10-08" });
        expect(retired.effective_end).toBe("2026-09-17");
        expect(retired.is_active).toBe(true);
        expect(resolvedId("2026-09-01", [retired])).toBe(p.id);
        expect(resolvedId("2026-10-08", [retired])).toBeNull();
    });
});

describe("W7-F006 — the configuration surface: current in the main reading, the rest in history", () => {
    const model = buildBillingTimingModel({ policies: STAGING_DUE_ROWS, locations: [], todayYmd: "2026-10-08" });
    const due = model.orgDefault.find((r) => r.rule === "due_date")!;

    it("reads only the current rule", () => {
        expect(due.current?.id).toBe("c2b4ffdc");
        expect(due.sentence).toBe("On the first day of the billing period");
        expect(due.scheduled).toBeNull();
    });

    it("keeps every prior version, with its window, in history", () => {
        expect(due.history.map((r) => [r.id, r.effective_start, r.effective_end])).toEqual([
            ["c2b4ffdc", "2026-10-08", null],
            ["71d6b7ed", "2026-09-19", "2026-10-07"],
            ["99f9511b", "2026-09-18", "2026-09-18"],
            ["9fd72758", "2026-08-01", "2026-09-17"],
        ]);
    });
});

describe("W7-F007 — a pending location is not a missing one", () => {
    const override = row({ id: "loc", policy_type: "billing_calendar", scope_type: "location", location_id: "loc-north", value: { cadence: "monthly" } });

    it("names nothing while the registry is loading", () => {
        const m = buildBillingTimingModel({ policies: [override], locations: [], locationsLoaded: false, todayYmd: "2026-10-08" });
        expect(m.overrides[0].locationName).toBeNull();
    });

    it("names the location once loaded", () => {
        const m = buildBillingTimingModel({ policies: [override], locations: [{ id: "loc-north", name: "North Campus" }], todayYmd: "2026-10-08" });
        expect(m.overrides[0].locationName).toBe("North Campus");
    });

    it("says 'no longer listed' only when the loaded registry lacks it", () => {
        const m = buildBillingTimingModel({ policies: [override], locations: [], locationsLoaded: true, todayYmd: "2026-10-08" });
        expect(m.overrides[0].locationName).toBe("A location no longer listed");
    });
});
