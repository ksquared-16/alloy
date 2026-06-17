/**
 * POS-FP12 — best-effort: generate + store a Document → Form draft for a case.
 *
 *   case primary document → extracted text (if any) → structure → draft form → metadata
 *
 * Triggered by the operator's "Create form from document" action. Best-effort: NEVER
 * throws. PREVIEW ONLY — creates no form, publishes nothing, writes no records.
 * Returns the stored draft, or null when there's no document source / on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocumentTextSafe } from "../structure/extractDocumentTextSafe";
import { detectDocumentStructure } from "../structure/detectDocumentStructure";
import { buildFormDraftFromStructure } from "./buildFormDraftFromStructure";
import { dbStoreFormDraftPreview, stampFormDraftPreview } from "./formDraftPreviewDb";
import type { StoredFormDraftPreview } from "./types";

export async function buildFormDraftForCaseSafe(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string }
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
        const structure = detectDocumentStructure(textResult.text);

        const draft = stampFormDraftPreview(
            buildFormDraftFromStructure({
                structure,
                sourceDocumentId: source.source_id,
                extractedText: textResult.text,
                fileName: doc.title ?? doc.original_filename ?? null,
                classificationKey,
                extractedTextAvailable: textResult.available,
            })
        );
        if (!textResult.available && textResult.reason) {
            draft.warnings = [...new Set([...draft.warnings, `text_unavailable:${textResult.reason}`])];
        }

        return await dbStoreFormDraftPreview(supabase, { orgId: args.orgId, caseId: args.caseId, draft });
    } catch (e) {
        console.warn("[buildFormDraftForCaseSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}
