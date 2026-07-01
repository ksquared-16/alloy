import { describe, it, expect } from "vitest";
import { validateWorkViewGrainConsistency } from "@/lib/lifecycle/stageGrainV1";

describe("validateWorkViewGrainConsistency", () => {
    it("accepts a single defined grain", () => {
        expect(validateWorkViewGrainConsistency(["family"])).toEqual({ valid: true });
    });

    it("accepts all matching grains", () => {
        expect(validateWorkViewGrainConsistency(["child", "child", "child"])).toEqual({ valid: true });
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
