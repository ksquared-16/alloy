import { describe, it, expect } from "vitest";
import { validateWorkViewGrainConsistency, grainCountUnitLabel } from "@/lib/lifecycle/stageGrainV1";

describe("grainCountUnitLabel", () => {
    it("pluralizes family and child grain units for Work View counts", () => {
        expect(grainCountUnitLabel("family", 1)).toBe("Family");
        expect(grainCountUnitLabel("family", 2)).toBe("Families");
        expect(grainCountUnitLabel("child", 1)).toBe("Child");
        expect(grainCountUnitLabel("child", 3)).toBe("Children");
    });
});

describe("validateWorkViewGrainConsistency", () => {
    it("accepts a single defined grain", () => {
        expect(validateWorkViewGrainConsistency(["family"])).toEqual({ valid: true });
    });

    it("accepts all matching grains", () => {
        expect(validateWorkViewGrainConsistency(["child", "child", "child"])).toEqual({ valid: true });
    });

    it("lets a view declared Family span family and child stages (Decision with an offer pending)", () => {
        expect(validateWorkViewGrainConsistency(["family", "child"], "family")).toEqual({ valid: true });
    });

    it("still refuses a mixed view declared Child, or one that spans work items", () => {
        expect(validateWorkViewGrainConsistency(["family", "child"], "child").valid).toBe(false);
        expect(validateWorkViewGrainConsistency(["family", "work_item"], "family").valid).toBe(false);
    });

    it("rejects mixed grains — family + child", () => {
        const result = validateWorkViewGrainConsistency(["family", "child"]);
        expect(result.valid).toBe(false);
        expect(result.message).toContain("different row types");
    });

    it("rejects mixed grains — family + work_item", () => {
        const result = validateWorkViewGrainConsistency(["family", "work_item"]);
        expect(result.valid).toBe(false);
    });

    it("ignores undefined grains when checking consistency", () => {
        // Stages without a grain configured are excluded from the check
        expect(validateWorkViewGrainConsistency([undefined, "family", undefined])).toEqual({ valid: true });
    });

    it("accepts an empty array", () => {
        expect(validateWorkViewGrainConsistency([])).toEqual({ valid: true });
    });

    it("accepts all-undefined array", () => {
        expect(validateWorkViewGrainConsistency([undefined, undefined])).toEqual({ valid: true });
    });
});
