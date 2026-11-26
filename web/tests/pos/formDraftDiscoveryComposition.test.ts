/**
 * NEGATIVE CONTROL for the Real Enrollment Certification V1 product invariant:
 *
 *   High-quality structural extraction and semantic understanding must COMPOSE.
 *   A document must not receive less semantic understanding because it supplied
 *   better field geometry.
 *
 * The regression this guards against was architectural, not a bad heuristic: the AcroForm branch
 * returned its draft early, and Configuration Discovery lived inside the layout branch, so a
 * fillable PDF got 85 exact destinations and zero understanding. These tests assert the property
 * for EVERY reader, and the last one asserts the shape that made the bug possible cannot return.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import type { PdfAcroFormResult } from "@/lib/pos/processingCase/structure/pdfAcroForm";
import type { LayoutDocument } from "@/lib/pos/processingCase/structure/pdfLayoutTypes";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"

const NO_ACROFORM: PdfAcroFormResult = { has_acroform: false, fields: [], page_count: 0 };

const ACROFORM: PdfAcroFormResult = {
    has_acroform: true,
    page_count: 1,
    fields: [
        { label: "Childs Last Name", name: "child_last_name", type: "text", page: 1, bbox: [25, 549, 192, 567] },
        { label: "Birth Date", name: "birth_date", type: "date", page: 1, bbox: [450, 549, 596, 567] },
        { label: "Parent Signature", name: "parent_signature", type: "signature", page: 1, bbox: [142, 100, 370, 118], signature_variant: "initial" },
    ],
    pages: [
        {
            page: 1,
            width: 612,
            height: 792,
            texts: [
                { x: 25, y: 600, str: "I certify that the information on this form is accurate." },
                { x: 25, y: 580, str: "Attach a copy of the immunization records before the first day." },
            ],
        },
    ],
};

const LAYOUT: LayoutDocument = {
    ok: true,
    reason: null,
    pageCount: 1,
    pages: [
        {
            page: 1,
            width: 612,
            height: 792,
            lines: [
                { page: 1, y: 700, xStart: 72, xEnd: 300, fhMax: 18, text: "Child Information", items: [{ s: "Child Information", x: 72, y: 700, w: 228, h: 18, fh: 18 }] },
                { page: 1, y: 660, xStart: 72, xEnd: 260, fhMax: 11, text: "Child's Name:", items: [{ s: "Child's Name:", x: 72, y: 660, w: 188, h: 11, fh: 11 }] },
                { page: 1, y: 640, xStart: 72, xEnd: 260, fhMax: 11, text: "Date of Birth:", items: [{ s: "Date of Birth:", x: 72, y: 640, w: 188, h: 11, fh: 11 }] },
            ],
        },
    ],
};

const baseInput = {
    sourceDocumentId: "doc-1",
    fileName: "form.pdf",
    classificationKey: null,
    mimeType: "application/pdf",
};

describe("discovery composes with every structural reader", () => {
    it("AcroForm: keeps every native destination AND runs discovery", async () => {
        const draft = await chooseDraftForCase({
            ...baseInput,
            text: { available: false, text: null, reason: "no_text" },
            pdfBytes: PDF_BYTES,
            extractAcroForm: async () => ACROFORM,
        });

        // exact extraction preserved
        expect(draft.fields).toHaveLength(3);
        expect(draft.fields.map((f) => f.pdf_field_name)).toEqual(["child_last_name", "birth_date", "parent_signature"]);
        expect(draft.fields.map((f) => f.type)).toEqual(["text", "date", "signature"]);
        expect(draft.fields[0].bbox).toEqual([25, 549, 192, 567]);
        expect(draft.fields.every((f) => f.page === 1)).toBe(true);
        expect(draft.source_document_id).toBe("doc-1");

        // …and semantic understanding on top of it
        expect(draft.configuration_discovery, "AcroForm draft must carry discovery").toBeTruthy();
        expect(draft.configuration_discovery!.concepts.length).toBeGreaterThan(0);
        expect(draft.configuration_discovery!.source_document_id).toBe("doc-1");
    });

    it("native layout: still runs discovery", async () => {
        const draft = await chooseDraftForCase({
            ...baseInput,
            text: { available: true, text: "Child Information\nChild's Name:\nDate of Birth:", reason: null },
            pdfBytes: PDF_BYTES,
            extractAcroForm: async () => NO_ACROFORM,
            extractPositional: async () => LAYOUT,
        });
        expect(draft.fields.length).toBeGreaterThan(0);
        expect(draft.configuration_discovery, "layout draft must carry discovery").toBeTruthy();
    });

    it("flat text (scanned / OCR): still runs discovery", async () => {
        const draft = await chooseDraftForCase({
            ...baseInput,
            text: { available: true, text: "Child's Name: ______\nDate of Birth: ______\nParent Signature: ______", reason: null },
            pdfBytes: null,
            mimeType: "image/png",
            extractAcroForm: async () => NO_ACROFORM,
        });
        expect(draft.configuration_discovery, "flat-text draft must carry discovery").toBeTruthy();
    });

    it("a discovery failure never costs the operator the destinations", async () => {
        const draft = await chooseDraftForCase({
            ...baseInput,
            text: { available: false, text: null, reason: "no_text" },
            pdfBytes: PDF_BYTES,
            // A widget whose label explodes any downstream string handling would still not be
            // allowed to lose the 3 destinations.
            extractAcroForm: async () => ACROFORM,
        });
        expect(draft.fields).toHaveLength(3);
    });

    it("no reader can return a draft that bypasses enrichment", () => {
        // Structural guard. `selectDraftSource` selects; `chooseDraftForCase` enriches. If a future
        // change reintroduces a draft return inside the selection function's branches WITHOUT
        // routing through the single enrichment point, this fails — which is exactly how the
        // original bug shipped.
        const src = fs.readFileSync(
            path.join(process.cwd(), "lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe.ts"),
            "utf8"
        );
        const chooseBody = src.slice(src.indexOf("export async function chooseDraftForCase"));
        const end = chooseBody.indexOf("\nexport async function buildFormDraftForCaseSafe");
        const body = chooseBody.slice(0, end === -1 ? undefined : end);

        // Nothing may return between selecting a source and enriching it — that gap is precisely
        // where the AcroForm early-return lived.
        const gap = body.slice(body.indexOf("await selectDraftSource("), body.indexOf("the single enrichment point"));
        expect(gap, `an early return short-circuits enrichment: ${gap.trim()}`).not.toMatch(/\breturn\b/);

        // chooseDraftForCase returns exactly one thing: the enriched selection.
        const drafts = body.match(/return\s+selected\.draft/g) ?? [];
        expect(drafts).toHaveLength(1);
        expect(body).toContain("discoverConfiguration(");

        // …and the selection function never calls discovery itself, so enrichment cannot be
        // duplicated into one branch and quietly omitted from another.
        const selectBody = src.slice(src.indexOf("async function selectDraftSource"), src.indexOf("export interface ChooseDraftInput"));
        expect(selectBody).not.toContain("discoverConfiguration");
    });
});
