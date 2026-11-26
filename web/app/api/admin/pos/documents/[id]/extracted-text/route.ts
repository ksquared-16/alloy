import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import {
    assertDocumentAccess,
    documentAccessHttp,
    documentActorForRequest,
} from "@/lib/documents/assertDocumentAccess";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pos/documents/[id]/extracted-text — POS-FP16.
 *
 * Returns the FULL extracted text for a document (the draft only stores a short preview),
 * so the Template Setup "Extracted text" tab can show + search the whole thing for
 * troubleshooting. Read-only, org-scoped. No OCR — just the text the extractor already
 * stored on `documents.extracted_text`.
 *
 * ── AUTHORITY (Documents V1 / D1a) ──
 *
 * Before D1a this asked only for a session, so any portal member could read the OCR text of any
 * document in the organization — including a child's immunization record — while the same
 * document's BYTES were protected by `assertDocumentAccess`. The text is the content; it now passes
 * the identical decision (documents read admission, department/site scope, org storage prefix,
 * restricted status), plus Processing authority because this is a Processing tool.
 *
 * The Processing key is `processing.operate`, not `processing.documents.manage`: Template Setup is
 * ordinary Processing work that `ops` performs, and `manage` is admin-only (rename and delete).
 * Director decision, 2026-10-20.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE);
    if (denied) return denied;

    const { id: rawId } = await params;
    const documentId = parseUuidParam(rawId, "id");
    if (documentId instanceof NextResponse) return documentId;

    const access = await getAdminAccessContextCached();
    const supabase = createAdminClient();

    const decision = await assertDocumentAccess({
        supabase,
        actor: documentActorForRequest(ctx, access),
        documentId,
        operation: "preview",
    });
    if (decision.outcome !== "allowed") {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }

    try {
        const { data, error } = await supabase
            .from("documents")
            .select("extracted_text")
            .eq("org_id", decision.document.orgId)
            .eq("id", decision.document.id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
        const text = typeof (data as { extracted_text?: string | null }).extracted_text === "string"
            ? ((data as { extracted_text: string }).extracted_text)
            : "";
        return NextResponse.json({ ok: true, text, length: text.length });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
