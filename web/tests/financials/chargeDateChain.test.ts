/**
 * W7 BILLING CONFIGURATION CONVERGENCE — THE DATE CHAIN, PROVED ON THE DIRECTOR'S OWN EXAMPLE.
 *
 * Baseline: monthly billing periods (1st → last day), invoice 7 days before the period begins, due
 * on the first day of the period, no posting review.
 *
 *   Nov 5 service, charge existed in time     → November · invoiced Oct 25 · due Nov 1
 *   Nov 5 service, created ON Nov 5 (late)    → November · invoiced Nov 5  · due Nov 5 (clamped)
 *   Nov 5 service, template "next cycle"      → STILL November (invoice timing cannot move it)
 *
 * W7-F004 was the third line answering December.
 */
import { describe, expect, it } from "vitest";

import {
    intendedInvoiceDate,
    PLATFORM_DEFAULT_INVOICE_RULE,
    resolveChargeDateChain,
    resolveInvoiceTimingRule,
    type ChargeDatePeriod,
} from "@/lib/financials/chargeDates/resolveChargeDateChain";
import { chargeDateChainPreviewLines } from "@/lib/financials/chargeDates/describeChargeDateChain";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

const NOVEMBER: ChargeDatePeriod = {
    id: "bp-nov",
    key: "2026-11",
    label: "November 2026",
    startsOn: "2026-11-01",
    endsOn: "2026-11-30",
    status: "open",
};

function policy(over: Partial<FinancialPolicyRow>): FinancialPolicyRow {
    return {
        id: over.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
        org_id: "org",
        scope_type: "org",
        location_id: null,
        service_id: null,
        rate_plan_id: null,
        customer_id: null,
        policy_type: "due_date",
        label: null,
        description: null,
        value: {},
        is_active: true,
        effective_start: "2026-01-01",
        effective_end: null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
        ...over,
    } as FinancialPolicyRow;
}

const W7_BASELINE: FinancialPolicyRow[] = [
    policy({ id: "cal", policy_type: "billing_calendar", value: { cadence: "monthly", anchor_on: null } }),
    policy({ id: "inv", policy_type: "invoice_timing", value: { strategy: "days_before_period_start", offset_days: 7 } }),
    policy({ id: "due", policy_type: "due_date", value: { strategy: "on_period_start", offset_days: 0 } }),
];

const FOLLOWS_POLICY = { template_key: "field_trip", billable_on_strategy: "billing_policy", billable_offset_days: null };
const NO_SCOPE = { serviceId: null, customerId: null, locationId: null };

function chain(args: {
    policies?: FinancialPolicyRow[];
    template?: { template_key: string; billable_on_strategy: string; billable_offset_days: number | null };
    createdOn: string;
    businessDate?: string;
    period?: ChargeDatePeriod | null;
}) {
    const policies = args.policies ?? W7_BASELINE;
    const period = args.period === undefined ? NOVEMBER : args.period;
    const rule = resolveInvoiceTimingRule({
        policies,
        template: args.template ?? FOLLOWS_POLICY,
        locationId: null,
        customerId: null,
        serviceId: null,
        asOf: period?.startsOn ?? "2026-11-05",
    });
    return resolveChargeDateChain({
        serviceDate: "2026-11-05",
        period,
        invoiceRule: rule,
        policies,
        scope: NO_SCOPE,
        createdOn: args.createdOn,
        businessDate: args.businessDate ?? args.createdOn,
    });
}

describe("Nov 5 — normal pre-period billing", () => {
    const c = chain({ createdOn: "2026-10-08" });

    it("belongs to November, the period CONTAINING the service date", () => {
        expect(c.period?.label).toBe("November 2026");
        expect(c.period?.startsOn).toBe("2026-11-01");
        expect(c.period?.endsOn).toBe("2026-11-30");
    });

    it("is invoiced 7 days before November begins", () => {
        expect(c.invoice.intended).toBe("2026-10-25");
        expect(c.invoice.actual).toBe("2026-10-25");
        expect(c.invoice.late).toBe(false);
        expect(c.invoice.rule.source).toEqual({ kind: "policy", scope: "org", policyId: "inv" });
    });

    it("is due on the first day of the billing period", () => {
        expect(c.due.ruleDate).toBe("2026-11-01");
        expect(c.due.actual).toBe("2026-11-01");
        expect(c.due.clampedToInvoice).toBe(false);
    });

    it("waits for its period — a draft until Nov 1, then it posts itself", () => {
        expect(c.posting).toEqual({ gate: "awaits_period", notBefore: "2026-11-01" });
    });
});

describe("Nov 5 — created late, on Nov 5", () => {
    const c = chain({ createdOn: "2026-11-05" });

    it("still belongs to November", () => {
        expect(c.period?.key).toBe("2026-11");
    });

    it("is invoiced the day it is created, never Oct 25 — it did not exist then", () => {
        expect(c.invoice.intended).toBe("2026-10-25");
        expect(c.invoice.actual).toBe("2026-11-05");
        expect(c.invoice.late).toBe(true);
    });

    it("is due on its invoice date, never before it — the period-start rule had passed", () => {
        expect(c.due.ruleDate).toBe("2026-11-01");
        expect(c.due.actual).toBe("2026-11-05");
        expect(c.due.clampedToInvoice).toBe(true);
    });

    it("posts on creation, because November has begun", () => {
        expect(c.posting).toEqual({ gate: "posts_on_creation", notBefore: null });
    });

    it("says so in the preview, with the rule and the date it would have been", () => {
        const lines = chargeDateChainPreviewLines(c, false);
        expect(lines).toContain("Billing period November 2026 · 2026-11-01 → 2026-11-30");
        expect(lines).toContain("Invoice date 2026-11-05");
        expect(lines.find((l) => l.startsWith("Invoice timing"))).toMatch(/would be 2026-10-25; this charge is added later/);
        expect(lines).toContain("Due 2026-11-05");
        expect(lines.find((l) => l.startsWith("Payment terms"))).toMatch(/would be 2026-11-01, before this charge is invoiced/);
        expect(lines.find((l) => l.startsWith("Posting"))).toMatch(/Posts on confirm/);
    });
});

describe("invoice timing has NO authority over billing-period membership (W7-F004)", () => {
    it("a template billing 'next cycle' still leaves a Nov 5 obligation in November", () => {
        const c = chain({
            template: { template_key: "tuition", billable_on_strategy: "next_billing_cycle", billable_offset_days: null },
            createdOn: "2026-10-08",
        });
        expect(c.period?.key, "the period is the service date's").toBe("2026-11");
        expect(c.invoice.actual, "invoiced when the NEXT period begins").toBe("2026-12-01");
        expect(c.invoice.rule.source.kind).toBe("template");
        /* Due on period start would precede that invoice, so it is due on the invoice date. */
        expect(c.due.actual).toBe("2026-12-01");
        expect(c.due.clampedToInvoice).toBe(true);
    });

    it("the period is an input to the chain, never derived from the invoice date", () => {
        const c = chain({ createdOn: "2026-10-08", period: NOVEMBER });
        expect(c.period).toBe(NOVEMBER);
    });
});

describe("the invoice-timing rule and its sources", () => {
    it("a template exception beats the organization policy", () => {
        const r = resolveInvoiceTimingRule({
            policies: W7_BASELINE,
            template: { template_key: "late_pickup", billable_on_strategy: "immediate", billable_offset_days: null },
            locationId: null, customerId: null, serviceId: null, asOf: "2026-11-01",
        });
        expect(r.strategy).toBe("on_service_date");
        expect(r.source.kind).toBe("template");
    });

    it("a location override beats the organization default", () => {
        const policies = [
            ...W7_BASELINE,
            policy({ id: "inv-loc", policy_type: "invoice_timing", scope_type: "location", location_id: "loc-ff",
                value: { strategy: "days_before_period_start", offset_days: 3 } }),
        ];
        const at = resolveInvoiceTimingRule({ policies, template: FOLLOWS_POLICY, locationId: "loc-ff", customerId: null, serviceId: null, asOf: "2026-11-01" });
        expect(at.offsetDays).toBe(3);
        expect(at.source).toEqual({ kind: "policy", scope: "location", policyId: "inv-loc" });
        const elsewhere = resolveInvoiceTimingRule({ policies, template: FOLLOWS_POLICY, locationId: "loc-other", customerId: null, serviceId: null, asOf: "2026-11-01" });
        expect(elsewhere.offsetDays).toBe(7);
    });

    it("a scheduled change governs the periods that begin after it, not before", () => {
        const policies = [
            policy({ id: "inv-now", policy_type: "invoice_timing", value: { strategy: "days_before_period_start", offset_days: 7 }, effective_end: "2027-02-28" }),
            policy({ id: "inv-mar", policy_type: "invoice_timing", effective_start: "2027-03-01", value: { strategy: "on_service_date", offset_days: 0 } }),
        ];
        const feb = resolveInvoiceTimingRule({ policies, template: FOLLOWS_POLICY, locationId: null, customerId: null, serviceId: null, asOf: "2027-02-01" });
        const mar = resolveInvoiceTimingRule({ policies, template: FOLLOWS_POLICY, locationId: null, customerId: null, serviceId: null, asOf: "2027-03-01" });
        expect(feb.source).toMatchObject({ policyId: "inv-now" });
        expect(mar.source).toMatchObject({ policyId: "inv-mar" });
    });

    it("nothing configured falls to the platform default, and says so", () => {
        const r = resolveInvoiceTimingRule({ policies: [], template: FOLLOWS_POLICY, locationId: null, customerId: null, serviceId: null, asOf: "2026-11-01" });
        expect(r).toEqual(PLATFORM_DEFAULT_INVOICE_RULE);
        const c = chain({ policies: [], createdOn: "2026-10-08" });
        expect(c.invoice.actual, "on the service date").toBe("2026-11-05");
        expect(c.due.actual, "no terms configured — no due date, never 'due today'").toBeNull();
        expect(chargeDateChainPreviewLines(c, false).find((l) => l.startsWith("Invoice timing"))).toMatch(/platform default/);
    });

    it("lead 0 is 'on the first day of the period'", () => {
        expect(intendedInvoiceDate({ strategy: "days_before_period_start", offsetDays: 0, source: { kind: "platform_default" } }, "2026-11-05", NOVEMBER))
            .toBe("2026-11-01");
    });
});

describe("posting review stays independent of the calendar gate", () => {
    it("a current-period charge held by review says so", () => {
        const c = chain({ createdOn: "2026-11-05" });
        expect(chargeDateChainPreviewLines(c, true).find((l) => l.startsWith("Posting"))).toMatch(/posting review/);
    });

    it("a future-period charge under review waits for its period, then for review", () => {
        const c = chain({ createdOn: "2026-10-08" });
        expect(chargeDateChainPreviewLines(c, true).find((l) => l.startsWith("Posting"))).toMatch(/Draft until 2026-11-01.*then waits for posting review/);
    });

    it("no resolved period promises nothing about posting", () => {
        const c = chain({ createdOn: "2026-10-08", period: null });
        expect(c.posting.gate).toBe("period_unknown");
    });
});

describe("a recalculated draft keeps the invoice date it was created with", () => {
    it("measures lateness against the day it was created, not the day it was recalculated", () => {
        const c = chain({ createdOn: "2026-10-08", businessDate: "2026-11-10" });
        expect(c.invoice.actual).toBe("2026-10-25");
        expect(c.invoice.late).toBe(false);
    });
});

describe("every reader places a chain-written charge in its BOUND period, not its invoice month", async () => {
    const { placeInBillingPeriod } = await import("@/lib/financials/billingPeriod");
    const written = {
        service_date: "2026-11-05",
        occurs_on: "2026-11-05",
        billable_on: "2026-10-25",
        metadata: { charge_dates: { period_key: "2026-11" } },
    };

    it("the ledger, the card and the journal group a Nov 5 charge invoiced Oct 25 under November", () => {
        expect(placeInBillingPeriod(written)).toEqual({ key: "2026-11", basis: "bound" });
    });

    it("a weekly grain places it by its service date, never by its invoice date", () => {
        const key = placeInBillingPeriod(written, { cadence: "weekly", anchor: "2026-11-02" }).key;
        expect(key).toBe("2026-11-02~2026-11-08");
    });

    it("a legacy charge with no recorded period is placed exactly as before — history is not restated", () => {
        const legacy = { service_date: "2026-11-05", occurs_on: "2026-11-05", billable_on: "2026-12-01", metadata: {} };
        expect(placeInBillingPeriod(legacy)).toEqual({ key: "2026-12", basis: "billable_on" });
    });
});
