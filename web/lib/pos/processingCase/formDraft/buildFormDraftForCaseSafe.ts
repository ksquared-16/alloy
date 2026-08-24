/**
 * POS-FP12/FP14 — best-effort: generate + store a Document → Form draft for a case.
 *
 *   case primary document
 *     → (PRIMARY)  PDF AcroForm widget fields → draft (page + bbox metadata)
 *     → (SECONDARY) native layout (positional text) → structure → draft
 *     → (FALLBACK)  extracted text → structure detection → draft
 *     → Configuration Discovery over whichever structure was read
 *     → metadata.form_draft_preview
 *
 * If the PDF is a real fillable form (AcroForm), its declared fields are the reliable
 * source and text detection is bypassed. If it is flat / has no widgets, we fall back to
 * layout, then to flat text (and, when that is weak, the operator builds the list manually).
 *
 * Selection and enrichment are SEPARATE. Whichever reader wins, it hands back the structure it
 * read, and semantic understanding is applied once to that structure. A document never receives
 * less understanding because it supplied better field geometry.
 *
 * Triggered by the operator's "Set up this document" action. Best-effort: NEVER throws.
 * PREVIEW ONLY — creates no form, publishes nothing, writes no records. Returns the stored
 * draft, or null when there's no document source / on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentStructureCandidate, DocumentTextResult } from "../structure/types";
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
import { layoutPageContexts } from "../structure/layoutFieldGeometry";
import { buildFormDraftFromAcroForm } from "./buildFormDraftFromAcroForm";
import { buildStructureFromAcroForm } from "../structure/acroFormStructure";
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

/** Which reader produced the draft — recorded so the enrichment step is source-agnostic. */
export type DraftOrigin = "acroform" | "layout" | "flat_text";

/**
 * A selected draft together with the document structure it came from. Keeping the structure
 * alongside the draft is what lets Configuration Discovery run ONCE, after selection, for every
 * reader — instead of only inside the branch that happened to build its draft from a structure.
 */
interface SelectedDraftSource {
    draft: StoredFormDraftPreview;
    structure: DocumentStructureCandidate | null;
    origin: DraftOrigin;
}

type StageTimer = <T>(stage: string, fn: () => Promise<T> | T, detail?: (r: T) => string) => Promise<T>;

/**
 * Pick the best available reader and build its draft. AcroForm widgets win when present — they are
 * the document's own declaration of its destinations — then native layout, then flat text.
 *
 * This function selects; it does not enrich. Semantic understanding is applied by the caller to
 * whatever structure comes back, so a better structural reader can never cost a document its
 * discovery. @see chooseDraftForCase
 */
async function selectDraftSource(
    input: ChooseDraftInput,
    timed: StageTimer,
    title: string,
    textLen: number
): Promise<SelectedDraftSource> {
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
                const draft = buildFormDraftFromAcroForm({
                    acroform: acro,
                    sourceDocumentId: input.sourceDocumentId,
                    title,
                    extractedTextLength: textLen,
                    extractedTextAvailable: input.text.available,
                });
                // The widget list projected into the structure contract — same fields, same
                // geometry, now in a shape discovery can read. The draft itself is untouched.
                const structure = await timed(
                    "acroform_structure",
                    () => buildStructureFromAcroForm(acro),
                    (st) => `sections=${st.sections.length} fields=${st.sections.reduce((n, x) => n + x.fields.length, 0)}`
                );
                return { draft, structure, origin: "acroform" };
            }
        } catch (e) {
            console.warn("[selectDraftSource] acroform", e instanceof Error ? e.message : e);
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
                        // Page dimensions travel with the draft so the review canvas can place the
                        // field boxes the detector just produced.
                        pdfPages: layoutPageContexts(layout.pages),
                    });
                    return { draft, structure, origin: "layout" };
                }
            }
        } catch (e) {
            console.warn("[selectDraftSource] positional", e instanceof Error ? e.message : e);
        }
    }

    // FALLBACK — flat-text structure detection (scanned/OCR text, or when layout yielded nothing).
    const structure = await timed("flat_text_detect", () => detectDocumentStructure(input.text.text));
    return {
        draft: buildFormDraftFromStructure({
            structure,
            sourceDocumentId: input.sourceDocumentId,
            extractedText: input.text.text,
            fileName: input.fileName,
            classificationKey: input.classificationKey,
            extractedTextAvailable: input.text.available,
        }),
        structure,
        origin: "flat_text",
    };
}

export interface ChooseDraftInput {
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
}

/**
 * Build the draft for a case: select the best structural reader, then apply semantic understanding
 * to whatever it produced.
 *
 * PRODUCT INVARIANT — extraction quality and semantic understanding COMPOSE. A document does not
 * receive less understanding because it supplied better field geometry. Discovery therefore runs at
 * exactly ONE place, on the structure the selected reader returned, and no reader can return a
 * draft that bypasses it. `tests/pos/formDraftDiscoveryComposition.test.ts` is the negative control.
 */
export async function chooseDraftForCase(input: ChooseDraftInput): Promise<StoredFormDraftPreview> {
    const textLen = (input.text.text ?? "").length;
    const clock = input.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const timed: StageTimer = async (stage, fn, detail) => {
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

    const selected = await selectDraftSource(input, timed, title, textLen);

    // ── the single enrichment point ──
    // Every reader hands back the structure it read. Discovery runs here, for all of them.
    if (selected.structure) {
        try {
            const discovery = await timed(
                "configuration_discovery",
                () => discoverConfiguration({ structure: selected.structure as DocumentStructureCandidate, sourceDocumentId: input.sourceDocumentId }),
                (d) => `origin=${selected.origin} concepts=${d.concepts.length} proposals=${d.proposals.length}`
            );
            selected.draft.configuration_discovery = discovery;
        } catch (e) {
            // Discovery is enrichment: a failure must not cost the operator the destinations.
            console.warn("[chooseDraftForCase] discovery", e instanceof Error ? e.message : e);
        }
    }

    return selected.draft;
}

export async function buildFormDraftForCaseSafe(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string },
    deps: FormDraftCaseDeps = {}
): Promise<StoredFormDraftPreview | null> {
    // Every failure path below reports WHY through `onStage`. Returning a bare null made three very
    // different failures — bad input, a genuinely missing source, and any thrown error — all surface
    // to the operator as "this case has no document source", which sent QA looking in the wrong place
    // for a document that was attached perfectly well.
    const fail = (stage: string, detail: string): null => {
        deps.onStage?.({ stage, ms: 0, ok: false, detail });
        return null;
    };

    try {
        if (!args.orgId || !args.caseId) return fail("input", "missing org or case id");

        // Primary document source for the case.
        const { data: src } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", args.orgId)
            .eq("processing_case_id", args.caseId)
            .eq("role", "primary")
            .maybeSingle();
        const source = src as { source_kind?: string; source_id?: string } | null;
        if (!source) return fail("source_lookup", "no primary source row for this case");
        if (source.source_kind !== "document") return fail("source_lookup", `primary source is "${source.source_kind}", not a document`);
        if (!source.source_id) return fail("source_lookup", "primary document source has no id");

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
        // A crash while reading the document is NOT "no document source". Report it as what it is.
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[buildFormDraftForCaseSafe]", message);
        return fail("build", message);
    }
}
