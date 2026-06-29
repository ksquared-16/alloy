import { describe, expect, it } from "vitest";
import {
    createRatePlan,
    createRatePlanVersion,
    createRateRule,
    createRateRuleVersion,
    retireRatePlan,
    retireRateRule,
    voidScheduledRatePlanVersion,
    voidScheduledRateRuleVersion,
} from "@/lib/financials/rates/rateAuthoringService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";
import type { ChildcareRatePlanRow, ChildcareRateRuleRow } from "@/lib/financials/rates/rateTypes";

const TODAY = "2026-06-29";
const ACTOR = "user-1";

function setup(seed?: Partial<OperationalEnrollmentMockStore>) {
    const store = createOperationalEnrollmentMockStore(seed);
    const supabase = createOperationalEnrollmentMockSupabase(store);
    return { store, supabase };
}

async function seedPlanWithRule() {
    const { store, supabase } = setup();
    const plan = await createRatePlan(supabase, {
        orgId: ORG_ID,
        scopeType: "org",
        planKey: "standard_tuition",
        label: "Standard Tuition",
        billingBasis: "monthly",
        effectiveStart: "2026-01-01",
        actorUserId: ACTOR,
    });
    const rule = await createRateRule(supabase, {
        orgId: ORG_ID,
        ratePlanId: plan.id,
        scheduleBasis: "five_day",
        rateBasis: "monthly",
        amountCents: 120000,
        effectiveStart: "2026-01-01",
        actorUserId: ACTOR,
    });
    return { store, supabase, plan, rule };
}

describe("rateAuthoringService — createRatePlan", () => {
    it("creates a genesis plan with normalized currency and defaults", async () => {
        const { supabase, store } = setup();
        const plan = await createRatePlan(supabase, {
            orgId: ORG_ID,
            scopeType: "org",
            planKey: "tuition",
            billingBasis: "monthly",
            currencyCode: "usd",
            effectiveStart: "2026-01-01",
            actorUserId: ACTOR,
        });
        expect(plan.currency_code).toBe("USD");
        expect(plan.calculation_strategy).toBe("scheduled");
        expect(plan.is_active).toBe(true);
        expect(plan.created_by).toBe(ACTOR);
        expect(store.childcare_rate_plans).toHaveLength(1);
    });

    it("rejects an invalid scope shape", async () => {
        const { supabase } = setup();
        await expect(
            createRatePlan(supabase, {
                orgId: ORG_ID,
                scopeType: "site", // missing siteLocationId
                planKey: "tuition",
                billingBasis: "monthly",
                effectiveStart: "2026-01-01",
            }),
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("rejects an invalid billing basis", async () => {
        const { supabase } = setup();
        await expect(
            createRatePlan(supabase, {
                orgId: ORG_ID,
                scopeType: "org",
                planKey: "tuition",
                billingBasis: "fortnightly",
                effectiveStart: "2026-01-01",
            }),
        ).rejects.toBeInstanceOf(OperationalEnrollmentServiceError);
    });
});

describe("rateAuthoringService — createRatePlanVersion (supersede)", () => {
    it("supersedes a plan: closes prior, carries rules forward, links lineage", async () => {
        const { supabase, store, plan } = await seedPlanWithRule();
        const result = await createRatePlanVersion(supabase, {
            orgId: ORG_ID,
            priorPlanId: plan.id,
            effectiveStart: "2027-01-01",
            label: "2027 Tuition",
            actorUserId: ACTOR,
        });

        expect(result.priorCloseDate).toBe("2026-12-31");
        expect(result.carriedRuleCount).toBe(1);

        const prior = store.childcare_rate_plans.find((p) => p.id === plan.id) as ChildcareRatePlanRow;
        expect(prior.effective_end).toBe("2026-12-31"); // prior closed, not overwritten

        const newPlan = store.childcare_rate_plans.find((p) => p.id === result.plan.id) as ChildcareRatePlanRow;
        expect(newPlan.effective_start).toBe("2027-01-01");
        expect(newPlan.label).toBe("2027 Tuition");
        expect(newPlan.metadata.supersedes_id).toBe(plan.id);
        expect(newPlan.metadata.lineage_origin_id).toBe(plan.id);

        // carried rule sits under the NEW plan, effective from the new start
        const carried = store.childcare_rate_rules.filter((r) => r.rate_plan_id === result.plan.id);
        expect(carried).toHaveLength(1);
        expect(carried[0].effective_start).toBe("2027-01-01");
        expect(carried[0].amount_cents).toBe(120000);
    });

    it("can skip rule carry-forward", async () => {
        const { supabase, store, plan } = await seedPlanWithRule();
        const result = await createRatePlanVersion(supabase, {
            orgId: ORG_ID,
            priorPlanId: plan.id,
            effectiveStart: "2027-01-01",
            carryForwardRules: false,
        });
        expect(result.carriedRuleCount).toBe(0);
        expect(store.childcare_rate_rules.filter((r) => r.rate_plan_id === result.plan.id)).toHaveLength(0);
    });

    it("rejects a new version starting on or before the prior start", async () => {
        const { supabase, plan } = await seedPlanWithRule();
        await expect(
            createRatePlanVersion(supabase, {
                orgId: ORG_ID,
                priorPlanId: plan.id,
                effectiveStart: "2026-01-01",
            }),
        ).rejects.toMatchObject({ code: "validation_failed" });
    });

    it("404s on an unknown prior plan", async () => {
        const { supabase } = setup();
        await expect(
            createRatePlanVersion(supabase, { orgId: ORG_ID, priorPlanId: "nope", effectiveStart: "2027-01-01" }),
        ).rejects.toMatchObject({ code: "not_found" });
    });
});

describe("rateAuthoringService — retireRatePlan", () => {
    it("closes the effective window for a future date without deactivating", async () => {
        const { supabase, store, plan } = await seedPlanWithRule();
        await retireRatePlan(supabase, {
            orgId: ORG_ID,
            planId: plan.id,
            effectiveEnd: "2026-12-31",
            todayYmd: TODAY,
            actorUserId: ACTOR,
        });
        const row = store.childcare_rate_plans.find((p) => p.id === plan.id) as ChildcareRatePlanRow;
        expect(row.effective_end).toBe("2026-12-31");
        expect(row.is_active).toBe(true); // future retirement keeps it active until then
    });

    it("hard-disables when retired effective today or earlier", async () => {
        const { supabase, store, plan } = await seedPlanWithRule();
        await retireRatePlan(supabase, { orgId: ORG_ID, planId: plan.id, effectiveEnd: TODAY, todayYmd: TODAY });
        const row = store.childcare_rate_plans.find((p) => p.id === plan.id) as ChildcareRatePlanRow;
        expect(row.is_active).toBe(false);
    });

    it("rejects an end date before the plan start", async () => {
        const { supabase, plan } = await seedPlanWithRule();
        await expect(
            retireRatePlan(supabase, { orgId: ORG_ID, planId: plan.id, effectiveEnd: "2025-01-01", todayYmd: TODAY }),
        ).rejects.toMatchObject({ code: "validation_failed" });
    });
});

describe("rateAuthoringService — voidScheduledRatePlanVersion", () => {
    it("deletes a scheduled version and reopens its predecessor", async () => {
        const { supabase, store, plan } = await seedPlanWithRule();
        const version = await createRatePlanVersion(supabase, {
            orgId: ORG_ID,
            priorPlanId: plan.id,
            effectiveStart: "2027-01-01",
            actorUserId: ACTOR,
        });
        // prior was closed to 2026-12-31
        expect((store.childcare_rate_plans.find((p) => p.id === plan.id) as ChildcareRatePlanRow).effective_end).toBe("2026-12-31");

        const result = await voidScheduledRatePlanVersion(supabase, {
            orgId: ORG_ID,
            planId: version.plan.id,
            todayYmd: TODAY,
        });
        expect(result.voided).toBe(true);
        expect(result.reopenedPriorId).toBe(plan.id);
        // scheduled version + its carried rules removed
        expect(store.childcare_rate_plans.find((p) => p.id === version.plan.id)).toBeUndefined();
        expect(store.childcare_rate_rules.filter((r) => r.rate_plan_id === version.plan.id)).toHaveLength(0);
        // predecessor reopened
        expect((store.childcare_rate_plans.find((p) => p.id === plan.id) as ChildcareRatePlanRow).effective_end).toBeNull();
    });

    it("refuses to void a version that is already effective", async () => {
        const { supabase, plan } = await seedPlanWithRule();
        await expect(
            voidScheduledRatePlanVersion(supabase, { orgId: ORG_ID, planId: plan.id, todayYmd: TODAY }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });
});

describe("rateAuthoringService — rate rules", () => {
    it("creates, supersedes (2026→2027 tuition), retires, and voids a rule", async () => {
        const { supabase, store } = await seedPlanWithRule();
        const baseRule = store.childcare_rate_rules[0] as ChildcareRateRuleRow;

        // supersede: 2027 tuition at a higher amount
        const versioned = await createRateRuleVersion(supabase, {
            orgId: ORG_ID,
            priorRuleId: baseRule.id,
            effectiveStart: "2027-01-01",
            amountCents: 130000,
            actorUserId: ACTOR,
        });
        expect(versioned.priorCloseDate).toBe("2026-12-31");
        expect((store.childcare_rate_rules.find((r) => r.id === baseRule.id) as ChildcareRateRuleRow).effective_end).toBe("2026-12-31");
        expect(versioned.rule.amount_cents).toBe(130000);
        expect(versioned.rule.metadata.supersedes_id).toBe(baseRule.id);

        // void the scheduled 2027 rule → reopen 2026
        const voided = await voidScheduledRateRuleVersion(supabase, {
            orgId: ORG_ID,
            ruleId: versioned.rule.id,
            todayYmd: TODAY,
        });
        expect(voided.reopenedPriorId).toBe(baseRule.id);
        expect((store.childcare_rate_rules.find((r) => r.id === baseRule.id) as ChildcareRateRuleRow).effective_end).toBeNull();
    });

    it("retires a rule by closing its window", async () => {
        const { supabase, store } = await seedPlanWithRule();
        const baseRule = store.childcare_rate_rules[0] as ChildcareRateRuleRow;
        await retireRateRule(supabase, { orgId: ORG_ID, ruleId: baseRule.id, effectiveEnd: "2026-12-31" });
        expect((store.childcare_rate_rules.find((r) => r.id === baseRule.id) as ChildcareRateRuleRow).effective_end).toBe("2026-12-31");
    });

    it("rejects a negative amount", async () => {
        const { supabase, plan } = await seedPlanWithRule();
        await expect(
            createRateRule(supabase, {
                orgId: ORG_ID,
                ratePlanId: plan.id,
                scheduleBasis: "half_day",
                rateBasis: "daily",
                amountCents: -5,
                effectiveStart: "2026-01-01",
            }),
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("404s creating a rule under an unknown plan", async () => {
        const { supabase } = setup();
        await expect(
            createRateRule(supabase, {
                orgId: ORG_ID,
                ratePlanId: "nope",
                scheduleBasis: "full_day",
                rateBasis: "daily",
                amountCents: 5000,
                effectiveStart: "2026-01-01",
            }),
        ).rejects.toMatchObject({ code: "not_found" });
    });
});
