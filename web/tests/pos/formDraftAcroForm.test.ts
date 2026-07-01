/**
 * POS-FP14 — AcroForm-first draft generation.
 *
 * Proves: when a PDF has real widget fields, those become the PRIMARY source (with page +
 * bbox provenance) and text detection is bypassed; when the PDF is flat (no AcroForm), we
 * fall back to text structure detection. Pure / injected — no storage, no pdf.js runtime.
 */

import { describe, it, expect } from "vitest";
import {
    buildFormDraftFromAcroForm,
    ACROFORM_FORM_DRAFT_VERSION,
} from "@/lib/pos/processingCase/formDraft/buildFormDraftFromAcroForm";
import { FORM_DRAFT_GENERATOR_VERSION } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import type { PdfAcroFormResult } from "@/lib/pos/processingCase/structure/pdfAcroForm";
import type { DocumentTextResult } from "@/lib/pos/processingCase/structure/types";

const ACRO: PdfAcroFormResult = {
    has_acroform: true,
    page_count: 2,
    fields: [
        { name: "child_name", label: "Child Name", type: "text", page: 1, bbox: [72, 700, 300, 718] },
        { name: "birthdate", label: "Birthdate", type: "date", page: 1, bbox: [320, 700, 460, 718] },
        { name: "health_good", label: "Health Good", type: "boolean", page: 1, bbox: [72, 660, 86, 674] },
        { name: "parent_signature", label: "Parent Signature", type: "signature", page: 2, bbox: [72, 120, 300, 150] },
    ],
};

describe("buildFormDraftFromAcroForm", () => {
    const draft = buildFormDraftFromAcroForm({ acroform: ACRO, sourceDocumentId: "doc-1", title: "MO500" });

    it("maps every widget to a high-confidence field with page + bbox provenance", () => {
        expect(draft.fields).toHaveLength(4);
        expect(draft.fields.every((f) => f.confidence === "high")).toBe(true);
        const bd = draft.fields.find((f) => f.pdf_field_name === "birthdate")!;
        expect(bd.type).toBe("date");
        expect(bd.page).toBe(1);
        const sig = draft.fields.find((f) => f.pdf_field_name === "parent_signature")!;
        expect(sig.type).toBe("signature");
        expect(sig.bbox).toEqual([72, 120, 300, 150]);
    });

    it("groups fields by page and tags the AcroForm generator version", () => {
        expect(draft.sections.map((s) => s.title)).toEqual(["Page 1", "Page 2"]);
        expect(draft.generator_version).toBe(ACROFORM_FORM_DRAFT_VERSION);
        expect(draft.warnings.some((w) => /AcroForm/i.test(w))).toBe(true);
    });
});

describe("chooseDraftForCase — AcroForm primary, text fallback", () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
    const weakText: DocumentTextResult = {
        available: true,
        text: "MISSOURI DEPARTMENT OF ELEMENTARY AND SECONDARY EDUCATION CHILD'S NAME BIRTHDATE PARENT/GUARDIAN SIGNATURE DATE",
        reason: null,
    };
    const linedText: DocumentTextResult = {
        available: true,
        text: ["Child Information", "Name of Child   Date of Birth   Sex", "Address   City   State   Zip"].join("\n"),
        reason: null,
    };

    it("uses the AcroForm fields even when text extraction is weak", async () => {
        const draft = await chooseDraftForCase({
            sourceDocumentId: "doc-1",
            fileName: "mo500.pdf",
            classificationKey: null,
            text: weakText,
            pdfBytes,
            mimeType: "application/pdf",
            extractAcroForm: async () => ACRO,
        });
        expect(draft.generator_version).toBe(ACROFORM_FORM_DRAFT_VERSION);
        expect(draft.fields.some((f) => f.pdf_field_name === "child_name")).toBe(true);
        expect(draft.fields.every((f) => f.confidence === "high")).toBe(true);
    });

    it("falls back to text detection when the PDF is flat (no AcroForm)", async () => {
        const draft = await chooseDraftForCase({
            sourceDocumentId: "doc-1",
            fileName: "mo500.pdf",
            classificationKey: null,
            text: linedText,
            pdfBytes,
            mimeType: "application/pdf",
            extractAcroForm: async () => ({ has_acroform: false, fields: [], page_count: 1 }),
        });
        expect(draft.generator_version).toBe(FORM_DRAFT_GENERATOR_VERSION);
        expect(draft.fields.some((f) => /name of child/i.test(f.label))).toBe(true);
    });

    it("falls back to text detection when there are no PDF bytes", async () => {
        const draft = await chooseDraftForCase({
            sourceDocumentId: "doc-1",
            fileName: "mo500.pdf",
            classificationKey: null,
            text: linedText,
            pdfBytes: null,
            mimeType: null,
            extractAcroForm: async () => ACRO, // must not be used
        });
        expect(draft.generator_version).toBe(FORM_DRAFT_GENERATOR_VERSION);
    });
});
