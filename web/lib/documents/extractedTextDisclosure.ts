/**
 * Who may be shown a document's OCR / extracted text, wherever it surfaces (D1b.2 / D1b.6).
 *
 * The bar is the one `GET /api/admin/pos/documents/[id]/extracted-text` already enforces:
 *   * `processing.operate`, because extracted text is Processing working material;
 *   * document read (`documents.read`, or a role the document decision admits);
 *   * the sensitive classes of the source document (medical → `health.view`, safeguarding evidence →
 *     safeguarding view).
 *
 * Processing keeps up to 600 characters of the source document's text in a case's stored form-draft
 * preview (`diagnostics.extracted_text_preview`). The case detail route returned that preview to any org
 * member, and the form-draft routes returned it to `processing.operate` alone. So an actor refused by the
 * extracted-text route could read the same text through them. Those routes now pass the preview through
 * this function, and the text is blanked for anyone who does not meet the bar — since EN-FI-01 also outside the
 * source document's subject scope. Its length stays, so the
 * reviewer still sees that text exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { PROCESSING_OPERATE } from "@/lib/access/processingAuthority";
import { actorMayReadDocuments } from "@/lib/documents/assertDocumentAccess";
import type { SensitivityActor } from "@/lib/documents/documentSensitivity";
import { disclosableDocumentIds } from "@/lib/documents/documentMetadataDisclosure";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

export function actorMayReadExtractedText(actor: SensitivityActor): boolean {
    return (actor.permissionKeys ?? []).includes(PROCESSING_OPERATE) && actorMayReadDocuments(actor);
}

type DraftWithTextPreview = {
    source_document_id?: string | null;
    diagnostics?: { extracted_text_preview?: string | null };
};

/** The draft as this actor may see it: identical, except the OCR preview is blanked when not allowed. */
export async function discloseFormDraftTextPreview<T extends DraftWithTextPreview | null | undefined>(
    supabase: SupabaseClient,
    orgId: string,
    actor: SensitivityActor,
    draft: T,
): Promise<T> {
    if (!draft || !draft.diagnostics || !draft.diagnostics.extracted_text_preview) return draft;
    let allowed = actorMayReadExtractedText(actor);
    if (allowed && draft.source_document_id) {
        // EN-FI-01: admission, the source document's subject SCOPE and its sensitivity clearance. An actor that carries
        // no scope dimensions (a failed access resolution) is refused — scope unknown is not scope granted.
        const scope = "departmentScope" in actor ? scopeDimensionsFromAccess(actor as AdminAccessContextSuccess) : null;
        const readable = await disclosableDocumentIds(supabase, orgId, { ...actor, scope }, [draft.source_document_id]);
        allowed = readable.has(draft.source_document_id);
    }
    if (allowed) return draft;
    return { ...draft, diagnostics: { ...draft.diagnostics, extracted_text_preview: "" } } as T;
}
