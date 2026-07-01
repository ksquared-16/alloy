/**
 * POS-FP11 — persist + read the Document → Form preview on a Processing Case.
 *
 * Storage (NO schema change): `processing_cases.metadata.document_form_preview`.
 * Annotation only — NEVER writes status/case_type, NEVER creates a form row, NEVER
 * touches business records. Merges into existing metadata (classification / extraction
 * preserved). It is a PREVIEW; no form is created and there is no publish path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentStructureCandidate, StoredDocumentFormPreview } from "./types";
import { STRUCTURE_GENERATOR_VERSION } from "./detectDocumentStructure";

export function toStoredDocumentFormPreview(
    candidate: DocumentStructureCandidate,
    args: { sourceDocumentId: string | null; extractedTextAvailable: boolean; now?: Date }
): StoredDocumentFormPreview {
    return {
        source_document_id: args.sourceDocumentId,
        extracted_text_available: args.extractedTextAvailable,
        sections: candidate.sections,
        warnings: candidate.warnings,
        generated_at: (args.now ?? new Date()).toISOString(),
        generator_version: STRUCTURE_GENERATOR_VERSION,
    };
}

export async function dbStoreDocumentFormPreview(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; preview: StoredDocumentFormPreview }
): Promise<StoredDocumentFormPreview> {
    const { data: existing, error: readErr } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const baseMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const metadata = { ...baseMeta, document_form_preview: args.preview };

    // Only `metadata` is written — no case_type, no status, no form row.
    const { error } = await supabase
        .from("processing_cases")
        .update({ metadata })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) throw new Error(error.message);

    return args.preview;
}

/** Pure: parse a case's metadata jsonb into a stored preview (or null). For the read model. */
export function parseStoredDocumentFormPreview(metadata: unknown): StoredDocumentFormPreview | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>).document_form_preview;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const p = raw as Record<string, unknown>;
    if (!Array.isArray(p.sections)) return null;
    return {
        source_document_id: typeof p.source_document_id === "string" ? p.source_document_id : null,
        extracted_text_available: p.extracted_text_available === true,
        sections: p.sections as StoredDocumentFormPreview["sections"],
        warnings: Array.isArray(p.warnings) ? (p.warnings as string[]) : [],
        generated_at: typeof p.generated_at === "string" ? p.generated_at : "",
        generator_version: typeof p.generator_version === "string" ? p.generator_version : "unknown",
    };
}
