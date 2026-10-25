import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertDocumentAccess, documentAccessHttp, documentActorForRequest } from "@/lib/documents/assertDocumentAccess";
import { buildDocumentHistory } from "@/lib/documents/library/documentHistory";

/**
 * GET — D4.5: a document's history (committed changes, system events, refused attempts, link issuance).
 *
 * Admission is the full document access decision, the same one that lists versions and signs a link: a document the
 * actor may not open has no visible history, and an unknown, foreign or out-of-scope id is 404.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    const access = await getAdminAccessContextCached();
    const { id } = await context.params;
    const supabase = createAdminClient();

    const decision = await assertDocumentAccess({ supabase, actor: documentActorForRequest(ctx, access), documentId: id, operation: "preview" });
    if (decision.outcome !== "allowed") {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }
    const history = await buildDocumentHistory(supabase, decision.document.orgId, decision.document.id);
    if (!history.ok) return NextResponse.json({ ok: false, error: "The history could not be read.", code: "HISTORY_UNAVAILABLE" }, { status: 500 });
    return NextResponse.json({ ok: true, document_id: decision.document.id, entries: history.entries });
}
