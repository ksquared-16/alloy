/**
 * POS-FP12 — persist + read the Document → Form draft preview on a Processing Case.
 *
 * Storage (NO schema change): `processing_cases.metadata.form_draft_preview`.
 * Annotation only — NEVER writes status/case_type, NEVER creates a form row or version,
 * NEVER publishes, NEVER touches business records. Merges into existing metadata
 * (classification / extraction / document_form_preview preserved).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredFormDraftPreview } from "./types";
import { sanitizeForJsonb } from "./sanitizeForJsonb";

export function stampFormDraftPreview(draft: StoredFormDraftPreview, now: Date = new Date()): StoredFormDraftPreview {
    return { ...draft, generated_at: now.toISOString() };
}

export async function dbStoreFormDraftPreview(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; draft: StoredFormDraftPreview }
): Promise<StoredFormDraftPreview> {
    const { data: existing, error: readErr } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const baseMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    // Postgres jsonb rejects NULs and lone surrogates, and some PDFs carry them in their text layer.
    // Left unsanitized, ONE odd character fails the entire import with an opaque
    // "unsupported Unicode escape sequence" — which is exactly how the Sunscreen Permission Form
    // died. Cleaned here because every draft-producing path converges on this write.
    const safeDraft = sanitizeForJsonb(args.draft);
    const metadata = { ...baseMeta, form_draft_preview: safeDraft };

    const { error } = await supabase
        .from("processing_cases")
        .update({ metadata })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) throw new Error(error.message);

    return safeDraft;
}

/**
 * Durable record of a detection RUN (reliability diagnostics), stored at
 * `processing_cases.metadata.form_draft_detection`. Survives a page reload so a hung/failed
 * detection is a visible, retryable state — not a spinner the operator waited 7 minutes on.
 */
export interface FormDraftDetectionRecord {
    status: "ok" | "timeout" | "error";
    /** Per-pipeline-stage wall-clock (download / extract-text / acroform / positional / detect). */
    stages: { stage: string; ms: number; ok: boolean; detail?: string }[];
    total_ms: number;
    reason?: string | null;
    at: string;
}

export async function dbRecordFormDraftDetection(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; record: FormDraftDetectionRecord }
): Promise<void> {
    const { data: existing } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    const baseMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    // Same jsonb column, same hazard: stage details carry extraction messages that may echo document
    // bytes, so a failure report must not itself become an unwritable row.
    const metadata = { ...baseMeta, form_draft_detection: sanitizeForJsonb(args.record) };
    await supabase.from("processing_cases").update({ metadata }).eq("org_id", args.orgId).eq("id", args.caseId);
}

/** Pure: parse a case's metadata jsonb into a stored draft (or null). For the read model. */
export function parseStoredFormDraftPreview(metadata: unknown): StoredFormDraftPreview | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>).form_draft_preview;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const d = raw as Record<string, unknown>;
    if (typeof d.title !== "string" || !Array.isArray(d.sections) || !Array.isArray(d.fields)) return null;
    const diag = d.diagnostics && typeof d.diagnostics === "object" && !Array.isArray(d.diagnostics)
        ? (d.diagnostics as Record<string, unknown>)
        : {};
    const fields = d.fields as StoredFormDraftPreview["fields"];
    const sections = d.sections as StoredFormDraftPreview["sections"];
    // OCR provenance: round-trip so the create path can stamp source→OCR→published lineage.
    const rawOcr = d.ocr && typeof d.ocr === "object" && !Array.isArray(d.ocr) ? (d.ocr as Record<string, unknown>) : null;
    const ocr =
        rawOcr && rawOcr.derived === true
            ? {
                  derived: true as const,
                  method: typeof rawOcr.method === "string" ? rawOcr.method : "ocr",
                  confidence: typeof rawOcr.confidence === "number" ? rawOcr.confidence : 0,
                  low_confidence: rawOcr.low_confidence === true,
                  ...(rawOcr.source_kind === "image" || rawOcr.source_kind === "scanned_pdf"
                      ? { source_kind: rawOcr.source_kind as "image" | "scanned_pdf" }
                      : {}),
              }
            : null;
    return {
        ...(typeof d.generated_form_name === "string" && d.generated_form_name.trim()
            ? { generated_form_name: d.generated_form_name.trim() }
            : {}),
        source_document_id: typeof d.source_document_id === "string" ? d.source_document_id : null,
        title: d.title,
        title_from_text: d.title_from_text === true,
        extracted_text_available: d.extracted_text_available === true,
        sections,
        fields,
        warnings: Array.isArray(d.warnings) ? (d.warnings as string[]) : [],
        diagnostics: {
            extracted_text_length: typeof diag.extracted_text_length === "number" ? diag.extracted_text_length : 0,
            extracted_text_preview: typeof diag.extracted_text_preview === "string" ? diag.extracted_text_preview : "",
            section_count: typeof diag.section_count === "number" ? diag.section_count : sections.length,
            field_count: typeof diag.field_count === "number" ? diag.field_count : fields.length,
        },
        ...(Array.isArray(d.pdf_pages) ? { pdf_pages: d.pdf_pages as StoredFormDraftPreview["pdf_pages"] } : {}),
        ...(ocr ? { ocr } : {}),
        // Configuration Discovery (FP16) — pass through the stored concept-level proposal as-is (it was
        // produced by pure deterministic code; the concept-first review re-derives nothing).
        ...(d.configuration_discovery && typeof d.configuration_discovery === "object" && !Array.isArray(d.configuration_discovery)
            ? { configuration_discovery: d.configuration_discovery as StoredFormDraftPreview["configuration_discovery"] }
            : {}),
        // Relationship collections projected by apply (FP17). This parser is an explicit ALLOWLIST —
        // anything not named here is silently dropped on every read, so a new draft-level construct
        // must be added or it will vanish between apply and form generation.
        ...(Array.isArray(d.collections)
            ? { collections: d.collections as StoredFormDraftPreview["collections"] }
            : {}),
        generated_at: typeof d.generated_at === "string" ? d.generated_at : "",
        generator_version: typeof d.generator_version === "string" ? d.generator_version : "unknown",
    };
}
