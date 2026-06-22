/**
 * POS-FP14 — build a Document → Form draft from a PDF's AcroForm widget fields.
 *
 * When the PDF carries real form fields, those are the PRIMARY source for template setup
 * (text detection is fallback only). This pure builder maps the normalized AcroForm field
 * list (label / type / page / bbox, from `pdfAcroForm.mapAcroFormFields`) into the SAME
 * `StoredFormDraftPreview` shape, grouped by page, carrying page + bbox provenance so a
 * later PDF overlay / PDF-fill can use it. Fields are "high" confidence (the PDF declared
 * them). Reuses the existing create + persistence path — no second form system.
 */

import type { PdfAcroFormResult, PdfFieldType } from "../structure/pdfAcroForm";
import type { DraftFormField, DraftFormFieldType, DraftFormSection, StoredFormDraftPreview } from "./types";

export const ACROFORM_FORM_DRAFT_VERSION = "fp14.0-acroform";

function mapPdfType(t: PdfFieldType): { type: DraftFormFieldType; warning?: string } {
    switch (t) {
        case "date":
            return { type: "date" };
        case "number":
            return { type: "number" };
        case "boolean":
            return { type: "boolean" };
        case "signature":
            return { type: "signature" };
        case "select":
            // No options come from a widget without reading its option dictionary — keep as
            // text and flag, exactly like the text path (never invent options).
            return { type: "text", warning: "choice" };
        case "text":
        case "unknown":
        default:
            return { type: "text" };
    }
}

export interface BuildAcroFormDraftInput {
    acroform: PdfAcroFormResult;
    sourceDocumentId: string | null;
    title: string;
    extractedTextLength?: number;
    extractedTextAvailable?: boolean;
}

export function buildFormDraftFromAcroForm(input: BuildAcroFormDraftInput): StoredFormDraftPreview {
    const warnings: string[] = [];
    const multiPage = input.acroform.page_count > 1;
    const order: number[] = [];
    const byPage = new Map<number, DraftFormField[]>();
    let counter = 0;
    let choiceFlagged = false;

    for (const f of input.acroform.fields) {
        counter += 1;
        const mapped = mapPdfType(f.type);
        if (mapped.warning === "choice" && !choiceFlagged) {
            warnings.push("Some PDF fields are choice/dropdown — drafted as text; add options in the builder.");
            choiceFlagged = true;
        }
        const page = f.page > 0 ? f.page : 1;
        if (!byPage.has(page)) {
            byPage.set(page, []);
            order.push(page);
        }
        byPage.get(page)!.push({
            id: `field_${counter}`,
            label: f.label,
            type: mapped.type,
            required: false,
            confidence: "high",
            evidence: "pdf_field",
            pdf_field_name: f.name,
            page,
            ...(f.bbox ? { bbox: f.bbox } : {}),
        });
    }

    const sections: DraftFormSection[] = order.map((page, i) => ({
        id: `section_${i + 1}`,
        title: multiPage ? `Page ${page}` : "Form fields",
        field_ids: byPage.get(page)!.map((f) => f.id),
    }));
    const fields: DraftFormField[] = order.flatMap((p) => byPage.get(p)!);

    warnings.unshift(
        `Detected ${fields.length} field${fields.length === 1 ? "" : "s"} from the PDF's form fields (AcroForm) with page${
            input.acroform.fields.some((f) => f.bbox) ? " and position" : ""
        } metadata. Review and adjust before creating.`
    );

    return {
        source_document_id: input.sourceDocumentId,
        title: input.title.trim() || "Untitled form",
        title_from_text: false,
        extracted_text_available: input.extractedTextAvailable ?? false,
        sections,
        fields,
        warnings,
        diagnostics: {
            extracted_text_length: input.extractedTextLength ?? 0,
            extracted_text_preview: "",
            section_count: sections.length,
            field_count: fields.length,
        },
        generator_version: ACROFORM_FORM_DRAFT_VERSION,
        generated_at: "",
    };
}
