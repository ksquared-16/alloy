import { describe, expect, it } from "vitest";
import {
    fieldRegionPreviewLayoutClass,
    fieldRegionPreviewLayoutLabel,
} from "@/lib/forms/documentCompositionPreviewPresentation";

describe("documentCompositionPreviewPresentation FD-12", () => {
    it("maps field region layouts to distinct preview grid classes", () => {
        expect(fieldRegionPreviewLayoutClass("one_column")).toContain("grid-cols-1");
        expect(fieldRegionPreviewLayoutClass("two_column")).toContain("grid-cols-2");
        expect(fieldRegionPreviewLayoutClass("three_column")).toContain("grid-cols-3");
        expect(fieldRegionPreviewLayoutClass("inline_compact")).toContain("flex");
    });

    it("labels three-column layout for preview aria", () => {
        expect(fieldRegionPreviewLayoutLabel("three_column")).toBe("Three columns");
    });
});
