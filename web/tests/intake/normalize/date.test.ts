import { describe, expect, it } from "vitest";
import { findDobInParens, parseFlexibleDate } from "@/lib/intake/normalize/date";

describe("intake normalize date", () => {
    it("parses US dates to ISO", () => {
        expect(parseFlexibleDate("06/06/2024")).toBe("2024-06-06");
        expect(parseFlexibleDate("8/1/25")).toBe("2025-08-01");
    });

    it("parses ISO dates", () => {
        expect(parseFlexibleDate("2024-06-06")).toBe("2024-06-06");
    });

    it("finds DOB in parentheses", () => {
        const found = findDobInParens("child is Kai (06/06/2024 DOB)");
        expect(found?.normalized).toBe("2024-06-06");
    });
});
