/**
 * POS-FP15 — native-layout detector regression + acceptance certification.
 *
 * Fixture: `fixtures/enrollment-record-8.25.pdf` — a 4-page, Word-generated childcare
 * Enrollment Record with clean selectable text, no AcroForm, structured headings, underline
 * answer regions, a single-choice hospital list, Y/N questions with conditional explanations,
 * repeating guardian/emergency/pickup groups, a legal emergency-authorization paragraph, parent
 * + director signature blocks, and a page-4 "Classroom Copy" duplicate.
 *
 * The detector consumes POSITIONAL lines (x / baseline-y / font-height), so the test input is the
 * captured per-page geometry (`enrollment-record-8.25.geom.json`) run through the same
 * `buildLayoutLines` the runtime extractor uses. This is deterministic and needs no PDF library.
 *
 * These assertions ARE the acceptance certification for the fixture: section structure, field
 * labels/types, duplicate handling, and signature/static classification.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { buildLayoutLines } from "@/lib/pos/processingCase/structure/pdfLayoutLines";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import { extractPdfPositional } from "@/lib/pos/processingCase/structure/pdfPositionalExtract";
import type { LayoutDocument, LayoutTextItem } from "@/lib/pos/processingCase/structure/pdfLayoutTypes";

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
const result = detectLayoutStructure(doc);
const sectionByTitle = (needle: RegExp) => result.sections.find((s) => needle.test(s.title));
const allFields = result.sections.flatMap((s) => s.fields);
const labels = allFields.map((f) => f.label);

describe("detectLayoutStructure — Enrollment Record acceptance fixture", () => {
    it("segments the document into many sections, not one flat blob", () => {
        expect(result.sections.length).toBeGreaterThanOrEqual(12);
    });

    it("produces clean labels with no instruction bleed (regression: 'out in full detail…')", () => {
        expect(labels).not.toContain("out in full detail. Date of Enrollment");
        expect(labels.some((l) => /out in full detail/i.test(l))).toBe(false);
        // Every label starts capitalized — no sentence-fragment bleed leaked in as a field.
        expect(labels.every((l) => /^[A-Z0-9]/.test(l))).toBe(true);
        expect(labels).toContain("Date of Enrollment");
    });

    it("recognizes simple Contact Information fields by page 1", () => {
        const s = sectionByTitle(/^Contact Information$/);
        expect(s).toBeTruthy();
        for (const l of ["Child's Name", "Nickname", "Date of Birth", "Allergies", "Home Address", "City", "State", "Zip"]) {
            expect(s!.fields.map((f) => f.label)).toContain(l);
        }
        expect(s!.fields.find((f) => f.label === "Date of Birth")!.suggested_type).toBe("date");
    });

    it("preserves repeating guardian / emergency / pickup groups as distinct sections", () => {
        expect(sectionByTitle(/Parent or Guardian #1/)).toBeTruthy();
        expect(sectionByTitle(/Parent or Guardian #2/)).toBeTruthy();
        expect(sectionByTitle(/Emergency Contacts/)).toBeTruthy();
        expect(sectionByTitle(/Persons authorized to pick up/)).toBeTruthy();
    });

    it("recognizes the single-choice hospital list as a select with its options", () => {
        const med = sectionByTitle(/Medical Information/);
        const hospital = med!.fields.find((f) => /Preferred Hospital/i.test(f.label));
        expect(hospital).toBeTruthy();
        expect(hospital!.suggested_type).toBe("select");
        expect((hospital!.options ?? []).length).toBe(6);
        expect(hospital!.options!.some((o) => /Memorial/i.test(o))).toBe(true);
        expect(hospital!.options!.some((o) => /Other/i.test(o))).toBe(true);
    });

    it("recognizes Y/N questions and their conditional explanation fields", () => {
        const yn = allFields.filter((f) => f.suggested_type === "checkbox");
        expect(yn.some((f) => /health care plan/i.test(f.label))).toBe(true);
        expect(yn.some((f) => /fully immunized/i.test(f.label))).toBe(true);
        expect(yn.some((f) => /on any medications/i.test(f.label))).toBe(true);
        // conditional explanation fields exist for the "please explain" questions
        expect(allFields.some((f) => /medications — if yes, please explain/i.test(f.label))).toBe(true);
        expect(allFields.filter((f) => /if yes, please explain/i.test(f.label)).length).toBeGreaterThanOrEqual(3);
    });

    it("preserves the emergency-authorization paragraph as static/legal content, not fields", () => {
        const auth = sectionByTitle(/Authorization for Emergency Medical Care/);
        expect(auth).toBeTruthy();
        expect(auth!.disposition).toBe("acknowledgement");
        expect(auth!.static_text).toMatch(/I hereby give my permission/i);
        // the mid-sentence "…for my child, ___" blank is NOT promoted to a field
        expect(auth!.fields.some((f) => /surgical care|my child/i.test(f.label))).toBe(false);
    });

    it("classifies parent and director signature blocks as signature dispositions", () => {
        const parentSig = sectionByTitle(/Parent\/Guardian Signatures/);
        const dirSig = sectionByTitle(/Director Signature/);
        expect(parentSig!.disposition).toBe("signature");
        expect(dirSig!.disposition).toBe("signature");
        // director block has exactly one signature + one date — no phantom duplicate pair
        expect(dirSig!.fields.filter((f) => f.suggested_type === "signature").length).toBe(1);
        expect(dirSig!.fields.filter((f) => f.suggested_type === "date").length).toBe(1);
        expect(parentSig!.fields.filter((f) => /Print Name/i.test(f.label)).length).toBe(2);
    });

    it("detects page 4 as a classroom-copy/output duplicate, not a new set of questions", () => {
        const p4 = result.sections.filter((s) => s.page === 4);
        expect(p4.length).toBeGreaterThan(0);
        expect(p4.every((s) => s.duplicate === true)).toBe(true);
        expect(p4.every((s) => s.disposition === "static_reference")).toBe(true);
        expect(sectionByTitle(/Classroom Copy/)).toBeTruthy();
        expect(result.warnings.some((w) => /output\/classroom copy/i.test(w))).toBe(true);
    });

    it("does not duplicate page-1 questions as active questions on page 4", () => {
        const activeChildNames = allFields.filter((f) => f.label === "Child's Name" && result.sections.find((s) => s.fields.includes(f))?.duplicate !== true);
        expect(activeChildNames.length).toBe(1);
    });
});

/**
 * End-to-end: the ACTUAL PDF bytes through the runtime positional extractor (unpdf getTextContent)
 * → detector. Proves extraction + detection agree with the captured-geometry fixture on real bytes.
 * Skips when unpdf can't load in this environment (the extractor degrades honestly, never throws).
 */
describe("detectLayoutStructure — end-to-end from the real PDF bytes", () => {
    it("extracts native text with geometry and detects the same structure", async () => {
        const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/enrollment-record-8.25.pdf")));
        const layout = await extractPdfPositional(bytes);
        if (!layout.ok && layout.reason === "extractor_unavailable") {
            // unpdf not loadable here — the geometry-fixture tests above are the regression gate.
            expect(layout.pages.length).toBe(0);
            return;
        }
        expect(layout.ok).toBe(true);
        expect(layout.pageCount).toBe(4);

        const res = detectLayoutStructure(layout);
        const fields = res.sections.flatMap((s) => s.fields);
        expect(res.sections.length).toBeGreaterThanOrEqual(12);
        expect(fields.some((f) => /out in full detail/i.test(f.label))).toBe(false);
        expect(fields.find((f) => /Preferred Hospital/.test(f.label))?.options?.length).toBe(6);
        expect(res.sections.filter((s) => s.page === 4).every((s) => s.duplicate)).toBe(true);
        expect(res.sections.some((s) => s.disposition === "signature")).toBe(true);
        expect(res.sections.some((s) => s.disposition === "acknowledgement")).toBe(true);
    });
});
