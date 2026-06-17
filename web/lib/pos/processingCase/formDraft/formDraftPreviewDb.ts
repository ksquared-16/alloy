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
    const metadata = { ...baseMeta, form_draft_preview: args.draft };

    const { error } = await supabase
        .from("processing_cases")
        .update({ metadata })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) throw new Error(error.message);

    return args.draft;
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
    return {
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
        generated_at: typeof d.generated_at === "string" ? d.generated_at : "",
        generator_version: typeof d.generator_version === "string" ? d.generator_version : "unknown",
    };
}
