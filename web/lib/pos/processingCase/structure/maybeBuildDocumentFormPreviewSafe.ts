/**
 * POS-FP11 — best-effort: build + store the Document → Form preview for a case.
 *
 *   document text (if any) → structure candidate (sections/fields) → metadata preview
 *
 * Called after a document case is opened/classified (e.g. the upload route).
 * Best-effort: NEVER throws, NEVER blocks the caller. PREVIEW ONLY — no form is
 * created, no record is written, no commit. When no text is available it still stores
 * an honest preview (empty sections + a warning) so the UI can show the right state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocumentTextSafe } from "./extractDocumentTextSafe";
import { detectDocumentStructure } from "./detectDocumentStructure";
import { dbStoreDocumentFormPreview, toStoredDocumentFormPreview } from "./documentFormPreviewDb";
import type { StoredDocumentFormPreview } from "./types";

export async function maybeBuildDocumentFormPreviewSafe(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; documentId: string }
): Promise<StoredDocumentFormPreview | null> {
    try {
        if (!args.orgId || !args.caseId || !args.documentId) return null;

        const textResult = await extractDocumentTextSafe(supabase, { orgId: args.orgId, documentId: args.documentId });
        const candidate = detectDocumentStructure(textResult.text);
        if (!textResult.available && textResult.reason) {
            candidate.warnings = [...new Set([...candidate.warnings, `text_unavailable:${textResult.reason}`])];
        }

        const preview = toStoredDocumentFormPreview(candidate, {
            sourceDocumentId: args.documentId,
            extractedTextAvailable: textResult.available,
        });
        return await dbStoreDocumentFormPreview(supabase, { orgId: args.orgId, caseId: args.caseId, preview });
    } catch (e) {
        console.warn("[maybeBuildDocumentFormPreviewSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}
