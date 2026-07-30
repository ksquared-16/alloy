/**
 * Detected questions must carry the GEOMETRY they were read from.
 *
 * Product QA blocker: the "Detailed Questions" review pane rendered an empty document canvas. The
 * cause was not the canvas — it was that the native-layout detector kept only `page` and discarded
 * every coordinate the extractor had already computed. `computePageMaps` skips any field without
 * `page` + `bbox`, so a Configuration Discovery draft produced zero regions and there was literally
 * nothing to draw.
 *
 * These tests pin the recovered geometry against the same deterministic 4-page Enrollment Record
 * fixture the detector acceptance suite uses, so a regression shows up as a failing assertion rather
 * than as an empty pane in QA.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { buildLayoutLines } from "@/lib/pos/processingCase/structure/pdfLayoutLines";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import {
    labelBbox,
    layoutPageContexts,
    lineBbox,
    xRangeForCharRange,
} from "@/lib/pos/processingCase/structure/layoutFieldGeometry";
import { computePageMaps } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import type { LayoutDocument, LayoutLine, LayoutTextItem } from "@/lib/pos/processingCase/structure/pdfLayoutTypes";

type GeomItem = { s: string; x: number; y: number; w: number; h: number; fh: number };
type Geom = { pageCount: number; pages: { page: number; width: number; height: number; items: GeomItem[] }[] };

function loadFixtureDoc(): LayoutDocument {
    const raw = fs.readFileSync(path.join(__dirname, "fixtures/enrollment-record-8.25.geom.json"), "utf8");
    const g = JSON.parse(raw) as Geom;
    return {
        pageCount: g.pageCount,
        ok: true,
        reason: null,
        pages: g.pages.map((p) => ({
            page: p.page,
            width: p.width,
            height: p.height,
            lines: buildLayoutLines(
                p.items.map((it): LayoutTextItem => ({ s: it.s, x: it.x, y: it.y, w: it.w, h: it.h, fh: it.fh })),
                p.page
            ),
        })),
    };
}

const doc = loadFixtureDoc();
const structure = detectLayoutStructure(doc);
const allFields = structure.sections.flatMap((s) => s.fields);

/** A synthetic line with known coordinates — exact arithmetic, no fixture dependence. */
function line(items: Array<[string, number, number]>, y = 700): LayoutLine {
    const built: LayoutTextItem[] = items.map(([s, x, w]) => ({ s, x, y, w, h: 10, fh: 10 }));
    return {
        page: 1,
        y,
        xStart: built[0]!.x,
        xEnd: built[built.length - 1]!.x + built[built.length - 1]!.w,
        fhMax: 10,
        text: built.map((b) => b.s).join(" "),
        items: built,
    };
}

describe("geometry is recovered, not invented", () => {
    it("1. every detected field carries a page AND a bbox", () => {
        expect(allFields.length).toBeGreaterThan(0);
        const withoutGeometry = allFields.filter((f) => typeof f.page !== "number" || !Array.isArray(f.bbox));
        expect(
            withoutGeometry.map((f) => f.label),
            "fields without geometry cannot be highlighted on the document"
        ).toEqual([]);
    });

    it("2. every bbox is well-formed and inside its page", () => {
        const pageDims = new Map(doc.pages.map((p) => [p.page, { w: p.width, h: p.height }]));
        for (const f of allFields) {
            const [x0, y0, x1, y1] = f.bbox!;
            const dims = pageDims.get(f.page!)!;
            expect(dims, `page ${f.page} missing`).toBeTruthy();
            expect(x1, `${f.label}: x1 must exceed x0`).toBeGreaterThan(x0);
            expect(y1, `${f.label}: y1 must exceed y0`).toBeGreaterThan(y0);
            expect(x0, `${f.label}: x0 off page`).toBeGreaterThanOrEqual(-1);
            expect(y0, `${f.label}: y0 off page`).toBeGreaterThanOrEqual(-1);
            expect(x1, `${f.label}: x1 past page width`).toBeLessThanOrEqual(dims.w + 1);
            expect(y1, `${f.label}: y1 past page height`).toBeLessThanOrEqual(dims.h + 1);
        }
    });

    it("3. geometry spans every page the document actually uses", () => {
        const pages = new Set(allFields.map((f) => f.page));
        expect(pages.size, "regions collapsed onto one page").toBeGreaterThan(1);
    });

    it("4. several labels on ONE line get DISTINCT boxes, not one stacked pile", () => {
        // "Last Name: ____ First Name: ____" — the exact shape that would otherwise produce
        // identical, unusable overlapping highlights.
        const l = line([
            ["Last", 100, 20],
            ["Name:", 121, 25],
            ["_____", 147, 30],
            ["First", 200, 20],
            ["Name:", 221, 25],
            ["_____", 247, 30],
        ]);
        const last = labelBbox(l, "Last Name:");
        const first = labelBbox(l, "First Name:");
        expect(last[0]).toBeLessThan(first[0]);
        expect(last[2]).toBeLessThanOrEqual(first[0] + 1);
        expect(last).not.toEqual(first);
    });

    it("5. a repeated label resolves to its Nth occurrence", () => {
        const l = line([
            ["Date", 100, 20],
            ["Date", 200, 20],
        ]);
        const a = labelBbox(l, "Date", 0);
        const b = labelBbox(l, "Date", 1);
        expect(a[0]).toBeLessThan(b[0]);
    });

    it("6. an unlocatable label falls back to the line, never to nothing", () => {
        const l = line([["Something", 100, 40]]);
        const box = labelBbox(l, "Totally Absent Label");
        expect(box).toEqual(lineBbox(l));
    });

    it("7. char→x mapping is proportional and bounded", () => {
        const l = line([["ABCD", 100, 40]]);
        const r = xRangeForCharRange(l, 0, 2);
        expect(r).toBeTruthy();
        expect(r!.x0).toBeCloseTo(100, 5);
        expect(r!.x1).toBeCloseTo(120, 5);
        expect(xRangeForCharRange(l, 2, 2)).toBeNull();
        expect(xRangeForCharRange(l, -1, 3)).toBeNull();
    });

    it("8. the box surrounds the baseline rather than cutting through the text", () => {
        const l = line([["Name", 100, 40]], 700);
        const [, y0, , y1] = lineBbox(l);
        expect(y0, "bottom must sit below the baseline").toBeLessThan(700);
        expect(y1, "top must sit above the baseline").toBeGreaterThan(700);
    });
});

describe("geometry survives into the draft the review canvas reads", () => {
    const draft = buildFormDraftFromStructure({
        structure,
        sourceDocumentId: "doc-1",
        extractedText: "",
        fileName: "enrollment-record-8.25.pdf",
        classificationKey: null,
        extractedTextAvailable: true,
        pdfPages: layoutPageContexts(doc.pages),
    });

    it("9. draft fields keep page + bbox", () => {
        const geo = draft.fields.filter((f) => typeof f.page === "number" && Array.isArray(f.bbox));
        expect(geo.length, "the draft dropped the geometry the detector produced").toBe(draft.fields.length);
    });

    it("10. the draft carries page dimensions", () => {
        expect(draft.pdf_pages, "without page dims nothing can be placed").toBeTruthy();
        expect(draft.pdf_pages!.length).toBe(doc.pages.length);
        for (const p of draft.pdf_pages!) {
            expect(p.width).toBeGreaterThan(0);
            expect(p.height).toBeGreaterThan(0);
        }
    });

    it("11. computePageMaps produces real regions — the check that gates the canvas", () => {
        // `hasRegions` in the review column is exactly this predicate. It was false for every
        // Configuration Discovery draft, which is why the pane was empty.
        const maps = computePageMaps(
            draft.fields.map((f) => ({
                id: f.id,
                label: f.label,
                type: f.type,
                confidence: f.confidence,
                page: f.page,
                bbox: f.bbox,
            })),
            draft.pdf_pages
        );
        const hasRegions = maps.some((p) => p.rects.length > 0);
        expect(hasRegions, "the review canvas would render empty").toBe(true);
        expect(maps.reduce((n, p) => n + p.rects.length, 0)).toBe(draft.fields.length);
    });

    it("12. page dimensions come from the real page, not a bbox-extent guess", () => {
        const first = draft.pdf_pages![0]!;
        const src = doc.pages[0]!;
        expect(first.width).toBeCloseTo(src.width, 5);
        expect(first.height).toBeCloseTo(src.height, 5);
    });
});
