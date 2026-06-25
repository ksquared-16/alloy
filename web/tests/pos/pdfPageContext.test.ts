/**
 * POS-FP17 — page context schematic + manual mapping geometry.
 *
 * Proves: with page dimensions the field map is drawn in REAL page space (so the boxes sit
 * where they do on the form and text context can be placed); a rectangle drawn on that
 * schematic inverts back to the correct PDF bbox (manual mapping); and a manually-mapped
 * field keeps page/bbox + a manual_pdf_mapping source through to the created draft.
 */

import { describe, it, expect } from "vitest";
import { computePageMaps, svgRectToPdfBbox, type FieldWithRegion } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import type { PdfPageContext } from "@/lib/pos/processingCase/structure/pdfAcroForm";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";

const FIELDS: FieldWithRegion[] = [
    { id: "f1", label: "Child's Name", type: "text", confidence: "high", page: 1, bbox: [72, 700, 300, 718] },
];
const CONTEXT: PdfPageContext[] = [
    { page: 1, width: 612, height: 792, texts: [{ x: 80, y: 710, str: "CHILD'S NAME" }] },
];

describe("computePageMaps with page context", () => {
    const [pg] = computePageMaps(FIELDS, CONTEXT);

    it("uses real page dimensions and flags hasPageDims", () => {
        expect(pg.hasPageDims).toBe(true);
        expect(pg.width).toBe(612);
        expect(pg.height).toBe(792);
        expect(pg.originX).toBe(0);
        expect(pg.topInPdf).toBe(792);
    });

    it("projects the field box into page space (Y-flipped)", () => {
        const r = pg.rects[0];
        expect(r.x).toBeCloseTo(72, 1);
        expect(r.y).toBeCloseTo(74, 1); // 792 - 718
        expect(r.w).toBeCloseTo(228, 1);
        expect(r.h).toBeCloseTo(18, 1);
    });

    it("projects page text runs as context", () => {
        expect(pg.texts).toHaveLength(1);
        expect(pg.texts[0].str).toBe("CHILD'S NAME");
        expect(pg.texts[0].y).toBeCloseTo(82, 1); // 792 - 710
    });

    it("falls back to extent space (Context unavailable) without context", () => {
        const [p0] = computePageMaps(FIELDS);
        expect(p0.hasPageDims).toBe(false);
        expect(p0.texts).toEqual([]);
    });
});

describe("svgRectToPdfBbox — manual mapping inverse", () => {
    it("round-trips a field box back to its PDF bbox", () => {
        const [pg] = computePageMaps(FIELDS, CONTEXT);
        const r = pg.rects[0];
        const bbox = svgRectToPdfBbox({ x: r.x, y: r.y, w: r.w, h: r.h }, pg);
        expect(bbox[0]).toBeCloseTo(72, 1);
        expect(bbox[1]).toBeCloseTo(700, 1);
        expect(bbox[2]).toBeCloseTo(300, 1);
        expect(bbox[3]).toBeCloseTo(718, 1);
    });
});

describe("buildManualFormDraft — manual mapping provenance", () => {
    it("keeps page/bbox and the manual_pdf_mapping source", () => {
        const draft = buildManualFormDraft({
            title: "MO500",
            sourceDocumentId: "doc-1",
            fields: [
                { label: "Allergies", type: "text", section: "Health", page: 1, bbox: [72, 500, 540, 560], evidence: "manual_pdf_mapping" },
            ],
        });
        const f = draft.fields[0];
        expect(f.page).toBe(1);
        expect(f.bbox).toEqual([72, 500, 540, 560]);
        expect(f.evidence).toBe("manual_pdf_mapping");
    });
});
