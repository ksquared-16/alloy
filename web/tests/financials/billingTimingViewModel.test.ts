/**
 * W7-F005 — "HOW DOES THIS ORGANIZATION BILL?" READ RESOLVED, NOT AS RAW ROWS.
 *
 * The staging Policies surface showed six "Billing calendar · Location: —" blocks across five
 * cadences, interleaving current, scheduled and superseded versions. This model is what the new
 * surface renders: the org default in force, a scheduled change named as such, only the locations
 * that actually override, and every fallback in words.
 */
import { describe, expect, it } from "vitest";

import { buildBillingTimingModel, BILLING_TIMING_FALLBACK } from "@/lib/financials/policies/billingTimingViewModel";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

let n = 0;
function row(over: Partial<FinancialPolicyRow>): FinancialPolicyRow {
    n += 1;
    return {
        id: `p${n}`, org_id: "org", scope_type: "org", location_id: null, service_id: null, rate_plan_id: null,
        customer_id: null, policy_type: "billing_calendar", label: null, description: null, value: {}, is_active: true,
        effective_start: "2026-01-01", effective_end: null, source_key: "config", metadata: {},
        created_by: null, updated_by: null, created_at: "", updated_at: "", ...over,
    } as FinancialPolicyRow;
}

const LOCATIONS = [
    { id: "loc-ff", name: "Firefly" },
    { id: "loc-mo", name: "Moonbeam" },
];
const TODAY = "2026-10-08";

describe("the organization default, resolved", () => {
    const model = buildBillingTimingModel({
        policies: [
            row({ policy_type: "billing_calendar", value: { cadence: "weekly", anchor_on: "2026-01-05" }, effective_end: "2026-06-30" }),
            row({ policy_type: "billing_calendar", value: { cadence: "monthly" }, effective_start: "2026-07-01", effective_end: "2027-02-28" }),
            row({ policy_type: "billing_calendar", value: { cadence: "weekly", anchor_on: "2027-03-01" }, effective_start: "2027-03-01" }),
            row({ policy_type: "invoice_timing", value: { strategy: "days_before_period_start", offset_days: 7 } }),
            row({ policy_type: "due_date", value: { strategy: "on_period_start", offset_days: 0 } }),
        ],
        locations: LOCATIONS,
        todayYmd: TODAY,
    });
    const at = (rule: string) => model.orgDefault.find((r) => r.rule === rule)!;

    it("states today's billing period, through the day before the scheduled change", () => {
        expect(at("billing_calendar").sentence).toBe("Monthly · 1st → last day of each month");
        expect(at("billing_calendar").through).toBe("2027-02-28");
    });

    it("names the scheduled change as scheduled, not as a second current rule", () => {
        expect(at("billing_calendar").scheduled?.sentence).toMatch(/^Weekly/);
        expect(at("billing_calendar").scheduled?.row.effective_start).toBe("2027-03-01");
    });

    it("keeps superseded versions in history only", () => {
        expect(at("billing_calendar").history).toHaveLength(3);
        expect(at("billing_calendar").current?.value).toEqual({ cadence: "monthly" });
    });

    it("reads invoice timing and payment due as sentences", () => {
        expect(at("invoice_timing").sentence).toBe("7 days before the billing period begins");
        expect(at("due_date").sentence).toBe("On the first day of the billing period");
    });

    it("says what an unconfigured rule does instead — never 'no policy — fallback'", () => {
        expect(at("posting_review").isFallback).toBe(true);
        expect(at("posting_review").sentence).toBe(BILLING_TIMING_FALLBACK.posting_review.sentence);
        expect(at("posting_review").sentence).not.toMatch(/fallback/);
    });
});

describe("overrides — only the locations that override, each stating what it inherits", () => {
    const model = buildBillingTimingModel({
        policies: [
            row({ policy_type: "billing_calendar", value: { cadence: "monthly" } }),
            row({ policy_type: "invoice_timing", value: { strategy: "days_before_period_start", offset_days: 7 } }),
            row({ policy_type: "billing_calendar", scope_type: "location", location_id: "loc-ff",
                value: { cadence: "weekly", anchor_on: "2026-09-07" } }),
        ],
        locations: LOCATIONS,
        todayYmd: TODAY,
    });

    it("lists Firefly and not Moonbeam", () => {
        expect(model.overrides.map((o) => o.locationName)).toEqual(["Firefly"]);
    });

    it("Firefly overrides the billing period and inherits everything else", () => {
        const ff = model.overrides[0]!;
        const cal = ff.rules.find((r) => r.rule === "billing_calendar")!;
        const inv = ff.rules.find((r) => r.rule === "invoice_timing")!;
        expect(cal.overridden).toBe(true);
        expect(cal.overridden && cal.reading.sentence).toMatch(/^Weekly/);
        expect(inv.overridden).toBe(false);
        expect(!inv.overridden && inv.inheritedSentence).toBe("7 days before the billing period begins");
    });
});

describe("a missing billing calendar is the one fallback that stops billing", () => {
    it("is flagged, because the binder refuses rather than guessing", () => {
        const model = buildBillingTimingModel({ policies: [], locations: LOCATIONS, todayYmd: TODAY });
        expect(model.blocksBilling).toBe(true);
        expect(BILLING_TIMING_FALLBACK.billing_calendar.blocksBilling).toBe(true);
    });
});
