/**
 * POS-FP16 — bbox → SVG schematic mapping + provenance preservation.
 *
 * The field map is a drawable schematic of detected AcroForm regions (we can't overlay on
 * the native PDF viewer). These tests pin the deterministic geometry (Y-flip, page
 * grouping, padded extent) and prove the reviewed field list keeps PDF provenance
 * (pdf_field_name / page / bbox) through to the created draft.
 */

import { describe, it, expect } from "vitest";
import { computePageMaps, hasFieldRegions, type FieldWithRegion } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";

const FIELDS: FieldWithRegion[] = [
    { id: "f1", label: "Child's Name", type: "text", confidence: "high", page: 1, bbox: [72, 700, 300, 718] },
    { id: "f2", label: "Birthdate", type: "date", confidence: "high", page: 1, bbox: [320, 700, 460, 718] },
    { id: "f3", label: "Signature", type: "signature", confidence: "high", page: 2, bbox: [72, 120, 300, 150] },
    { id: "f4", label: "Notes", type: "text", confidence: "high" }, // no region → not drawn
];

describe("computePageMaps", () => {
    const pages = computePageMaps(FIELDS);

    it("groups by page and drops fields with no region", () => {
        expect(pages.map((p) => p.page)).toEqual([1, 2]);
        expect(pages[0].rects.map((r) => r.id)).toEqual(["f1", "f2"]);
        expect(pages.flatMap((p) => p.rects).some((r) => r.id === "f4")).toBe(false);
    });

    it("flips the Y axis (PDF bottom-left → SVG top-left)", () => {
        const page1 = pages[0];
        const r1 = page1.rects.find((r) => r.id === "f1")!;
        const r2 = page1.rects.find((r) => r.id === "f2")!;
        // Same PDF top (718) → same SVG y; both near the top of the page extent.
        expect(r1.y).toBeCloseTo(r2.y, 5);
        // f2 is to the right of f1 in PDF x → larger SVG x.
        expect(r2.x).toBeGreaterThan(r1.x);
        // widths/heights match the bbox spans.
        expect(r1.w).toBeCloseTo(228, 0);
        expect(r1.h).toBeCloseTo(18, 0);
    });

    it("hasFieldRegions reflects whether any field is drawable", () => {
        expect(hasFieldRegions(FIELDS)).toBe(true);
        expect(hasFieldRegions([{ id: "x", label: "x", type: "text" }])).toBe(false);
    });
});

describe("buildManualFormDraft preserves PDF provenance", () => {
    const draft = buildManualFormDraft({
        title: "MO500",
        sourceDocumentId: "doc-1",
        fields: [
            { label: "Child's Name", type: "text", section: "Page 1", pdf_field_name: "child_name", page: 1, bbox: [72, 700, 300, 718] },
            { label: "Extra note", type: "text", section: "Page 1" }, // manual, no provenance
        ],
    });

    it("carries pdf_field_name / page / bbox onto reviewed fields", () => {
        const named = draft.fields.find((f) => f.label === "Child's Name")!;
        expect(named.pdf_field_name).toBe("child_name");
        expect(named.page).toBe(1);
        expect(named.bbox).toEqual([72, 700, 300, 718]);
        expect(named.evidence).toBe("pdf_field");
    });

    it("marks fields without a region as operator-added (no PDF mapping yet)", () => {
        const manual = draft.fields.find((f) => f.label === "Extra note")!;
        expect(manual.pdf_field_name).toBeUndefined();
        expect(manual.bbox).toBeUndefined();
        expect(manual.evidence).toBe("operator");
    });
});
