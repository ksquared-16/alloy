import { describe, expect, it } from "vitest";
import {
    resolveOperationalCapacity,
    type CapacityConfig,
} from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";
import type {
    ChildcareCapacityRuleRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

const SITE = "site-1";
const ROOM = "room-1";

function capRule(partial: Partial<ChildcareCapacityRuleRow>): ChildcareCapacityRuleRow {
    return {
        id: partial.id ?? "cap-1",
        org_id: "org-1",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: ROOM,
        age_group_key: null,
        capacity_kind: "physical",
        capacity: 20,
        source_key: "config",
        effective_start: "2026-01-01",
        effective_end: null,
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

function ratioRule(partial: Partial<ChildcareRatioRuleRow>): ChildcareRatioRuleRow {
    return {
        id: partial.id ?? "ratio-1",
        org_id: "org-1",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: ROOM,
        age_group_key: null,
        jurisdiction_key: null,
        source_key: "config",
        effective_start: "2026-01-01",
        effective_end: null,
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

function tier(ruleId: string, max_children: number, required_staff: number): ChildcareRatioRuleTierRow {
    return {
        id: `${ruleId}-t${max_children}`,
        org_id: "org-1",
        ratio_rule_id: ruleId,
        max_children,
        required_staff,
        sort_order: max_children,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

const baseReq = { orgId: "org-1", locationId: SITE, siteLocationId: SITE, roomLocationId: ROOM, effectiveAt: "2026-06-01" };

describe("resolveOperationalCapacity — distinct kinds + binding", () => {
    it("keeps kinds separate and binds to the minimum defined limit", () => {
        const config: CapacityConfig = {
            capacityRules: [
                capRule({ id: "phys", capacity_kind: "physical", capacity: 20 }),
                capRule({ id: "lic", capacity_kind: "licensed", capacity: 15 }),
                capRule({ id: "op", capacity_kind: "operational", capacity: 18 }),
            ],
            ratioRules: [ratioRule({ id: "r" })],
            ratioRuleTiers: [tier("r", 12, 1)], // ratio ceiling 12
        };
        const res = resolveOperationalCapacity(config, baseReq);
        expect(res.status).toBe("resolved");
        expect(res.physicalCapacity).toBe(20);
        expect(res.licensedCapacity).toBe(15);
        expect(res.configuredCapacity).toBe(18);
        expect(res.ratioConstrainedCapacity).toBe(12);
        expect(res.bindingCapacity).toBe(12); // ratio binds
        expect(res.limitingFactor).toBe("ratio");
        expect(res.staffedCapacity).toBeNull();
    });

    it("licensed clamp: a weaker room override cannot raise the licensed ceiling", () => {
        const config: CapacityConfig = {
            capacityRules: [
                capRule({ id: "org-lic", scope_type: "org", room_location_id: null, capacity_kind: "licensed", capacity: 10 }),
                capRule({ id: "room-lic", scope_type: "room", room_location_id: ROOM, capacity_kind: "licensed", capacity: 30 }),
            ],
            ratioRules: [],
            ratioRuleTiers: [],
        };
        const res = resolveOperationalCapacity(config, baseReq);
        expect(res.licensedCapacity).toBe(10);
        expect(res.bindingCapacity).toBe(10);
        expect(res.limitingFactor).toBe("licensed");
    });
});

describe("availableNow + occupancy", () => {
    const config: CapacityConfig = {
        capacityRules: [capRule({ id: "phys", capacity_kind: "physical", capacity: 20 })],
        ratioRules: [],
        ratioRuleTiers: [],
    };
    it("computes max(0, binding - committed) when resolved with known occupancy", () => {
        const res = resolveOperationalCapacity(config, { ...baseReq, occupancyContext: { committed: 12, offered: 3, attended: 10 } });
        expect(res.availableNow).toBe(8);
        expect(res.offeredOccupancy).toBe(3);
        expect(res.attendedOccupancy).toBe(10);
    });
    it("never goes negative", () => {
        const res = resolveOperationalCapacity(config, { ...baseReq, occupancyContext: { committed: 25 } });
        expect(res.availableNow).toBe(0);
    });
    it("is null (with a warning) when occupancy is unknown — never guessed", () => {
        const res = resolveOperationalCapacity(config, baseReq);
        expect(res.availableNow).toBeNull();
        expect(res.warnings.some((w) => w.code === "occupancy_unknown")).toBe(true);
    });
});

describe("status model — unknown is never 0 or unlimited", () => {
    it("not_configured when no rule exists at all", () => {
        const res = resolveOperationalCapacity({ capacityRules: [], ratioRules: [], ratioRuleTiers: [] }, baseReq);
        expect(res.status).toBe("not_configured");
        expect(res.bindingCapacity).toBeNull();
        expect(res.availableNow).toBeNull();
    });

    it("incomplete when a mixed-age group is uncovered (availableNow suppressed)", () => {
        const config: CapacityConfig = {
            capacityRules: [capRule({ id: "phys", capacity_kind: "physical", capacity: 20 })],
            ratioRules: [ratioRule({ id: "infant", age_group_key: "infant" })],
            ratioRuleTiers: [tier("infant", 8, 1)],
        };
        const res = resolveOperationalCapacity(config, {
            ...baseReq,
            ageGroupContext: ["infant", "preschool"],
            occupancyContext: { committed: 4 },
        });
        expect(res.status).toBe("incomplete");
        expect(res.warnings.some((w) => w.code === "unknown_age_group")).toBe(true);
        expect(res.availableNow).toBeNull(); // not trustworthy while incomplete
    });

    it("a null kind is excluded from the binding, never treated as 0", () => {
        const config: CapacityConfig = {
            capacityRules: [capRule({ id: "phys", capacity_kind: "physical", capacity: 20 })], // no licensed/operational
            ratioRules: [],
            ratioRuleTiers: [],
        };
        const res = resolveOperationalCapacity(config, baseReq);
        expect(res.licensedCapacity).toBeNull();
        expect(res.bindingCapacity).toBe(20); // not 0
    });
});
