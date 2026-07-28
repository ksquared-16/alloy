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
import { extractPdfPositional } from "../structure/pdfPositionalExtract";
import { detectLayoutStructure } from "../structure/detectLayoutStructure";
import type { LayoutDocument } from "../structure/pdfLayoutTypes";
import { discoverConfiguration } from "@/lib/pos/discovery/discoverConfiguration";
import { buildFormDraftFromStructure } from "./buildFormDraftFromStructure";
import { buildFormDraftFromAcroForm } from "./buildFormDraftFromAcroForm";
import { deriveDocumentTitle } from "./deriveDocumentTitle";
import { ocrProvenanceFromDocument } from "./ocrDraftProvenance";
import { dbStoreFormDraftPreview, stampFormDraftPreview } from "./formDraftPreviewDb";
import type { StoredFormDraftPreview } from "./types";

/** A single detection stage's wall-clock + outcome — surfaced to the route for reliability diagnostics. */
export interface FormDraftStageTiming {
    stage: string;
    ms: number;
    ok: boolean;
    detail?: string;
}

/** Injected so the AcroForm/positional/text decision is unit-testable without storage / pdf.js. */
export interface FormDraftCaseDeps {
    extractAcroForm?: (bytes: Uint8Array) => Promise<PdfAcroFormResult>;
    /** Native-layout positional extractor (unpdf getTextContent per page). Injectable for tests. */
    extractPositional?: (bytes: Uint8Array) => Promise<LayoutDocument>;
    /** Per-stage timing sink (download / extract-text / acroform / positional / flat-text). */
    onStage?: (t: FormDraftStageTiming) => void;
    /** Monotonic clock (ms). Injected so tests avoid Date.now(); defaults to performance.now. */
    now?: () => number;
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
    extractPositional?: (bytes: Uint8Array) => Promise<LayoutDocument>;
    onStage?: (t: FormDraftStageTiming) => void;
    now?: () => number;
}): Promise<StoredFormDraftPreview> {
    const textLen = (input.text.text ?? "").length;
    const clock = input.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const timed = async <T>(stage: string, fn: () => Promise<T> | T, detail?: (r: T) => string): Promise<T> => {
        const t0 = clock();
        try {
            const r = await fn();
            input.onStage?.({ stage, ms: Math.round(clock() - t0), ok: true, detail: detail?.(r) });
            return r;
        } catch (e) {
            input.onStage?.({ stage, ms: Math.round(clock() - t0), ok: false, detail: e instanceof Error ? e.message : String(e) });
            throw e;
        }
    };
    const { title } = deriveDocumentTitle({
        extractedText: input.text.text,
        fileName: input.fileName,
        classificationKey: input.classificationKey,
    });

    const isPdf = !!input.pdfBytes && looksLikePdfBytes(input.pdfBytes, input.mimeType);
    // PDF parsers (pdf-lib / pdf.js) take ownership of the typed array and DETACH its underlying
    // ArrayBuffer, so a second consumer of the same bytes sees length 0. Hand every consumer its own
    // `.slice()` copy from the still-intact download.
    const pdfCopy = (): Uint8Array => (input.pdfBytes as Uint8Array).slice();

    // PRIMARY — real PDF AcroForm widget fields.
    if (isPdf && input.pdfBytes) {
        try {
            const acro = await timed("acroform", () => input.extractAcroForm(pdfCopy()), (a) => `fields=${a.fields.length}`);
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

    // SECONDARY — native-text WITH layout geometry (the structured, non-AcroForm case).
    if (isPdf && input.pdfBytes) {
        try {
            const extractPos = input.extractPositional ?? extractPdfPositional;
            const layout = await timed("positional_extract", () => extractPos(pdfCopy()), (l) => `pages=${l.pageCount} ok=${l.ok}${l.reason ? ` reason=${l.reason}` : ""}`);
            if (layout.ok && layout.pages.length > 0) {
                const structure = await timed("layout_detect", () => detectLayoutStructure(layout), (s) => `sections=${s.sections.length} fields=${s.sections.reduce((n, x) => n + x.fields.length, 0)}`);
                const totalFields = structure.sections.reduce((n, s) => n + s.fields.length, 0);
                if (totalFields > 0) {
                    const draft = buildFormDraftFromStructure({
                        structure,
                        sourceDocumentId: input.sourceDocumentId,
                        extractedText: input.text.text,
                        fileName: input.fileName,
                        classificationKey: input.classificationKey,
                        extractedTextAvailable: input.text.available,
                    });
                    // Configuration Discovery runs on the structure (which still carries choice options
                    // and duplicate/output-copy flags the flat draft drops) — the concept-first review.
                    const discovery = await timed(
                        "configuration_discovery",
                        () => discoverConfiguration({ structure, sourceDocumentId: input.sourceDocumentId }),
                        (d) => `concepts=${d.concepts.length} proposals=${d.proposals.length}`
                    );
                    draft.configuration_discovery = discovery;
                    return draft;
                }
            }
        } catch (e) {
            console.warn("[chooseDraftForCase] positional", e instanceof Error ? e.message : e);
        }
    }

    // FALLBACK — flat-text structure detection (scanned/OCR text, or when layout yielded nothing).
    return buildFormDraftFromStructure({
        structure: await timed("flat_text_detect", () => detectDocumentStructure(input.text.text)),
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
            .select("original_filename, title, doc_type, extraction_provider, metadata")
            .eq("org_id", args.orgId)
            .eq("id", source.source_id)
            .maybeSingle();
        const doc = (docRow ?? {}) as {
            original_filename?: string | null;
            title?: string | null;
            extraction_provider?: string | null;
            metadata?: Record<string, unknown> | null;
        };

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
            extractPositional: deps.extractPositional,
            onStage: deps.onStage,
            now: deps.now,
        });

        const draft = stampFormDraftPreview(draftPre);
        if (!textResult.available && textResult.reason && draft.fields.length === 0) {
            draft.warnings = [...new Set([...draft.warnings, `text_unavailable:${textResult.reason}`])];
        }
        // OCR provenance: when the document's text was OCR-derived, mark the draft so the review shows
        // "Detected using OCR" + confidence, and the published form retains source→OCR→published lineage.
        const ocr = ocrProvenanceFromDocument(doc);
        if (ocr) draft.ocr = ocr;

        return await dbStoreFormDraftPreview(supabase, { orgId: args.orgId, caseId: args.caseId, draft });
    } catch (e) {
        console.warn("[buildFormDraftForCaseSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}
