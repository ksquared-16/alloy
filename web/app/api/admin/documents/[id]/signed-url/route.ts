import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";
import {
    assertDocumentAccess,
    documentAccessHttp,
    signedUrlExpirySeconds,
} from "@/lib/documents/assertDocumentAccess";

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
 * The storage client is now reached only after a decision of `allowed`.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    const access = await getAdminAccessContextCached();
    const { id } = await context.params;

    const supabase = createAdminClient();

    const decision = await assertDocumentAccess({
        supabase,
        actor: {
            ok: ctx.ok,
            failureStatus: ctx.ok ? undefined : ctx.status,
            userId: ctx.ok ? ctx.userId : undefined,
            orgId: ctx.ok ? ctx.orgId : undefined,
            role: ctx.ok ? ctx.role : undefined,
            roleKeys: access.ok ? access.roleKeys : [],
            permissionKeys: access.ok ? access.permissionKeys : [],
        },
        documentId: id,
        operation: "download",
    });

    if (decision.outcome !== "allowed") {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }

    const { bucket, storagePath } = decision.document;
    const { data, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, signedUrlExpirySeconds("download"));

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
