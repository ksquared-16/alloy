import { describe, expect, it } from "vitest";
import {
    findDateInText,
    findDobInParens,
    formatIsoDateForDisplay,
    parseFlexibleDate,
} from "@/lib/intake/normalize/date";

describe("parseFlexibleDate — hardened formats", () => {
    it.each([
        ["2.2.24", "2024-02-02"],
        ["2/2/24", "2024-02-02"],
        ["02/02/24", "2024-02-02"],
        ["02-02-24", "2024-02-02"],
        ["2024-02-02", "2024-02-02"],
        ["Feb 2 2024", "2024-02-02"],
        ["February 2 2024", "2024-02-02"],
        ["Feb 2, 2024", "2024-02-02"],
        ["2 February 2024", "2024-02-02"],
        ["06/06/2024", "2024-06-06"],
        ["8/1/25", "2025-08-01"],
    ])("parses %s → %s", (input, expected) => {
        expect(parseFlexibleDate(input)).toBe(expected);
    });

    it("rejects invalid calendar dates", () => {
        expect(parseFlexibleDate("2/31/2024")).toBeNull();
        expect(parseFlexibleDate("not a date")).toBeNull();
    });
});

describe("formatIsoDateForDisplay", () => {
    it("formats ISO to MM/DD/YYYY", () => {
        expect(formatIsoDateForDisplay("2024-02-02")).toBe("02/02/2024");
    });
});

describe("findDateInText", () => {
    it("finds named month dates in narrative", () => {
        const found = findDateInText("start date Feb 2 2024 please");
        expect(found?.normalized).toBe("2024-02-02");
    });
});

describe("findDobInParens", () => {
    it("finds DOB in parentheses with US and named dates", () => {
        expect(findDobInParens("child is Kai (06/06/2024 DOB)")?.normalized).toBe("2024-06-06");
        expect(findDobInParens("child is Kai (Feb 2 2024 DOB)")?.normalized).toBe("2024-02-02");
    });
});
