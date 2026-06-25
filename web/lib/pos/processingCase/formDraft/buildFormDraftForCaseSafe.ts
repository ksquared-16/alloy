/**
 * POS-FP12/FP14 — best-effort: generate + store a Document → Form draft for a case.
 *
 *   case primary document
 *     → (PRIMARY)  PDF AcroForm widget fields → draft (page + bbox metadata)
 *     → (FALLBACK) extracted text → structure detection → draft
 *     → metadata.form_draft_preview
 *
 * If the PDF is a real fillable form (AcroForm), its declared fields are the reliable
 * source and text detection is bypassed. If it is flat / has no widgets, we fall back to
 * text detection (and, when that is weak, the operator builds the list manually in the UI).
 *
 * Triggered by the operator's "Set up this document" action. Best-effort: NEVER throws.
 * PREVIEW ONLY — creates no form, publishes nothing, writes no records. Returns the stored
 * draft, or null when there's no document source / on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentTextResult } from "../structure/types";
import type { PdfAcroFormResult } from "../structure/pdfAcroForm";
import { extractPdfAcroFormFields } from "../structure/pdfAcroForm";
import { downloadDocumentBytesSafe, looksLikePdfBytes } from "../structure/documentBytes";
import { extractDocumentTextSafe } from "../structure/extractDocumentTextSafe";
import { detectDocumentStructure } from "../structure/detectDocumentStructure";
import { buildFormDraftFromStructure } from "./buildFormDraftFromStructure";
import { buildFormDraftFromAcroForm } from "./buildFormDraftFromAcroForm";
import { deriveDocumentTitle } from "./deriveDocumentTitle";
import { dbStoreFormDraftPreview, stampFormDraftPreview } from "./formDraftPreviewDb";
import type { StoredFormDraftPreview } from "./types";

/** Injected so the AcroForm-vs-text decision is unit-testable without storage / pdf.js. */
export interface FormDraftCaseDeps {
    extractAcroForm?: (bytes: Uint8Array) => Promise<PdfAcroFormResult>;
}

/**
 * Pure-ish decision: given the document text, optional PDF bytes and an AcroForm extractor,
 * pick the source and build the draft. AcroForm wins when it yields fields; otherwise text.
 */
export async function chooseDraftForCase(input: {
    sourceDocumentId: string | null;
    fileName: string | null;
    classificationKey: string | null;
    text: DocumentTextResult;
    pdfBytes: Uint8Array | null;
    mimeType: string | null;
    extractAcroForm: (bytes: Uint8Array) => Promise<PdfAcroFormResult>;
}): Promise<StoredFormDraftPreview> {
    const textLen = (input.text.text ?? "").length;
    const { title } = deriveDocumentTitle({
        extractedText: input.text.text,
        fileName: input.fileName,
        classificationKey: input.classificationKey,
    });

    // PRIMARY — real PDF form fields.
    if (input.pdfBytes && looksLikePdfBytes(input.pdfBytes, input.mimeType)) {
        try {
            const acro = await input.extractAcroForm(input.pdfBytes);
            if (acro.has_acroform && acro.fields.length > 0) {
                return buildFormDraftFromAcroForm({
                    acroform: acro,
                    sourceDocumentId: input.sourceDocumentId,
                    title,
                    extractedTextLength: textLen,
                    extractedTextAvailable: input.text.available,
                });
            }
        } catch (e) {
            console.warn("[chooseDraftForCase] acroform", e instanceof Error ? e.message : e);
        }
    }

    // FALLBACK — text structure detection.
    return buildFormDraftFromStructure({
        structure: detectDocumentStructure(input.text.text),
        sourceDocumentId: input.sourceDocumentId,
        extractedText: input.text.text,
        fileName: input.fileName,
        classificationKey: input.classificationKey,
        extractedTextAvailable: input.text.available,
    });
}

export async function buildFormDraftForCaseSafe(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string },
    deps: FormDraftCaseDeps = {}
): Promise<StoredFormDraftPreview | null> {
    try {
        if (!args.orgId || !args.caseId) return null;

        // Primary document source for the case.
        const { data: src } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", args.orgId)
            .eq("processing_case_id", args.caseId)
            .eq("role", "primary")
            .maybeSingle();
        const source = src as { source_kind?: string; source_id?: string } | null;
        if (!source || source.source_kind !== "document" || !source.source_id) return null;

        const { data: docRow } = await supabase
            .from("documents")
            .select("original_filename, title, doc_type")
            .eq("org_id", args.orgId)
            .eq("id", source.source_id)
            .maybeSingle();
        const doc = (docRow ?? {}) as { original_filename?: string | null; title?: string | null };

        // Classification (for title fallback) lives on the case_type.
        const { data: caseRow } = await supabase
            .from("processing_cases")
            .select("case_type")
            .eq("org_id", args.orgId)
            .eq("id", args.caseId)
            .maybeSingle();
        const classificationKey = (caseRow as { case_type?: string | null } | null)?.case_type ?? null;

        const textResult = await extractDocumentTextSafe(supabase, { orgId: args.orgId, documentId: source.source_id });

        // PDF bytes for AcroForm extraction (best-effort).
        const downloaded = await downloadDocumentBytesSafe(supabase, { orgId: args.orgId, documentId: source.source_id });

        const draftPre = await chooseDraftForCase({
            sourceDocumentId: source.source_id,
            fileName: doc.title ?? doc.original_filename ?? null,
            classificationKey,
            text: textResult,
            pdfBytes: downloaded?.bytes ?? null,
            mimeType: downloaded?.mimeType ?? null,
            extractAcroForm: deps.extractAcroForm ?? extractPdfAcroFormFields,
        });

        const draft = stampFormDraftPreview(draftPre);
        if (!textResult.available && textResult.reason && draft.fields.length === 0) {
            draft.warnings = [...new Set([...draft.warnings, `text_unavailable:${textResult.reason}`])];
        }

        return await dbStoreFormDraftPreview(supabase, { orgId: args.orgId, caseId: args.caseId, draft });
    } catch (e) {
        console.warn("[buildFormDraftForCaseSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}
