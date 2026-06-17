import { describe, expect, it } from "vitest";
import { calculateAgeFromDob } from "@/lib/intake/normalize/calculateAgeFromDob";

describe("calculateAgeFromDob", () => {
    it("returns years and months with readable display", () => {
        const result = calculateAgeFromDob("2024-06-06", new Date("2026-06-17"));
        expect(result).not.toBeNull();
        expect(result!.value.years).toBe(2);
        expect(result!.value.months).toBe(0);
        expect(result!.display).toBe("2 yrs 0 mos");
    });

    it("formats under-one-year as months only", () => {
        const result = calculateAgeFromDob("2025-08-01", new Date("2026-06-17"));
        expect(result).not.toBeNull();
        expect(result!.value.years).toBe(0);
        expect(result!.display).toMatch(/mos$/);
    });

    it("returns null for invalid dob", () => {
        expect(calculateAgeFromDob("not-a-date")).toBeNull();
    });
});
