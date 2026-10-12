/**
 * W7-F011 — FINANCIAL DATES READ AS DATES, AND THE POLICY PAGE READS AS A SUMMARY.
 *
 * The Director's examples are the contract: "October 2026", "Oct 12–25, 2026", "Oct 26–Nov 8,
 * 2026", "Oct 19, 2026". Nothing operator-facing leads with a year-first ISO date; APIs and audit
 * payloads keep ISO. The organization default is one row of four rules and the overrides are one
 * table, with inheritance explained once rather than under every inherited cell.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { humanDay, humanRange, humanizeIsoDatesIn, weekdayShort } from "@/lib/financials/dates/humanDates";
import {
    billingCalendarSentence,
    billingCalendarShort,
    dueRuleShort,
    invoiceRuleShort,
} from "@/lib/financials/chargeDates/describeChargeDateChain";
import { buildBillingTimingModel, ruleShort } from "@/lib/financials/policies/billingTimingViewModel";
import { policyValueSummary } from "@/lib/financials/policies/financialPolicyTypes";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("the Director's four date shapes", () => {
    it("monthly", () => expect(humanRange("2026-10-01", "2026-10-31")).toBe("October 2026"));
    it("same-month interval", () => expect(humanRange("2026-10-12", "2026-10-25")).toBe("Oct 12–25, 2026"));
    it("cross-month interval", () => expect(humanRange("2026-10-26", "2026-11-08")).toBe("Oct 26–Nov 8, 2026"));
    it("single date", () => expect(humanDay("2026-10-19")).toBe("Oct 19, 2026"));
    it("cross-year interval names both years", () =>
        expect(humanRange("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026–Jan 3, 2027"));
    it("an open-ended range", () => expect(humanRange("2026-09-01", null)).toBe("From Sep 1, 2026"));
    it("no time zone can move a calendar day", () => expect(humanDay("2026-01-01")).toBe("Jan 1, 2026"));
    it("embedded ISO in a sentence is rewritten, nothing else is", () =>
        expect(humanizeIsoDatesIn("Draft until 2026-11-01 — then posts")).toBe("Draft until Nov 1, 2026 — then posts"));
    it("weekday of a day", () => expect(weekdayShort("2026-01-07")).toBe("Wed"));
});

describe("billing calendars in words — no ISO anchor", () => {
    it("weekly names the weekday span and a human start", () => {
        const s = billingCalendarSentence("weekly", "2026-01-07");
        expect(s).toMatch(/^Weekly · Wed–Tue/);
        expect(s).toContain("Jan 7, 2026");
        expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });
    it("annual names a month and day", () => expect(billingCalendarSentence("annual", "2026-09-01")).toBe("Annual · each year from Sep 1"));
    it("a policy value with a date field reads as a date", () => {
        const summary = policyValueSummary("billing_calendar", { cadence: "weekly", anchor_on: "2026-01-05" });
        expect(summary).toContain("Jan 5, 2026");
        expect(summary).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });
});

describe("the short forms the compact summary reads", () => {
    it("matches the Director's example row", () => {
        expect(billingCalendarShort("monthly", null)).toBe("Monthly · 1st–last day");
        expect(invoiceRuleShort("days_before_period_start", 7)).toBe("7 days before period");
        expect(dueRuleShort("on_period_start", 0)).toBe("1st day of period");
        expect(ruleShort("posting_review", { required: false })).toBe("None");
    });
    it("names weekly overrides by their weekday span", () => {
        expect(billingCalendarShort("weekly", "2026-01-07")).toBe("Weekly · Wed–Tue");
        expect(billingCalendarShort("weekly", "2026-01-05")).toBe("Weekly · Mon–Sun");
    });
});

const row = (over: Partial<FinancialPolicyRow>): FinancialPolicyRow =>
    ({
        id: Math.random().toString(36).slice(2), org_id: "o", scope_type: "org", location_id: null, service_id: null,
        rate_plan_id: null, customer_id: null, policy_type: "billing_calendar", label: null, description: null,
        value: {}, is_active: true, effective_start: "2026-01-01", effective_end: null, source_key: "config",
        metadata: {}, created_by: null, updated_by: null, created_at: "", updated_at: "",
        ...over,
    }) as FinancialPolicyRow;

describe("the overrides table shows the whole location topology", () => {
    const model = buildBillingTimingModel({
        policies: [
            row({ policy_type: "billing_calendar", value: { cadence: "monthly" } }),
            row({ policy_type: "billing_calendar", scope_type: "location", location_id: "south", value: { cadence: "weekly", anchor_on: "2026-01-07" } }),
            row({ policy_type: "billing_calendar", scope_type: "location", location_id: "west", value: { cadence: "weekly", anchor_on: "2026-01-05" } }),
        ],
        locations: [
            { id: "north", name: "North Campus" },
            { id: "south", name: "South Campus" },
            { id: "west", name: "West Campus" },
        ],
        todayYmd: "2026-10-12",
    });

    it("overriding locations carry their short answer", () => {
        const south = model.overrides.find((o) => o.locationName === "South Campus")!;
        const cal = south.rules.find((r) => r.rule === "billing_calendar")!;
        expect(cal.overridden && cal.reading.short).toBe("Weekly · Wed–Tue");
    });

    it("and every other location is listed as inheriting, rather than left out", () => {
        expect(model.inheritingLocations.map((l) => l.locationName)).toEqual(["North Campus"]);
    });

    it("the org default reads in short form too", () => {
        expect(model.orgDefault.find((r) => r.rule === "billing_calendar")!.short).toBe("Monthly · 1st–last day");
    });
});

describe("the panel's shape", () => {
    const src = read("components/adminV2/settings/financials/policies/BillingTimingConfigurationPanel.tsx");

    it("the organization default is one grid of four, not four stacked sections", () => {
        expect(src).toContain('data-testid="billing-timing-org-summary"');
        expect(src).toMatch(/xl:grid-cols-4/);
    });

    it("overrides are a table with a column per rule", () => {
        expect(src).toContain('data-testid="billing-timing-overrides-table"');
        expect(src).toMatch(/BILLING_TIMING_RULES\.map\(\(rule\) => \(\s*<th/);
    });

    it("inheritance is one word in a cell — the long sentence is not repeated under every location", () => {
        expect(src).not.toMatch(/Inherits organization default · \{/);
        const cell = src.slice(src.indexOf("function InheritsCell"));
        expect(cell).toMatch(/>\s*Inherits\s*</);
    });

    it("CURRENT, SCHEDULED and HISTORY stay distinct, and history is expandable", () => {
        expect(src).toMatch(/data-testid=\{`billing-timing-scheduled-/);
        expect(src).toMatch(/>Scheduled</);
        expect(src).toMatch(/historyOpen \? "Hide history" : "History"/);
        expect(src).toMatch(/function RuleHistory/);
    });

    it("history ranges read as human intervals, not ISO arrows", () => {
        expect(src).toContain("humanRange(row.effective_start, row.effective_end)");
        expect(src).not.toContain("formatEffectiveRange");
    });

    it("the per-rule explanation is not printed under every rule", () => {
        expect(src).not.toContain("BILLING_TIMING_RULE_DERIVES");
    });
});
