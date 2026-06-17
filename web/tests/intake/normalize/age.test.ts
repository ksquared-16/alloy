import { describe, expect, it } from "vitest";
import { extractAgeFromText, extractLabeledAge } from "@/lib/intake/normalize/age";

describe("intake normalize age", () => {
    it("extracts years old phrasing", () => {
        expect(extractAgeFromText("he's 2 years old")?.years).toBe(2);
        expect(extractAgeFromText("2 yrs old")).toEqual({ raw: "2 yrs old", years: 2 });
        expect(extractAgeFromText("2yo")?.years).toBe(2);
    });

    it("extracts labeled age", () => {
        expect(extractLabeledAge("Age: 3")?.years).toBe(3);
    });
});
