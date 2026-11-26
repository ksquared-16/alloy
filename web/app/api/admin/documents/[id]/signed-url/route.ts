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
import { isStoragePathWithinOrg } from "@/lib/documents/storagePathAuthority";
import { loadDocumentVersionLocation } from "@/lib/documents/documentVersions";

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
 *
 * D2: `?version=<version id>` signs a HISTORICAL version of the same document. The decision is the document's own — the
 * one decision for every version — and the version must belong to that document in that organization, inside its org
 * prefix. The audit names the version.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const requestedVersion = request.nextUrl.searchParams.get("version")?.trim() || null;
    let target: { bucket: string; storagePath: string; versionId: string | null; versionNumber: number | null } = {
        bucket: decision.document.bucket,
        storagePath: decision.document.storagePath,
        versionId: null,
        versionNumber: null,
    };
    if (requestedVersion) {
        const located = await loadDocumentVersionLocation(supabase, decision.document.orgId, decision.document.id, requestedVersion);
        if (!located.ok) {
            return NextResponse.json({ ok: false, error: "Document not found", code: "NOT_FOUND" }, { status: located.notFound ? 404 : 500 });
        }
        if (!isStoragePathWithinOrg(located.version.storagePath, decision.document.orgId)) {
            return NextResponse.json({ ok: false, error: "This document could not be verified.", code: "PATH_OUTSIDE_ORG" }, { status: 403 });
        }
        target = {
            bucket: located.version.bucket,
            storagePath: located.version.storagePath,
            versionId: located.version.id,
            versionNumber: located.version.version_number,
        };
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
            ...(target.versionId ? { version_id: target.versionId, version_number: target.versionNumber } : {}),
        },
    });
    if (!audit.ok) {
        return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });
    }

    const { bucket, storagePath } = target;
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
