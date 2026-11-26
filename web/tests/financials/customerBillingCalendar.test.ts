/**
 * WHICH COMMERCIAL CALENDAR GOVERNS AN ACCOUNT — and what happens when nothing legitimately can.
 *
 * The billing period is the period the customer is billed for, so the calendar is the account's. A
 * location configures the DEFAULT, which is why two locations may bill differently. The case these
 * tests exist for is the one the deployed census found: 3 of 10 households have children at two
 * locations, and 28 posted charges bind to the household rather than to any agreement and so reach
 * no location at all. For those accounts there is no location to inherit from, and guessing one
 * would invent the clock that finality is measured against.
 */
import { describe, expect, it } from "vitest";
import { resolveCustomerBillingCalendar } from "@/lib/financials/billingPeriods/resolveCustomerBillingCalendar";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

let seq = 0;
function policy(
    p: Partial<FinancialPolicyRow> & { scope_type: FinancialPolicyRow["scope_type"] },
): FinancialPolicyRow {
    seq += 1;
    return {
        id: p.id ?? `pol-${seq}`,
        org_id: "org-1",
        scope_type: p.scope_type,
        location_id: p.location_id ?? null,
        service_id: p.service_id ?? null,
        rate_plan_id: p.rate_plan_id ?? null,
        customer_id: p.customer_id ?? null,
        policy_type: p.policy_type ?? "billing_calendar",
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

const ON = "2026-11-12";
const CUST = "cust-1";
const monthlyAt = (locationId: string, id: string) =>
    policy({ id, scope_type: "location", location_id: locationId, value: { cadence: "monthly" } });
const weeklyAt = (locationId: string, anchor: string, id: string) =>
    policy({ id, scope_type: "location", location_id: locationId, value: { cadence: "weekly", anchor_on: anchor } });

describe("a single-location account inherits its location's calendar", () => {
    it("inherits, and records WHICH location supplied the bounds", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [monthlyAt("loc-A", "pol-A")],
            activeLocationIds: ["loc-A"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("resolved");
        if (r.kind !== "resolved") return;
        expect(r.cadence).toBe("monthly");
        expect(r.scope).toBe("location");
        expect(r.sourceLocationId).toBe("loc-A");
        expect(r.policyId).toBe("pol-A");
        /* Monthly IS the calendar month, so it tiles from nothing. */
        expect(r.anchorOn).toBeNull();
    });

    it("two accounts at the same location resolve the same configuration", () => {
        const policies = [monthlyAt("loc-A", "pol-A")];
        const one = resolveCustomerBillingCalendar({ policies, activeLocationIds: ["loc-A"], customerId: "cust-1", onDate: ON });
        const two = resolveCustomerBillingCalendar({ policies, activeLocationIds: ["loc-A"], customerId: "cust-2", onDate: ON });
        expect(one).toEqual(two);
    });

    it("different locations may legitimately differ — same org, same day", () => {
        const policies = [monthlyAt("loc-A", "pol-A"), weeklyAt("loc-B", "2026-01-05", "pol-B")];
        const a = resolveCustomerBillingCalendar({ policies, activeLocationIds: ["loc-A"], customerId: CUST, onDate: ON });
        const b = resolveCustomerBillingCalendar({ policies, activeLocationIds: ["loc-B"], customerId: CUST, onDate: ON });
        expect(a.kind === "resolved" && a.cadence).toBe("monthly");
        expect(b.kind === "resolved" && b.cadence).toBe("weekly");
        expect(b.kind === "resolved" && b.anchorOn).toBe("2026-01-05");
    });

    it("two weekly locations may anchor on different days", () => {
        const policies = [weeklyAt("loc-A", "2026-01-05", "pol-A"), weeklyAt("loc-B", "2026-01-07", "pol-B")];
        const a = resolveCustomerBillingCalendar({ policies, activeLocationIds: ["loc-A"], customerId: CUST, onDate: ON });
        const b = resolveCustomerBillingCalendar({ policies, activeLocationIds: ["loc-B"], customerId: CUST, onDate: ON });
        expect(a.kind === "resolved" && a.anchorOn).toBe("2026-01-05");
        expect(b.kind === "resolved" && b.anchorOn).toBe("2026-01-07");
    });
});

describe("a multi-location account does NOT arbitrarily inherit", () => {
    it("refuses, and names the locations in conflict", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [monthlyAt("loc-A", "pol-A"), weeklyAt("loc-B", "2026-01-05", "pol-B")],
            activeLocationIds: ["loc-B", "loc-A"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("ambiguous_locations");
        if (r.kind !== "ambiguous_locations") return;
        expect(r.locationIds).toEqual(["loc-A", "loc-B"]);
    });

    it("refuses even when both locations agree — agreement is not authority", () => {
        /*
         * Two monthly locations produce the same cadence, so inheriting would LOOK harmless. It is
         * still a clock nobody chose: the moment one location changes cadence the account's
         * finality moves without anyone configuring it.
         */
        const r = resolveCustomerBillingCalendar({
            policies: [monthlyAt("loc-A", "pol-A"), monthlyAt("loc-B", "pol-B")],
            activeLocationIds: ["loc-A", "loc-B"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("ambiguous_locations");
    });

    it("does NOT fall back to the org default to escape the ambiguity", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [
                policy({ scope_type: "org", value: { cadence: "monthly" } }),
                monthlyAt("loc-A", "pol-A"),
                weeklyAt("loc-B", "2026-01-05", "pol-B"),
            ],
            activeLocationIds: ["loc-A", "loc-B"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("ambiguous_locations");
    });

    it("an EXPLICIT account calendar resolves the ambiguity, and wins outright", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [
                monthlyAt("loc-A", "pol-A"),
                weeklyAt("loc-B", "2026-01-05", "pol-B"),
                policy({ id: "pol-acct", scope_type: "customer", customer_id: CUST, value: { cadence: "biweekly", anchor_on: "2026-01-05" } }),
            ],
            activeLocationIds: ["loc-A", "loc-B"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("resolved");
        if (r.kind !== "resolved") return;
        expect(r.cadence).toBe("biweekly");
        expect(r.scope).toBe("customer");
        expect(r.policyId).toBe("pol-acct");
        /* The account calendar asserts no location membership, so it names none. */
        expect(r.sourceLocationId).toBeNull();
    });

    it("an explicit calendar belonging to ANOTHER account does not answer", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [
                monthlyAt("loc-A", "pol-A"),
                weeklyAt("loc-B", "2026-01-05", "pol-B"),
                policy({ scope_type: "customer", customer_id: "someone-else", value: { cadence: "biweekly", anchor_on: "2026-01-05" } }),
            ],
            activeLocationIds: ["loc-A", "loc-B"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("ambiguous_locations");
    });
});

describe("the account calendar beats an inherited default for single-location accounts too", () => {
    it("explicit customer wins over the location it attends", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [
                monthlyAt("loc-A", "pol-A"),
                policy({ id: "pol-acct", scope_type: "customer", customer_id: CUST, value: { cadence: "weekly", anchor_on: "2026-01-05" } }),
            ],
            activeLocationIds: ["loc-A"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind === "resolved" && r.scope).toBe("customer");
        expect(r.kind === "resolved" && r.cadence).toBe("weekly");
    });
});

describe("accounts with no active location", () => {
    it("fall to the org default rather than reporting ambiguity", () => {
        /* A household between enrolments still holds posted household-grain economics. */
        const r = resolveCustomerBillingCalendar({
            policies: [policy({ id: "pol-org", scope_type: "org", value: { cadence: "monthly" } })],
            activeLocationIds: [],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("resolved");
        if (r.kind !== "resolved") return;
        expect(r.scope).toBe("org");
        expect(r.sourceLocationId).toBeNull();
    });

    it("report unconfigured when nothing is configured at any applicable scope", () => {
        const r = resolveCustomerBillingCalendar({ policies: [], activeLocationIds: ["loc-A"], customerId: CUST, onDate: ON });
        expect(r.kind).toBe("unconfigured");
    });
});

describe("configuration that could not produce a period is refused, not honoured", () => {
    it("a cadence the period authority cannot tile is invalid", () => {
        /*
         * `semi_monthly` and `term` are offered by the OLDER `billing_cadence` menu and cannot be
         * tiled by `billingPeriod.ts`. A calendar configured to one would fail at use, so it is
         * rejected at resolution instead.
         */
        for (const cadence of ["semi_monthly", "term", "", "fortnightly"]) {
            const r = resolveCustomerBillingCalendar({
                policies: [policy({ id: "bad", scope_type: "location", location_id: "loc-A", value: { cadence } })],
                activeLocationIds: ["loc-A"],
                customerId: CUST,
                onDate: ON,
            });
            expect(r.kind, `cadence ${cadence || "(empty)"}`).toBe("invalid_policy");
        }
    });

    it("an anchor-sensitive cadence without an anchor is invalid", () => {
        for (const cadence of ["weekly", "biweekly", "daily", "annual"]) {
            const r = resolveCustomerBillingCalendar({
                policies: [policy({ id: "bad", scope_type: "location", location_id: "loc-A", value: { cadence } })],
                activeLocationIds: ["loc-A"],
                customerId: CUST,
                onDate: ON,
            });
            expect(r.kind, `cadence ${cadence}`).toBe("invalid_policy");
            if (r.kind !== "invalid_policy") continue;
            expect(r.reason).toBe("anchor_missing");
        }
    });

    it("monthly needs no anchor, and discards one it is given", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [policy({ scope_type: "location", location_id: "loc-A", value: { cadence: "monthly", anchor_on: "2026-01-05" } })],
            activeLocationIds: ["loc-A"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("resolved");
        if (r.kind !== "resolved") return;
        expect(r.anchorOn).toBeNull();
        expect(r.snapshot).toEqual({ cadence: "monthly", anchor_on: null });
    });
});

describe("the commercial clock is the account's, not the product's", () => {
    it("a service- or rate_plan-scoped calendar does not govern an account", () => {
        for (const p of [
            policy({ scope_type: "service", service_id: "svc-1", value: { cadence: "weekly", anchor_on: "2026-01-05" } }),
            policy({ scope_type: "rate_plan", rate_plan_id: "plan-1", value: { cadence: "weekly", anchor_on: "2026-01-05" } }),
        ]) {
            const r = resolveCustomerBillingCalendar({
                policies: [p],
                activeLocationIds: ["loc-A"],
                customerId: CUST,
                onDate: ON,
            });
            expect(r.kind, p.scope_type).toBe("unconfigured");
        }
    });
});

describe("effective dating is honoured", () => {
    it("a calendar not yet effective does not answer, and an ended one stops answering", () => {
        const future = resolveCustomerBillingCalendar({
            policies: [policy({ scope_type: "location", location_id: "loc-A", effective_start: "2027-01-01", value: { cadence: "monthly" } })],
            activeLocationIds: ["loc-A"],
            customerId: CUST,
            onDate: ON,
        });
        expect(future.kind).toBe("unconfigured");
        const ended = resolveCustomerBillingCalendar({
            policies: [policy({ scope_type: "location", location_id: "loc-A", effective_end: "2026-06-30", value: { cadence: "monthly" } })],
            activeLocationIds: ["loc-A"],
            customerId: CUST,
            onDate: ON,
        });
        expect(ended.kind).toBe("unconfigured");
    });

    it("an inactive calendar does not answer", () => {
        const r = resolveCustomerBillingCalendar({
            policies: [policy({ scope_type: "location", location_id: "loc-A", is_active: false, value: { cadence: "monthly" } })],
            activeLocationIds: ["loc-A"],
            customerId: CUST,
            onDate: ON,
        });
        expect(r.kind).toBe("unconfigured");
    });
});
