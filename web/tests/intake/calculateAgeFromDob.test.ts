import { describe, expect, it } from "vitest";
import { deriveAgeFromDateOfBirth } from "@/lib/fields/derived/ageFromDateOfBirth";

describe("deriveAgeFromDateOfBirth (intake alias)", () => {
    it("returns years and months with readable display", () => {
        const result = deriveAgeFromDateOfBirth("2024-06-06", new Date("2026-06-17"));
        expect(result).not.toBeNull();
        expect(result!.value.years).toBe(2);
        expect(result!.value.months).toBe(0);
        expect(result!.display).toBe("2 yrs 0 mos");
    });

    it("formats under-one-year as months only", () => {
        const result = deriveAgeFromDateOfBirth("2025-08-01", new Date("2026-06-17"));
        expect(result).not.toBeNull();
        expect(result!.value.years).toBe(0);
        expect(result!.display).toMatch(/mos$/);
    });

    it("returns null for invalid dob", () => {
        expect(deriveAgeFromDateOfBirth("not-a-date")).toBeNull();
    });
});
