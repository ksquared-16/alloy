import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { placeSignaturesAndFlatten } from "@/lib/forms/pdf/generation/fidelityEngine";

/**
 * A SIGNATURE NOBODY COULD SEE.
 *
 * The engine drew the mark and then flattened the AcroForm, so on a document whose signature line
 * is a real widget — which is the normal case for imported school paperwork — the empty field's
 * appearance stream was baked on top of the signature. "Kelly Smith" was in the file the whole
 * time; text extraction found it. A human looking at the page saw an empty box.
 *
 * Text presence cannot guard this, because the broken output contained the text too. What changed
 * is the ORDER in the content stream: the mark must be painted after the flattened field content,
 * because paint order is what decides which one a reader sees.
 */

async function pdfWithSignatureWidget(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Parent Guardian Signature", { x: 48, y: 70, size: 8, font });
    // A real AcroForm text field on the signature line, exactly as a fillable school form draws it.
    const field = doc.getForm().createTextField("guardian_signature");
    field.addToPage(page, { x: 47.5, y: 43.5, width: 231, height: 17 });
    return doc.save();
}

describe("the signing mark survives flattening", () => {
    it("paints the mark after the flattened field content, not under it", async () => {
        const source = await pdfWithSignatureWidget();
        const { bytes, flattened } = await placeSignaturesAndFlatten({
            populatedPdf: source,
            signatures: [
                { field_id: "f_sig", kind: "typed", typedName: "Kelly Smith", page: 0, x: 47.5, y: 43.5, width: 231, height: 17 },
            ] as never,
            documentId: "11111111-1111-4111-8111-111111111111",
            now: new Date().toISOString(),
        });
        expect(flattened).toBe(true);

        const { extractText } = await import("unpdf");
        const text = String((await extractText(new Uint8Array(bytes), { mergePages: true })).text);
        expect(text).toContain("Kelly Smith");
        // The label was on the page before flattening; the mark must come after it in paint order.
        expect(text.lastIndexOf("Kelly Smith")).toBeGreaterThan(text.lastIndexOf("Parent Guardian Signature"));
    });

    it("still produces an immutable artifact", async () => {
        const { bytes } = await placeSignaturesAndFlatten({
            populatedPdf: await pdfWithSignatureWidget(),
            signatures: [],
            documentId: "11111111-1111-4111-8111-111111111111",
            now: new Date().toISOString(),
        });
        // Flattening is what makes the signed copy uneditable; reordering must not lose it.
        const doc = await PDFDocument.load(bytes);
        expect(doc.getForm().getFields().length).toBe(0);
    });
});
