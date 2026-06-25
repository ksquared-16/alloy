/**
 * POS-FP14 — AcroForm field mapping (pure).
 *
 * Proves that when a PDF carries real form fields (widget annotations), we can turn them
 * into a clean field list — name → human label, pdf.js field type → our type, page + bbox
 * preserved — without OCR/AI. This is the reliable primary source for template setup; text
 * detection is only the fallback.
 */

import { describe, it, expect } from "vitest";
import { mapAcroFormFields, cleanFieldName, type PdfAcroFieldRaw } from "@/lib/pos/processingCase/structure/pdfAcroForm";

describe("cleanFieldName", () => {
    it("humanizes underscores, camelCase, and widget prefixes", () => {
        expect(cleanFieldName("child_name")).toBe("Child Name");
        expect(cleanFieldName("ChildsBirthdate")).toBe("Childs Birthdate");
        expect(cleanFieldName("txtParentName")).toBe("Parent Name");
        expect(cleanFieldName("chkHealthGood")).toBe("Health Good");
    });
});

describe("mapAcroFormFields", () => {
    const raw: PdfAcroFieldRaw[] = [
        { fieldName: "child_name", fieldType: "Tx", page: 1, rect: [72, 700, 300, 718] },
        { fieldName: "birthdate", fieldType: "Tx", page: 1, rect: [320, 700, 460, 718] },
        { fieldName: "health_good", fieldType: "Btn", page: 1, rect: [72, 660, 86, 674], checkBox: true },
        { fieldName: "parent_signature", fieldType: "Sig", page: 2, rect: [72, 120, 300, 150] },
        { fieldName: "submit", fieldType: "Btn", page: 2, rect: [400, 80, 470, 100], pushButton: true },
    ];

    const result = mapAcroFormFields(raw, 2);

    it("reports an AcroForm and the page count", () => {
        expect(result.has_acroform).toBe(true);
        expect(result.page_count).toBe(2);
    });

    it("drops push buttons (no data) but keeps real fields", () => {
        const names = result.fields.map((f) => f.name);
        expect(names).toContain("child_name");
        expect(names).not.toContain("submit");
        expect(result.fields).toHaveLength(4);
    });

    it("maps field types and humanizes labels", () => {
        const byName = Object.fromEntries(result.fields.map((f) => [f.name, f]));
        expect(byName["child_name"].label).toBe("Child Name");
        expect(byName["child_name"].type).toBe("text");
        expect(byName["birthdate"].type).toBe("date");
        expect(byName["health_good"].type).toBe("boolean");
        expect(byName["parent_signature"].type).toBe("signature");
    });

    it("preserves page numbers and bounding boxes for later PDF mapping", () => {
        const sig = result.fields.find((f) => f.name === "parent_signature")!;
        expect(sig.page).toBe(2);
        expect(sig.bbox).toEqual([72, 120, 300, 150]);
    });

    it("returns has_acroform=false for a flat (non-fillable) PDF", () => {
        expect(mapAcroFormFields([], 3)).toEqual({ has_acroform: false, fields: [], page_count: 3 });
    });
});
