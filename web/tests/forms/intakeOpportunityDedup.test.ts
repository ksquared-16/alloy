import { describe, expect, it } from "vitest";
import {
    childNameMatchesMember,
    decideIntakeOpportunityMatch,
    normalizeIntakeNamePart,
} from "@/lib/forms/intake/intakeOpportunityDedup";

describe("intakeOpportunityDedup pure helpers", () => {
    it("decideIntakeOpportunityMatch", () => {
        expect(decideIntakeOpportunityMatch([])).toEqual({ kind: "no_match" });
        expect(decideIntakeOpportunityMatch(["a"])).toEqual({ kind: "matched", opportunityId: "a" });
        expect(decideIntakeOpportunityMatch(["a", "b"])).toEqual({ kind: "ambiguous", candidateIds: ["a", "b"] });
    });

    it("childNameMatchesMember is case-insensitive", () => {
        expect(childNameMatchesMember({ first_name: "Mickey", last_name: "Mouse" }, "mickey", "mouse")).toBe(true);
        expect(childNameMatchesMember({ first_name: "Mickey", last_name: "Mouse" }, "Minnie", null)).toBe(false);
    });

    it("normalizeIntakeNamePart trims and lowercases", () => {
        expect(normalizeIntakeNamePart("  Pat  ")).toBe("pat");
    });
});
