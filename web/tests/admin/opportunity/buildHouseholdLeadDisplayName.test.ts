import { describe, expect, it } from "vitest";
import {
    buildHouseholdLeadDisplayName,
    formatHouseholdLeadDisplayTitle,
    isHouseholdFormattedLeadName,
} from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";

describe("buildHouseholdLeadDisplayName", () => {
    it("prefers last name Family", () => {
        expect(buildHouseholdLeadDisplayName({ firstName: "Lebron", lastName: "James" })).toBe("James Family");
    });

    it("falls back to first name Lead when last name missing", () => {
        expect(buildHouseholdLeadDisplayName({ firstName: "Alex" })).toBe("Alex Lead");
    });
});

describe("formatHouseholdLeadDisplayTitle", () => {
    it("formats stripped household base as Family", () => {
        expect(formatHouseholdLeadDisplayTitle("Mitchell", "Lead")).toBe("Mitchell Family");
    });

    it("returns pre-formatted names unchanged", () => {
        expect(formatHouseholdLeadDisplayTitle("James Family", "Lead")).toBe("James Family");
    });
});

describe("isHouseholdFormattedLeadName", () => {
    it("detects Family and Lead suffixes", () => {
        expect(isHouseholdFormattedLeadName("James Family")).toBe(true);
        expect(isHouseholdFormattedLeadName("Alex Lead")).toBe(true);
        expect(isHouseholdFormattedLeadName("Lebron James")).toBe(false);
    });
});
