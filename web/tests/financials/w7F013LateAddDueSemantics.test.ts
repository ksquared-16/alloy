/**
 * W7-F013 — A CHARGE ADDED AFTER ITS PERIOD'S PAYMENT DATE IS DUE WITH THE NEXT PAYMENT.
 *
 * Director rule: billing-period membership, invoice date and the payment-due event are three
 * different facts. Monthly periods, payment due on the 1st: a charge added Oct 14 belongs to October,
 * is invoiced Oct 14, and is due Nov 1 — November's standard payment event — not Oct 14. It may be
 * paid early; it is not due, and it is never past due merely because it exists.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
    resolveChargeDateChain,
    resolveInvoiceTimingRule,
    chargeDateProvenance,
    type ChargeDatePeriod,
} from "@/lib/financials/chargeDates/resolveChargeDateChain";
import { chargeDateChainPreviewLines } from "@/lib/financials/chargeDates/describeChargeDateChain";
import { notYetDueFor, pastDueFor } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

const period = (key: string, startsOn: string, endsOn: string, label: string): ChargeDatePeriod =>
    ({ id: `bp-${key}`, key, label, startsOn, endsOn, status: "open" }) as ChargeDatePeriod;
const OCTOBER = period("2026-10", "2026-10-01", "2026-10-31", "October 2026");
const NOVEMBER = period("2026-11", "2026-11-01", "2026-11-30", "November 2026");

const policy = (type: string, value: Record<string, unknown>): FinancialPolicyRow =>
    ({
        id: `p-${type}`, org_id: "org", scope_type: "org", location_id: null, service_id: null, rate_plan_id: null,
        customer_id: null, policy_type: type, label: null, description: null, value, is_active: true,
        effective_start: "2026-01-01", effective_end: null, source_key: "config", metadata: {},
        created_by: null, updated_by: null, created_at: "", updated_at: "",
    }) as unknown as FinancialPolicyRow;

const MONTHLY_DUE_FIRST = [
    policy("invoice_timing", { strategy: "days_before_period_start", offset_days: 7 }),
    policy("due_date", { strategy: "on_period_start", offset_days: 0 }),
];
const SCOPE = { serviceId: null, customerId: null, locationId: null };

function lateOct14(args: { policies?: FinancialPolicyRow[]; nextPeriod?: ChargeDatePeriod | null } = {}) {
    const policies = args.policies ?? MONTHLY_DUE_FIRST;
    return resolveChargeDateChain({
        serviceDate: "2026-10-14",
        period: OCTOBER,
        invoiceRule: resolveInvoiceTimingRule({
            policies, template: { template_key: "field_trip", billable_on_strategy: "billing_policy", billable_offset_days: null } as never,
            locationId: null, customerId: null, serviceId: null, asOf: OCTOBER.startsOn,
        }),
        policies,
        scope: SCOPE,
        createdOn: "2026-10-14",
        businessDate: "2026-10-14",
        nextPeriod: args.nextPeriod === undefined ? NOVEMBER : args.nextPeriod,
    });
}

describe("the Director's example — Oct 14 add, monthly, due on the 1st", () => {
    const c = lateOct14();

    it("still belongs to the October billing period", () => {
        expect(c.period?.key).toBe("2026-10");
    });

    it("is invoiced the day it is created", () => {
        expect(c.invoice.actual).toBe("2026-10-14");
    });

    it("is due Nov 1, the next standard payment event — not Oct 14", () => {
        expect(c.due.ruleDate, "October's own payment date had passed").toBe("2026-10-01");
        expect(c.due.actual).toBe("2026-11-01");
        expect(c.due.rolledToNextPeriod).toBe(true);
        expect(c.due.clampedToInvoice).toBe(false);
        expect(c.due.nextPeriod?.key).toBe("2026-11");
    });

    it("still posts now — October has begun; posting and due are different facts", () => {
        expect(c.posting.gate).toBe("posts_on_creation");
    });

    it("records why, so the date can be explained later without re-resolving policy", () => {
        const p = chargeDateProvenance(c);
        expect(p.due_rolled_to_next_period).toBe(true);
        expect(p.due_next_period_key).toBe("2026-11");
        expect(p.due_rule_date).toBe("2026-10-01");
    });

    it("says so in the preview", () => {
        const lines = chargeDateChainPreviewLines(c, false);
        expect(lines).toContain("Due 2026-11-01");
        expect(lines.find((l) => l.startsWith("Payment terms"))).toMatch(/due with the next payment/);
    });
});

describe("what does NOT roll", () => {
    it("a charge prepared before its period is due on that period's first day", () => {
        const c = resolveChargeDateChain({
            serviceDate: "2026-11-05", period: NOVEMBER,
            invoiceRule: resolveInvoiceTimingRule({
                policies: MONTHLY_DUE_FIRST, template: { template_key: "field_trip", billable_on_strategy: "billing_policy", billable_offset_days: null } as never,
                locationId: null, customerId: null, serviceId: null, asOf: NOVEMBER.startsOn,
            }),
            policies: MONTHLY_DUE_FIRST, scope: SCOPE, createdOn: "2026-10-20", businessDate: "2026-10-20",
            nextPeriod: null,
        });
        expect(c.due.actual).toBe("2026-11-01");
        expect(c.due.rolledToNextPeriod).toBe(false);
    });

    it("an invoice-relative rule can never precede the invoice, so it never rolls", () => {
        const c = lateOct14({ policies: [policy("due_date", { strategy: "days_after_invoice", offset_days: 10 })] });
        expect(c.due.actual).toBe("2026-10-24");
        expect(c.due.rolledToNextPeriod).toBe(false);
    });

    it("with no next period resolvable, the historical clamp still applies — never a guess", () => {
        const c = lateOct14({ nextPeriod: null });
        expect(c.due.actual).toBe("2026-10-14");
        expect(c.due.clampedToInvoice).toBe(true);
        expect(c.due.rolledToNextPeriod).toBe(false);
    });

    it("no payment terms configured still means no due date", () => {
        const c = lateOct14({ policies: [policy("invoice_timing", { strategy: "on_service_date" })] });
        expect(c.due.actual).toBeNull();
    });
});

describe("not due is not past due, and not 'Due'", () => {
    const row = (over: Record<string, unknown>) =>
        ({ chargeId: "c1", amountCents: 4000, status: "posted", lifecycleStatus: "posted", correctionKind: null, dueDate: "2026-11-01", ...over }) as never;

    it("an Oct 14 add due Nov 1 is not past due on Oct 14", () => {
        expect(pastDueFor([row({})], "2026-10-14")).toBeNull();
    });

    it("it is reported as not yet due, with its payment date", () => {
        expect(notYetDueFor([row({})], "2026-10-14")).toEqual({ amountCents: 4000, nextDueDate: "2026-11-01" });
    });

    it("once paid early it is neither", () => {
        expect(notYetDueFor([row({})], "2026-10-14", new Map([["c1", 4000]]))).toBeNull();
    });

    it("on Nov 2, unpaid, it is past due", () => {
        expect(pastDueFor([row({})], "2026-11-02")?.amountCents).toBe(4000);
        expect(notYetDueFor([row({})], "2026-11-02")).toBeNull();
    });

    it("the card's Due excludes it, and states it beside Due rather than hiding it", () => {
        const adapter = readFileSync(path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts"), "utf8");
        expect(adapter).toMatch(/currentlyCollectibleCents - \(vm\.notYetDue\?\.amountCents \?\? 0\)/);
        const card = readFileSync(path.join(process.cwd(), "components/operationalCards/FinancialsCard.tsx"), "utf8");
        expect(card).toContain("Not yet due ·");
    });
});

describe("the write and the preview ask for the same next period", () => {
    const svc = readFileSync(path.join(process.cwd(), "lib/financials/chargeLifecycle/chargeLifecycleService.ts"), "utf8");
    it("both chain calls pass nextPeriod from the same calendar authority", () => {
        expect(svc.match(/nextPeriod: await nextPeriodAfter\(supabase/g)?.length).toBe(2);
        const fn = svc.slice(svc.indexOf("async function nextPeriodAfter"));
        expect(fn.slice(0, 800)).toMatch(/previewChargeBillingPeriod/);
        expect(fn.slice(0, 800)).toMatch(/addDaysYmd\(args\.period\.endsOn, 1\)/);
    });
});
