import { describe, expect, it } from "vitest";
import { brandMonogram } from "@/lib/forms/processingFormBranding";

describe("brand monogram", () => {
    it("is the initials of the school's name", () => {
        expect(brandMonogram("Lil' Sunshine Childcare")).toBe("LS");
        expect(brandMonogram("School of Enrichment")).toBe("SE");
        expect(brandMonogram("Firefly")).toBe("FI");
    });
    it("is empty without a configured name — never the placeholder's letters", () => {
        expect(brandMonogram("")).toBe("");
        expect(brandMonogram(null)).toBe("");
    });
});
