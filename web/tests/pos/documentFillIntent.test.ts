import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { classifyDocumentFillIntent } from "@/lib/pos/processingCase/structure/documentFillIntent";
import { extractPdfPositional } from "@/lib/pos/processingCase/structure/pdfPositionalExtract";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import type { LayoutDocument, LayoutLine } from "@/lib/pos/processingCase/structure/pdfLayoutTypes";

const line = (page: number, text: string, y = 700): LayoutLine => ({
    page, y, xStart: 72, xEnd: 500, fhMax: 11, text,
    items: [{ s: text, x: 72, y, w: 428, h: 11, fh: 11 }],
});
const doc = (pages: string[][]): LayoutDocument => ({
    ok: true, reason: null, pageCount: pages.length,
    pages: pages.map((lines, i) => ({ page: i + 1, width: 612, height: 792, lines: lines.map((t, j) => line(i + 1, t, 700 - j * 16)) })),
});

const PROSE = [
    "Communication with families is an extremely important piece of your child's education and we ask that all communication be kept professional.",
    "Conferences are scheduled annually and at the teachers or parent's request as necessary.",
    "Teachers will communicate regularly about how your child is doing in the classroom via verbal conversations at pick up and drop off.",
];

describe("classifyDocumentFillIntent", () => {
    it("calls a multi-page prose document with nowhere to write a reference document", () => {
        const v = classifyDocumentFillIntent(doc([PROSE, PROSE, PROSE]));
        expect(v.intent).toBe("reference");
        expect(v.signals.join(" ")).toContain("no blank");
    });

    it("a single blank anywhere makes it fillable", () => {
        const v = classifyDocumentFillIntent(doc([PROSE, [...PROSE, "Parent signature: ____________"], PROSE]));
        expect(v.intent).toBe("fillable");
        expect(v.signals[0]).toContain("blank to write on");
    });

    it("a single checkbox anywhere makes it fillable", () => {
        expect(classifyDocumentFillIntent(doc([PROSE, [...PROSE, "☐ I agree"], PROSE])).intent).toBe("fillable");
    });

    it("a single Yes / No choice makes it fillable", () => {
        expect(classifyDocumentFillIntent(doc([PROSE, [...PROSE, "Allergies?  Yes / No"], PROSE])).intent).toBe("fillable");
    });

    it("short label-shaped lines are a form even with no markers at all", () => {
        const labels = ["Name of Child", "Date of Birth", "Home Address", "Parent Name", "Phone"];
        expect(classifyDocumentFillIntent(doc([labels, labels])).intent).toBe("fillable");
    });

    it("refuses to call a single page a reference document", () => {
        expect(classifyDocumentFillIntent(doc([PROSE])).intent).toBe("fillable");
    });

    it("judges nothing when it read nothing", () => {
        expect(classifyDocumentFillIntent(null).intent).toBe("fillable");
        expect(classifyDocumentFillIntent(doc([])).intent).toBe("fillable");
    });
});

describe("G4 — the real Family Handbook stops inventing fields", () => {
    const FIXTURE = path.join(process.cwd(), "tests/fixtures/processing/school-of-enrichment-family-handbook.pdf");

    it("has zero fill affordances across 23 pages, and yields zero participant fields", async () => {
        const layout = await extractPdfPositional(new Uint8Array(fs.readFileSync(FIXTURE)));
        const verdict = classifyDocumentFillIntent(layout);
        expect(verdict.evidence.pages).toBe(23);
        expect(verdict.evidence.underscore_runs).toBe(0);
        expect(verdict.evidence.checkbox_glyphs).toBe(0);
        expect(verdict.evidence.yes_no_pairs).toBe(0);
        expect(verdict.intent).toBe("reference");

        const structure = detectLayoutStructure(layout);
        expect(structure.fill_intent?.intent).toBe("reference");
        expect(structure.sections.reduce((n, s) => n + s.fields.length, 0), "a handbook has nowhere to write").toBe(0);
    }, 120_000);

    it("says so out loud rather than dropping fields silently", async () => {
        const layout = await extractPdfPositional(new Uint8Array(fs.readFileSync(FIXTURE)));
        const structure = detectLayoutStructure(layout);
        expect(structure.warnings.join(" ")).toContain("reference document");
        expect(structure.warnings.join(" ")).toContain("kept as content");
    }, 120_000);

    it("still understands the document — sections, policy prose and acknowledgements survive", async () => {
        const layout = await extractPdfPositional(new Uint8Array(fs.readFileSync(FIXTURE)));
        const structure = detectLayoutStructure(layout);
        expect(structure.sections.length).toBeGreaterThan(20);
        expect(structure.sections.some((s) => s.disposition === "acknowledgement")).toBe(true);
        expect(structure.sections.filter((s) => (s.static_text?.length ?? 0) > 0).length).toBeGreaterThan(20);
    }, 120_000);

    it("does not turn the enrollment record fixture into a reference document", async () => {
        // 64 lines of it are ruled blanks. It is unambiguously a form.
        const layout = await extractPdfPositional(new Uint8Array(fs.readFileSync(path.join(process.cwd(), "tests/pos/fixtures/enrollment-record-8.25.pdf"))));
        const verdict = classifyDocumentFillIntent(layout);
        expect(verdict.intent).toBe("fillable");
        expect(verdict.evidence.underscore_runs).toBeGreaterThan(50);
    }, 120_000);
});
