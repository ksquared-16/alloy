import { describe, expect, it } from "vitest";
import {
    isAtLeastAsSevere,
    mergeResolutionStatus,
    sortAppliedRules,
    sortWarnings,
    type AppliedOperationalRule,
    type OperationalResolutionWarning,
} from "@/lib/location/operationalResolutionContracts";
import { DEFAULT_MIXED_AGE_RATIO_POLICY } from "@/lib/childcareOperational/capacity/capacityContractTypes";
import { CHILDCARE_LOCATION_TYPES, isChildcareLocationType } from "@/lib/location/canonicalLocationModel";

describe("mergeResolutionStatus", () => {
    it("empty input is not_configured (nothing resolved)", () => {
        expect(mergeResolutionStatus([])).toBe("not_configured");
    });
    it("any conflicted dominates", () => {
        expect(mergeResolutionStatus(["resolved", "incomplete", "conflicted"])).toBe("conflicted");
    });
    it("incomplete beats resolved/not_configured", () => {
        expect(mergeResolutionStatus(["resolved", "incomplete"])).toBe("incomplete");
        expect(mergeResolutionStatus(["not_configured", "incomplete"])).toBe("incomplete");
    });
    it("all not_configured stays not_configured", () => {
        expect(mergeResolutionStatus(["not_configured", "not_configured"])).toBe("not_configured");
    });
    it("resolved + not_configured is resolved (absent constraint is not an error)", () => {
        expect(mergeResolutionStatus(["resolved", "not_configured"])).toBe("resolved");
    });
    it("all resolved is resolved", () => {
        expect(mergeResolutionStatus(["resolved", "resolved"])).toBe("resolved");
    });
});

describe("isAtLeastAsSevere", () => {
    it("orders conflicted > incomplete > not_configured > resolved", () => {
        expect(isAtLeastAsSevere("conflicted", "incomplete")).toBe(true);
        expect(isAtLeastAsSevere("incomplete", "not_configured")).toBe(true);
        expect(isAtLeastAsSevere("not_configured", "resolved")).toBe(true);
        expect(isAtLeastAsSevere("resolved", "incomplete")).toBe(false);
    });
});

describe("sortWarnings", () => {
    it("orders deterministically by code then message", () => {
        const warnings: OperationalResolutionWarning[] = [
            { code: "b_code", message: "z" },
            { code: "a_code", message: "y" },
            { code: "a_code", message: "x" },
        ];
        expect(sortWarnings(warnings).map((w) => `${w.code}:${w.message}`)).toEqual([
            "a_code:x",
            "a_code:y",
            "b_code:z",
        ]);
    });
    it("does not mutate the input", () => {
        const warnings: OperationalResolutionWarning[] = [
            { code: "b", message: "1" },
            { code: "a", message: "2" },
        ];
        const before = warnings.map((w) => w.code).join(",");
        sortWarnings(warnings);
        expect(warnings.map((w) => w.code).join(",")).toBe(before);
    });
});

describe("sortAppliedRules", () => {
    it("puts binding rule first, then orders by type/scope/id", () => {
        const rules: AppliedOperationalRule[] = [
            { ruleId: "r2", ruleType: "ratio", scopeType: "site" },
            { ruleId: "c1", ruleType: "capacity", scopeType: "room", binding: true },
            { ruleId: "r1", ruleType: "ratio", scopeType: "site" },
        ];
        const sorted = sortAppliedRules(rules);
        expect(sorted[0].ruleId).toBe("c1");
        expect(sorted.slice(1).map((r) => r.ruleId)).toEqual(["r1", "r2"]);
    });
});

describe("shared contract constants", () => {
    it("default mixed-age policy is most_restrictive", () => {
        expect(DEFAULT_MIXED_AGE_RATIO_POLICY).toBe("most_restrictive");
    });
    it("childcare location types exclude address", () => {
        expect(CHILDCARE_LOCATION_TYPES).toEqual(["site", "unit"]);
        expect(isChildcareLocationType("site")).toBe(true);
        expect(isChildcareLocationType("unit")).toBe(true);
        expect(isChildcareLocationType("address")).toBe(false);
    });
});
