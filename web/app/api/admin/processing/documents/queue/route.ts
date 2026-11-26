import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { documentActorForRequest, requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { listDocumentFilingQueue } from "@/lib/pos/documentFiling/documentFilingService";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/documents/queue — Processing → Work → Documents (D5).
 *
 * The document cases that need filing to a customer record, each with its derived lane (unclassified, needs a record,
 * needs review, ready, filing error, recently filed), its proposed type and record and the action it needs. Read from
 * the Processing case spine; nothing is persisted for the queue.
 *
 * Needs `processing.operate` (this is Processing work) and `documents.read`. Every row passes the canonical document
 * disclosure (scope, sensitivity): a document the operator may not read is not in their queue.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE);
    if (denied) return denied;
    const access = await getAdminAccessContextCached();
    const actor = documentActorForRequest(ctx, access);
    const readDenied = requireDocumentRead(actor);
    if (readDenied) return readDenied;
    const supabase = createAdminClient();
    const listed = await listDocumentFilingQueue(supabase, actor);
    if (!listed.ok) return NextResponse.json({ ok: false, error: "The document queue could not be read.", code: "QUEUE_UNAVAILABLE" }, { status: 500 });
    return NextResponse.json({ ok: true, rows: listed.rows });
}
