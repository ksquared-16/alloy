import { describe, expect, it } from "vitest";
import {
    resolveRate,
    resolveRatePlan,
    resolveRateRule,
} from "@/lib/financials/rates/resolveRate";
import type {
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
    BillingBasis,
    CalculationStrategy,
    RateBasis,
    ScheduleBasis,
} from "@/lib/financials/rates/rateTypes";

const ORG = "org-1";
const SITE = "site-1";
const PROGRAM = "prog-1";
const ROOM = "room-1";

let seq = 0;
function planId(): string {
    return `plan-${++seq}`;
}

function makePlan(p: Partial<ChildcareRatePlanRow> & Pick<ChildcareRatePlanRow, "scope_type">): ChildcareRatePlanRow {
    return {
        id: p.id ?? planId(),
        org_id: ORG,
        scope_type: p.scope_type,
        site_location_id: p.site_location_id ?? null,
        program_category_id: p.program_category_id ?? null,
        room_location_id: p.room_location_id ?? null,
        age_group_key: p.age_group_key ?? null,
        plan_key: p.plan_key ?? "standard",
        label: p.label ?? null,
        currency_code: p.currency_code ?? "USD",
        billing_basis: (p.billing_basis ?? "monthly") as BillingBasis,
        calculation_strategy: (p.calculation_strategy ?? "scheduled") as CalculationStrategy,
        proration_method: p.proration_method ?? null,
        billing_cadence: p.billing_cadence ?? null,
        is_active: p.is_active ?? true,
        effective_start: p.effective_start ?? "2026-01-01",
        effective_end: p.effective_end ?? null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

let ruleSeq = 0;
function makeRule(
    ratePlanId: string,
    scheduleBasis: ScheduleBasis,
    rateBasis: RateBasis,
    amountCents: number,
    extra: Partial<ChildcareRateRuleRow> = {}
): ChildcareRateRuleRow {
    return {
        id: extra.id ?? `rule-${++ruleSeq}`,
        org_id: ORG,
        rate_plan_id: ratePlanId,
        schedule_basis: scheduleBasis,
        rate_basis: rateBasis,
        age_group_key: extra.age_group_key ?? null,
        amount_cents: amountCents,
        effective_start: extra.effective_start ?? "2026-01-01",
        effective_end: extra.effective_end ?? null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

describe("Rate Resolution (P3.2) — plan inheritance", () => {
    it("most-specific scope wins: room > program > site > org", () => {
        const orgPlan = makePlan({ scope_type: "org", id: "p-org" });
        const sitePlan = makePlan({ scope_type: "site", site_location_id: SITE, id: "p-site" });
        const progPlan = makePlan({ scope_type: "program", program_category_id: PROGRAM, id: "p-prog" });
        const roomPlan = makePlan({ scope_type: "room", room_location_id: ROOM, id: "p-room" });
        const plans = [orgPlan, sitePlan, progPlan, roomPlan];

        expect(
            resolveRatePlan(plans, { scheduleBasis: "five_day", roomLocationId: ROOM, programCategoryId: PROGRAM, siteLocationId: SITE }, "2026-03-01")?.id
        ).toBe("p-room");
        expect(
            resolveRatePlan(plans, { scheduleBasis: "five_day", programCategoryId: PROGRAM, siteLocationId: SITE }, "2026-03-01")?.id
        ).toBe("p-prog");
        expect(
            resolveRatePlan(plans, { scheduleBasis: "five_day", siteLocationId: SITE }, "2026-03-01")?.id
        ).toBe("p-site");
        expect(resolveRatePlan(plans, { scheduleBasis: "five_day" }, "2026-03-01")?.id).toBe("p-org");
    });

    it("excludes inactive plans and honors planKey disambiguation", () => {
        const standard = makePlan({ scope_type: "org", id: "p-std", plan_key: "standard" });
        const premium = makePlan({ scope_type: "org", id: "p-prem", plan_key: "premium" });
        const inactive = makePlan({ scope_type: "site", site_location_id: SITE, id: "p-off", is_active: false });
        const plans = [standard, premium, inactive];

        expect(resolveRatePlan(plans, { scheduleBasis: "five_day", planKey: "premium" }, "2026-03-01")?.id).toBe("p-prem");
        // inactive site plan is skipped → falls back to org standard
        expect(resolveRatePlan(plans, { scheduleBasis: "five_day", siteLocationId: SITE, planKey: "standard" }, "2026-03-01")?.id).toBe("p-std");
    });
});

describe("Rate Resolution (P3.2) — effective dating", () => {
    it("selects the rule effective on the date; latest start wins on overlap", () => {
        const rules = [
            makeRule("p", "five_day", "monthly", 120000, { id: "r-2026", effective_start: "2026-01-01", effective_end: "2026-08-31" }),
            makeRule("p", "five_day", "monthly", 135000, { id: "r-2026b", effective_start: "2026-09-01" }),
        ];
        expect(resolveRateRule(rules, "p", { scheduleBasis: "five_day" }, "2026-03-15")?.id).toBe("r-2026");
        expect(resolveRateRule(rules, "p", { scheduleBasis: "five_day" }, "2026-10-01")?.id).toBe("r-2026b");
    });

    it("returns null before a rule's effective_start", () => {
        const rules = [makeRule("p", "five_day", "monthly", 120000, { effective_start: "2026-09-01" })];
        expect(resolveRateRule(rules, "p", { scheduleBasis: "five_day" }, "2026-03-01")).toBeNull();
    });

    it("unresolved plan returns no_plan; unresolved rule returns no_rule with the plan", () => {
        const plan = makePlan({ scope_type: "site", site_location_id: SITE, id: "p" });
        const rules = [makeRule("p", "five_day", "monthly", 120000)];
        const noPlan = resolveRate({ plans: [plan], rules, context: { scheduleBasis: "five_day" }, dateYmd: "2026-03-01" });
        expect(noPlan).toEqual({ resolved: false, reason: "no_plan", plan: null });

        const noRule = resolveRate({ plans: [plan], rules, context: { scheduleBasis: "drop_in", siteLocationId: SITE }, dateYmd: "2026-03-01" });
        expect(noRule.resolved).toBe(false);
        if (!noRule.resolved) {
            expect(noRule.reason).toBe("no_rule");
            expect(noRule.plan?.id).toBe("p");
        }
    });
});

describe("Rate Resolution (P3.2) — schedule basis variants", () => {
    const plan = makePlan({ scope_type: "org", id: "p" });
    const rules = [
        makeRule("p", "three_day", "monthly", 90000, { id: "r3" }),
        makeRule("p", "four_day", "monthly", 110000, { id: "r4" }),
        makeRule("p", "five_day", "monthly", 130000, { id: "r5" }),
        makeRule("p", "full_day", "daily", 8000, { id: "rfull" }),
        makeRule("p", "half_day", "daily", 4500, { id: "rhalf" }),
        makeRule("p", "hourly", "hourly", 1500, { id: "rhr" }),
        makeRule("p", "drop_in", "session", 7500, { id: "rdi" }),
    ];

    it("distinguishes 3-day vs 4-day vs 5-day", () => {
        expect(resolveRate({ plans: [plan], rules, context: { scheduleBasis: "three_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, amountCents: 90000, rateBasis: "monthly" });
        expect(resolveRate({ plans: [plan], rules, context: { scheduleBasis: "four_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, amountCents: 110000 });
        expect(resolveRate({ plans: [plan], rules, context: { scheduleBasis: "five_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, amountCents: 130000 });
    });

    it("distinguishes full-day vs half-day", () => {
        expect(resolveRate({ plans: [plan], rules, context: { scheduleBasis: "full_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, amountCents: 8000, rateBasis: "daily" });
        expect(resolveRate({ plans: [plan], rules, context: { scheduleBasis: "half_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, amountCents: 4500, rateBasis: "daily" });
    });

    it("supports weekly / monthly / annual / hourly / session rate bases", () => {
        const wkPlan = makePlan({ scope_type: "org", id: "pw" });
        const wkRules = [
            makeRule("pw", "five_day", "weekly", 30000, { id: "wk" }),
            makeRule("pw", "four_day", "annual", 1200000, { id: "an" }),
            makeRule("pw", "three_day", "monthly", 90000, { id: "mo" }),
            makeRule("pw", "hourly", "hourly", 1500, { id: "hr" }),
            makeRule("pw", "drop_in", "session", 7500, { id: "se" }),
        ];
        expect(resolveRate({ plans: [wkPlan], rules: wkRules, context: { scheduleBasis: "five_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, rateBasis: "weekly", amountCents: 30000 });
        expect(resolveRate({ plans: [wkPlan], rules: wkRules, context: { scheduleBasis: "four_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, rateBasis: "annual", amountCents: 1200000 });
        expect(resolveRate({ plans: [wkPlan], rules: wkRules, context: { scheduleBasis: "three_day" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, rateBasis: "monthly" });
        expect(resolveRate({ plans: [wkPlan], rules: wkRules, context: { scheduleBasis: "hourly" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, rateBasis: "hourly" });
        expect(resolveRate({ plans: [wkPlan], rules: wkRules, context: { scheduleBasis: "drop_in" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, rateBasis: "session" });
    });
});

describe("Rate Resolution (P3.2) — age group + currency", () => {
    it("age-group-specific rule beats age-group-null rule", () => {
        const rules = [
            makeRule("p", "five_day", "monthly", 130000, { id: "generic", age_group_key: null }),
            makeRule("p", "five_day", "monthly", 150000, { id: "infant", age_group_key: "infant" }),
        ];
        expect(resolveRateRule(rules, "p", { scheduleBasis: "five_day", ageGroupKey: "infant" }, "2026-03-01")?.id).toBe("infant");
        expect(resolveRateRule(rules, "p", { scheduleBasis: "five_day", ageGroupKey: "toddler" }, "2026-03-01")?.id).toBe("generic");
        expect(resolveRateRule(rules, "p", { scheduleBasis: "five_day" }, "2026-03-01")?.id).toBe("generic");
    });

    it("returns the plan currency on the resolved rate (rules inherit currency)", () => {
        const usd = makePlan({ scope_type: "org", id: "usd", currency_code: "USD" });
        const cad = makePlan({ scope_type: "site", site_location_id: SITE, id: "cad", currency_code: "CAD" });
        const rules = [makeRule("usd", "five_day", "monthly", 130000), makeRule("cad", "five_day", "monthly", 140000)];
        const r = resolveRate({ plans: [usd, cad], rules, context: { scheduleBasis: "five_day", siteLocationId: SITE }, dateYmd: "2026-03-01" });
        expect(r).toMatchObject({ resolved: true, currencyCode: "CAD" });
    });

    it("propagates the plan calculation_strategy on the resolved rate", () => {
        const plan = makePlan({ scope_type: "org", id: "p", calculation_strategy: "attendance_actual" });
        const rules = [makeRule("p", "hourly", "hourly", 1500)];
        expect(resolveRate({ plans: [plan], rules, context: { scheduleBasis: "hourly" }, dateYmd: "2026-03-01" })).toMatchObject({ resolved: true, calculationStrategy: "attendance_actual" });
    });
});
