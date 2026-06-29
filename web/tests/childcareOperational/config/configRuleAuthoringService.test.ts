import { describe, expect, it } from "vitest";
import {
    createCapacityRule,
    createCapacityRuleVersion,
    retireCapacityRule,
    voidScheduledCapacityRule,
    createRatioRule,
    createRatioRuleVersion,
    retireRatioRule,
    voidScheduledRatioRule,
    createOperatingWindow,
    createOperatingWindowVersion,
    voidScheduledOperatingWindow,
    createScheduleRule,
    createScheduleRuleVersion,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
} from "../mockOperationalEnrollmentSupabase";
import type {
    ChildcareCapacityRuleRow,
    ChildcareOperatingWindowRow,
    ChildcareRatioRuleRow,
    ChildcareScheduleRuleRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

const TODAY = "2026-06-29";
const ACTOR = "user-1";

function setup(seed?: Partial<OperationalEnrollmentMockStore>) {
    const store = createOperationalEnrollmentMockStore(seed);
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

describe("configRuleAuthoringService — capacity", () => {
    it("creates, supersedes (no value overwrite), retires, and voids", async () => {
        const { store, supabase } = setup();
        const rule = await createCapacityRule(supabase, {
            orgId: ORG_ID,
            scopeType: "org",
            capacityKind: "licensed",
            capacity: 20,
            effectiveStart: "2026-01-01",
            actorUserId: ACTOR,
        });
        expect(rule.capacity).toBe(20);
        expect(rule.created_by).toBe(ACTOR);

        // supersede with a higher capacity, effective next year
        const versioned = await createCapacityRuleVersion(supabase, {
            orgId: ORG_ID,
            priorId: rule.id,
            effectiveStart: "2027-01-01",
            capacity: 24,
            actorUserId: ACTOR,
        });
        expect(versioned.priorCloseDate).toBe("2026-12-31");
        expect(versioned.row.capacity).toBe(24);
        expect(versioned.row.metadata.supersedes_id).toBe(rule.id);

        // NO in-place overwrite: prior row keeps its original value, only effective_end closes
        const prior = store.childcare_capacity_rules.find((r) => r.id === rule.id) as ChildcareCapacityRuleRow;
        expect(prior.capacity).toBe(20);
        expect(prior.effective_end).toBe("2026-12-31");

        // void the scheduled version → reopens predecessor
        const voided = await voidScheduledCapacityRule(supabase, { orgId: ORG_ID, id: versioned.row.id, todayYmd: TODAY });
        expect(voided.reopenedPriorId).toBe(rule.id);
        expect((store.childcare_capacity_rules.find((r) => r.id === rule.id) as ChildcareCapacityRuleRow).effective_end).toBeNull();
        expect(store.childcare_capacity_rules.find((r) => r.id === versioned.row.id)).toBeUndefined();
    });

    it("retire closes the window without deleting", async () => {
        const { store, supabase } = setup();
        const rule = await createCapacityRule(supabase, {
            orgId: ORG_ID, scopeType: "org", capacityKind: "physical", capacity: 30, effectiveStart: "2026-01-01",
        });
        await retireCapacityRule(supabase, { orgId: ORG_ID, id: rule.id, effectiveEnd: "2026-12-31" });
        const row = store.childcare_capacity_rules.find((r) => r.id === rule.id) as ChildcareCapacityRuleRow;
        expect(row.effective_end).toBe("2026-12-31");
        expect(store.childcare_capacity_rules).toHaveLength(1);
    });

    it("rejects an invalid scope and a negative capacity", async () => {
        const { supabase } = setup();
        await expect(
            createCapacityRule(supabase, { orgId: ORG_ID, scopeType: "site", capacityKind: "physical", capacity: 10, effectiveStart: "2026-01-01" }),
        ).rejects.toMatchObject({ code: "invalid_input" });
        await expect(
            createCapacityRule(supabase, { orgId: ORG_ID, scopeType: "org", capacityKind: "physical", capacity: -1, effectiveStart: "2026-01-01" }),
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("refuses to void an already-effective version", async () => {
        const { supabase } = setup();
        const rule = await createCapacityRule(supabase, {
            orgId: ORG_ID, scopeType: "org", capacityKind: "operational", capacity: 12, effectiveStart: "2026-01-01",
        });
        await expect(
            voidScheduledCapacityRule(supabase, { orgId: ORG_ID, id: rule.id, todayYmd: TODAY }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });
});

// ---------------------------------------------------------------------------
// Ratio + tiers (tiers version with parent)
// ---------------------------------------------------------------------------

describe("configRuleAuthoringService — ratio + tiers", () => {
    async function seedRatio() {
        const { store, supabase } = setup();
        const { rule, tierCount } = await createRatioRule(supabase, {
            orgId: ORG_ID,
            scopeType: "org",
            ageGroupKey: "infant",
            tiers: [
                { maxChildren: 4, requiredStaff: 1 },
                { maxChildren: 8, requiredStaff: 2 },
            ],
            effectiveStart: "2026-01-01",
            actorUserId: ACTOR,
        });
        return { store, supabase, rule, tierCount };
    }

    it("creates a ratio rule with its own tier set", async () => {
        const { store, rule, tierCount } = await seedRatio();
        expect(tierCount).toBe(2);
        const tiers = store.childcare_ratio_rule_tiers.filter((t) => t.ratio_rule_id === rule.id);
        expect(tiers).toHaveLength(2);
    });

    it("versions a ratio rule: new tier set under new version, prior tiers untouched, prior rule closed", async () => {
        const { store, supabase, rule } = await seedRatio();
        const versioned = await createRatioRuleVersion(supabase, {
            orgId: ORG_ID,
            priorId: rule.id,
            effectiveStart: "2027-01-01",
            tiers: [
                { maxChildren: 3, requiredStaff: 1 },
                { maxChildren: 6, requiredStaff: 2 },
                { maxChildren: 9, requiredStaff: 3 },
            ],
            actorUserId: ACTOR,
        });
        expect(versioned.tierCount).toBe(3);
        expect(versioned.priorCloseDate).toBe("2026-12-31");

        // prior rule + tiers preserved (no overwrite)
        const priorRule = store.childcare_ratio_rules.find((r) => r.id === rule.id) as ChildcareRatioRuleRow;
        expect(priorRule.effective_end).toBe("2026-12-31");
        expect(store.childcare_ratio_rule_tiers.filter((t) => t.ratio_rule_id === rule.id)).toHaveLength(2);
        // new version tiers
        expect(store.childcare_ratio_rule_tiers.filter((t) => t.ratio_rule_id === versioned.row.id)).toHaveLength(3);
    });

    it("carries prior tiers forward when a version omits tiers", async () => {
        const { store, supabase, rule } = await seedRatio();
        const versioned = await createRatioRuleVersion(supabase, { orgId: ORG_ID, priorId: rule.id, effectiveStart: "2027-01-01" });
        expect(versioned.tierCount).toBe(2);
        const carried = store.childcare_ratio_rule_tiers.filter((t) => t.ratio_rule_id === versioned.row.id);
        expect(carried.map((t) => Number(t.max_children)).sort((a, b) => a - b)).toEqual([4, 8]);
    });

    it("voids a scheduled ratio version and removes its tiers + reopens predecessor", async () => {
        const { store, supabase, rule } = await seedRatio();
        const versioned = await createRatioRuleVersion(supabase, { orgId: ORG_ID, priorId: rule.id, effectiveStart: "2027-01-01" });
        const voided = await voidScheduledRatioRule(supabase, { orgId: ORG_ID, id: versioned.row.id, todayYmd: TODAY });
        expect(voided.reopenedPriorId).toBe(rule.id);
        expect(store.childcare_ratio_rules.find((r) => r.id === versioned.row.id)).toBeUndefined();
        expect(store.childcare_ratio_rule_tiers.filter((t) => t.ratio_rule_id === versioned.row.id)).toHaveLength(0);
        expect((store.childcare_ratio_rules.find((r) => r.id === rule.id) as ChildcareRatioRuleRow).effective_end).toBeNull();
    });

    it("rejects a ratio rule with no tiers and duplicate tier thresholds", async () => {
        const { supabase } = setup();
        await expect(
            createRatioRule(supabase, { orgId: ORG_ID, scopeType: "org", tiers: [], effectiveStart: "2026-01-01" }),
        ).rejects.toMatchObject({ code: "invalid_input" });
        await expect(
            createRatioRule(supabase, {
                orgId: ORG_ID, scopeType: "org",
                tiers: [{ maxChildren: 5, requiredStaff: 1 }, { maxChildren: 5, requiredStaff: 2 }],
                effectiveStart: "2026-01-01",
            }),
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("retires a ratio rule", async () => {
        const { store, supabase, rule } = await seedRatio();
        await retireRatioRule(supabase, { orgId: ORG_ID, id: rule.id, effectiveEnd: "2026-12-31" });
        expect((store.childcare_ratio_rules.find((r) => r.id === rule.id) as ChildcareRatioRuleRow).effective_end).toBe("2026-12-31");
    });
});

// ---------------------------------------------------------------------------
// Operating windows
// ---------------------------------------------------------------------------

describe("configRuleAuthoringService — operating windows", () => {
    it("creates and supersedes a window; rejects close <= open", async () => {
        const { store, supabase } = setup();
        const win = await createOperatingWindow(supabase, {
            orgId: ORG_ID, scopeType: "org", weekday: 1, openTime: "08:00", closeTime: "18:00", effectiveStart: "2026-01-01",
        });
        expect(win.open_time).toBe("08:00:00");
        expect(win.close_time).toBe("18:00:00");

        const versioned = await createOperatingWindowVersion(supabase, {
            orgId: ORG_ID, priorId: win.id, effectiveStart: "2027-01-01", openTime: "07:30", closeTime: "17:30",
        });
        expect(versioned.row.open_time).toBe("07:30:00");
        // prior carries weekday forward, prior value untouched
        const prior = store.childcare_operating_windows.find((r) => r.id === win.id) as ChildcareOperatingWindowRow;
        expect(prior.open_time).toBe("08:00:00");
        expect(versioned.row.weekday).toBe(1);

        await expect(
            createOperatingWindow(supabase, { orgId: ORG_ID, scopeType: "org", weekday: 2, openTime: "18:00", closeTime: "08:00", effectiveStart: "2026-01-01" }),
        ).rejects.toMatchObject({ code: "validation_failed" });
    });

    it("voids a scheduled window", async () => {
        const { store, supabase } = setup();
        const win = await createOperatingWindow(supabase, {
            orgId: ORG_ID, scopeType: "org", weekday: 3, openTime: "08:00", closeTime: "18:00", effectiveStart: "2026-01-01",
        });
        const versioned = await createOperatingWindowVersion(supabase, { orgId: ORG_ID, priorId: win.id, effectiveStart: "2027-01-01", openTime: "09:00", closeTime: "17:00" });
        await voidScheduledOperatingWindow(supabase, { orgId: ORG_ID, id: versioned.row.id, todayYmd: TODAY });
        expect(store.childcare_operating_windows.find((r) => r.id === versioned.row.id)).toBeUndefined();
        expect((store.childcare_operating_windows.find((r) => r.id === win.id) as ChildcareOperatingWindowRow).effective_end).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Schedule rules
// ---------------------------------------------------------------------------

describe("configRuleAuthoringService — schedule rules", () => {
    it("creates and supersedes; arrays + days carry forward and override", async () => {
        const { store, supabase } = setup();
        const rule = await createScheduleRule(supabase, {
            orgId: ORG_ID,
            scopeType: "org",
            eligibleScheduleTypeKeys: ["full_time", "half_day"],
            minDaysPerWeek: 2,
            maxDaysPerWeek: 5,
            effectiveStart: "2026-01-01",
        });
        expect(rule.eligible_schedule_type_keys).toEqual(["full_time", "half_day"]);

        const versioned = await createScheduleRuleVersion(supabase, {
            orgId: ORG_ID,
            priorId: rule.id,
            effectiveStart: "2027-01-01",
            minDaysPerWeek: 3,
            // eligibleScheduleTypeKeys omitted → carried forward
        });
        expect((versioned.row as ChildcareScheduleRuleRow).eligible_schedule_type_keys).toEqual(["full_time", "half_day"]);
        expect((versioned.row as ChildcareScheduleRuleRow).min_days_per_week).toBe(3);
        // prior untouched except close
        const prior = store.childcare_schedule_rules.find((r) => r.id === rule.id) as ChildcareScheduleRuleRow;
        expect(prior.min_days_per_week).toBe(2);
        expect(prior.effective_end).toBe("2026-12-31");
    });

    it("rejects max < min days", async () => {
        const { supabase } = setup();
        await expect(
            createScheduleRule(supabase, { orgId: ORG_ID, scopeType: "org", minDaysPerWeek: 5, maxDaysPerWeek: 2, effectiveStart: "2026-01-01" }),
        ).rejects.toMatchObject({ code: "validation_failed" });
    });
});
