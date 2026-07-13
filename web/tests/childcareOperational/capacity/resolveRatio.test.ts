import { describe, expect, it } from "vitest";
import {
    resolveApplicableRatioRules,
    resolveMixedAgeRatio,
    resolveRatio,
    type RatioConfig,
} from "@/lib/childcareOperational/capacity/resolveRatio";
import type {
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

const SITE = "site-1";
const ROOM = "room-1";

function ratioRule(partial: Partial<ChildcareRatioRuleRow>): ChildcareRatioRuleRow {
    return {
        id: partial.id ?? "rule-1",
        org_id: "org-1",
        scope_type: "site",
        site_location_id: SITE,
        program_category_id: null,
        room_location_id: null,
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

function tier(ruleId: string, max_children: number, required_staff: number, sort = max_children): ChildcareRatioRuleTierRow {
    return {
        id: `${ruleId}-t${max_children}`,
        org_id: "org-1",
        ratio_rule_id: ruleId,
        max_children,
        required_staff,
        sort_order: sort,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

// Infant 1:5 / 2:11 stepped tiers.
const infantConfig: RatioConfig = {
    ratioRules: [ratioRule({ id: "infant", age_group_key: "infant" })],
    ratioRuleTiers: [tier("infant", 5, 1), tier("infant", 11, 2), tier("infant", 16, 3)],
};

const baseReq = { siteLocationId: SITE, roomLocationId: ROOM, effectiveAt: "2026-06-01" };

describe("stepped tiers — no decimal scaling", () => {
    it("1 adult covers up to 5 children under a 1:5 tier", () => {
        const r5 = resolveRatio(infantConfig, { ...baseReq, ageGroupKey: "infant", childCount: 5 });
        expect(r5.requiredStaff).toBe(1);
    });
    it("2 adults required at 6 and up to 11 (2:11, not 2:10)", () => {
        expect(resolveRatio(infantConfig, { ...baseReq, ageGroupKey: "infant", childCount: 6 }).requiredStaff).toBe(2);
        expect(resolveRatio(infantConfig, { ...baseReq, ageGroupKey: "infant", childCount: 11 }).requiredStaff).toBe(2);
        // ratio-limited ceiling is the top tier (16), never a scaled decimal.
        expect(resolveRatio(infantConfig, { ...baseReq, ageGroupKey: "infant" }).ratioConstrainedCapacity).toBe(16);
    });
    it("child count above the highest tier warns but still resolves", () => {
        const r = resolveRatio(infantConfig, { ...baseReq, ageGroupKey: "infant", childCount: 20 });
        expect(r.status).toBe("resolved");
        expect(r.requiredStaff).toBe(3);
        expect(r.warnings.some((w) => w.code === "child_count_exceeds_ratio_capacity")).toBe(true);
    });
});

describe("precedence — most-specific rule selection", () => {
    it("a room rule beats a site rule (selection by specificity, not value)", () => {
        const config: RatioConfig = {
            ratioRules: [
                ratioRule({ id: "site-r", scope_type: "site", site_location_id: SITE }),
                ratioRule({ id: "room-r", scope_type: "room", site_location_id: null, room_location_id: ROOM }),
            ],
            ratioRuleTiers: [tier("site-r", 6, 1), tier("room-r", 4, 1)],
        };
        const r = resolveRatio(config, { ...baseReq, childCount: 4 });
        expect(r.bindingRuleId).toBe("room-r");
        expect(r.ratioConstrainedCapacity).toBe(4);
    });
});

describe("mixed-age most_restrictive", () => {
    const mixedConfig: RatioConfig = {
        ratioRules: [
            ratioRule({ id: "infant", age_group_key: "infant" }),
            ratioRule({ id: "toddler", age_group_key: "toddler" }),
        ],
        ratioRuleTiers: [
            tier("infant", 4, 1), // infant 1:4
            tier("toddler", 10, 1), // toddler 1:10
        ],
    };

    it("binds to the most restrictive: lowest ceiling, highest required staff", () => {
        const r = resolveRatio(mixedConfig, { ...baseReq, ageGroupContext: ["infant", "toddler"], childCount: 4 });
        expect(r.status).toBe("resolved");
        expect(r.ratioConstrainedCapacity).toBe(4); // min(4, 10)
        expect(r.bindingRuleId).toBe("infant");
        expect(r.appliedRules.length).toBe(2);
    });

    it("an uncovered age group makes it incomplete (never silently fits)", () => {
        const r = resolveRatio(mixedConfig, { ...baseReq, ageGroupContext: ["infant", "preschool"], childCount: 4 });
        expect(r.status).toBe("incomplete");
        expect(r.warnings.some((w) => w.code === "unknown_age_group")).toBe(true);
        // still reports the covered group's ceiling, but flagged incomplete.
        expect(r.ratioConstrainedCapacity).toBe(4);
    });
});

describe("no applicable rule", () => {
    it("returns not_configured", () => {
        const r = resolveRatio({ ratioRules: [], ratioRuleTiers: [] }, { ...baseReq, ageGroupKey: "infant" });
        expect(r.status).toBe("not_configured");
        expect(r.ratioConstrainedCapacity).toBeNull();
        expect(r.requiredStaff).toBeNull();
    });
});

describe("policy contract", () => {
    it("throws for unimplemented policies", () => {
        expect(() => resolveRatio(infantConfig, { ...baseReq, ageGroupKey: "infant", mixedAgePolicy: "weighted" })).toThrow(/not implemented/i);
    });
    it("resolveMixedAgeRatio is the same resolver", () => {
        expect(resolveMixedAgeRatio).toBe(resolveRatio);
    });
    it("resolveApplicableRatioRules separates covered from uncovered", () => {
        const { applicable, uncoveredAgeGroups } = resolveApplicableRatioRules(infantConfig, {
            ...baseReq,
            ageGroupContext: ["infant", "toddler"],
        });
        expect(applicable.map((a) => a.ageGroupKey)).toEqual(["infant"]);
        expect(uncoveredAgeGroups).toEqual(["toddler"]);
    });
});
