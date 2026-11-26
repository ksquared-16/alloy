import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { PROCESSING_DOCUMENTS_MANAGE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { filterDocumentRowsInActorScope, requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { filterDocumentRowsBySensitivity } from "@/lib/documents/documentSensitivity";
import { QUARANTINED_DOCUMENT_STATUS } from "@/lib/documents/documentAvailability";

/**
 * GET /api/admin/documents/screening is the review queue: this organization's quarantined documents (D1c-1).
 *
 * Quarantined documents appear in no other list. Only a reviewer sees them here: an actor who holds
 * `processing.documents.manage` (the authority that already governs deleting a document) AND document read admission. The
 * same department/site scope and sensitive-class filters as every other document list still apply.
 *
 * It returns the screening record (engine, reason, findings), never bytes, links or text. A quarantined document cannot be
 * opened until it is released.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_DOCUMENTS_MANAGE);
    if (denied) return denied;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const deniedRead = requireDocumentRead(access);
    if (deniedRead) return deniedRead;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("documents")
        .select("id, title, doc_type, entity_type, entity_id, created_at, metadata")
        .eq("org_id", ctx.orgId)
        .eq("status", QUARANTINED_DOCUMENT_STATUS)
        .order("created_at", { ascending: false })
        .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = { id: string; title: string | null; doc_type: string | null; entity_type: string | null; entity_id: string | null; created_at: string | null; metadata: Record<string, unknown> | null };
    const scoped = await filterDocumentRowsBySensitivity(
        supabase,
        ctx.orgId,
        access,
        await filterDocumentRowsInActorScope(supabase, ctx.orgId, scopeDimensionsFromAccess(access), (data ?? []) as Row[]),
    );
    return NextResponse.json({
        documents: scoped.map((r) => ({
            id: r.id,
            title: r.title,
            doc_type: r.doc_type,
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            created_at: r.created_at,
            screening: (r.metadata?.screening as Record<string, unknown> | undefined) ?? null,
        })),
    });
}
