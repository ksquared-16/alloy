import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";
import {
    assertDocumentAccess,
    documentAccessHttp,
    documentActorForRequest,
    signedUrlExpirySeconds,
} from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";

/**
 * GET: signed URL for a document the actor is authorized to read.
 *
 * Phase 0 commit 6 moved authorization into `assertDocumentAccess`. This route
 * previously checked only `ctx.ok` — "is there a session?" — then signed with
 * the service-role client, which bypasses the `documents` RLS restricting
 * SELECT to owner|admin|ops|manager. Because `getAdminContextCached` returns ok
 * for ANY org member, a viewer could mint a URL for any document in the org,
 * including another child's records.
 *
 * D1a: the decision now carries the actor's department/site scope and the org-prefix check, and the
 * issuance is recorded (`document_link_issued`) BEFORE the link is minted — no record, no link.
 *
 * The storage client is reached only after a decision of `allowed`.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    const access = await getAdminAccessContextCached();
    const { id } = await context.params;

    const supabase = createAdminClient();

    const decision = await assertDocumentAccess({
        supabase,
        actor: documentActorForRequest(ctx, access),
        documentId: id,
        operation: "download",
    });

    if (decision.outcome !== "allowed" || !ctx.ok) {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }

    const expiresIn = signedUrlExpirySeconds("download");
    const audit = await recordDocumentAudit({
        orgId: decision.document.orgId,
        actorUserId: ctx.userId,
        event: "document_link_issued",
        subject: { type: "documents", id: decision.document.id },
        route: "admin/documents/signed-url",
        detail: {
            operation: "download",
            expires_in_seconds: expiresIn,
            document_entity_type: decision.document.entityType,
            document_entity_id: decision.document.entityId,
        },
    });
    if (!audit.ok) {
        return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });
    }

    const { bucket, storagePath } = decision.document;
    const { data, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresIn);

    if (signErr || !data?.signedUrl) {
        // Never log the signed URL or the storage path.
        console.error("[DOCUMENT_SIGNED_URL_STORAGE]", { document_id: decision.document.id });
        const classified = classifySupabaseStorageError(signErr);
        return NextResponse.json(
            { ok: false, error: classified.message, code: classified.code },
            { status: classified.httpStatus }
        );
    }

    return NextResponse.json({ ok: true, signedUrl: data.signedUrl });
}
