import { describe, expect, it } from "vitest";
import {
    PRESENTATION_DATA_VALUE,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_LABEL,
    PRESENTATION_RECORD_TITLE,
    PRESENTATION_SECTION_HEADER,
    PRESENTATION_SUPPORTING,
    presentationTierClass,
} from "@/lib/presentation/presentationTypography";

describe("presentationTypography", () => {
    it("exports six-tier hierarchy tokens as non-empty class strings", () => {
        expect(PRESENTATION_RECORD_TITLE).toContain("font-semibold");
        expect(PRESENTATION_SECTION_HEADER).toContain("font-semibold");
        expect(PRESENTATION_DATA_VALUE).toContain("font-medium");
        expect(PRESENTATION_LABEL).toContain("uppercase");
        expect(PRESENTATION_SUPPORTING).toContain("text-[11px]");
        expect(PRESENTATION_EMPTY_STATE).toContain("text-[12px]");
    });

    it("values are darker than labels in token opacity", () => {
        expect(PRESENTATION_DATA_VALUE).toMatch(/\/9[02]/);
        expect(PRESENTATION_LABEL).toMatch(/\/4[68]/);
    });

    it("presentationTierClass maps semantic roles", () => {
        expect(presentationTierClass("dataValue")).toBe(PRESENTATION_DATA_VALUE);
        expect(presentationTierClass("emptyState")).toBe(PRESENTATION_EMPTY_STATE);
    });
});
