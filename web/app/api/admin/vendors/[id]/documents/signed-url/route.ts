import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { ORG_DOCUMENTS_STORAGE_BUCKET } from "@/lib/storage/orgDocumentsBucket";
import {
    assertDocumentAccess,
    documentAccessHttp,
    signedUrlExpirySeconds,
} from "@/lib/documents/assertDocumentAccess";

/**
 * GET: signed URL for a vendor document.
 *
 * Phase 0 commit 6B. This route previously took a caller-supplied storage
 * `path` and authorized it by PREFIX alone (`vendors/{id}/`), never consulting
 * the `documents` table. Path-prefix authorization makes the path the
 * authority and the row decorative, and it is why the six nonconforming
 * `vendors/...` objects exist at all.
 *
 * Authorization is now row-driven: the path (or document_id) must resolve to a
 * real `documents` row owned by this org, and only that row's stored
 * bucket/path is ever signed. An arbitrary path with no row is a 404.
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    const access = await getAdminAccessContextCached();

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ ok: false, error: "Missing vendor id" }, { status: 400 });
    }

    const documentId = request.nextUrl.searchParams.get("document_id");
    const path = request.nextUrl.searchParams.get("path");
    if (!documentId && !path) {
        return NextResponse.json({ ok: false, error: "Missing document_id" }, { status: 400 });
    }

    try {
        const adminSb = createAdminClient();

        // Vendor must belong to the caller's org before anything else is read.
        if (!ctx.ok || !(await assertRowOrg(adminSb, "vendors", id, ctx.orgId)).ok) {
            return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
        }

        // Resolve the caller's reference to a REAL document row in this org.
        // A path that maps to no row cannot be signed.
        let resolvedDocumentId = documentId;
        if (!resolvedDocumentId && path) {
            const { data: byPath } = await adminSb
                .from("documents")
                .select("id")
                .eq("org_id", ctx.orgId)
                .eq("storage_path", path)
                .maybeSingle();
            resolvedDocumentId = (byPath as { id?: string } | null)?.id ?? null;
        }
        if (!resolvedDocumentId) {
            return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
        }

        const decision = await assertDocumentAccess({
            supabase: adminSb,
            actor: {
                ok: ctx.ok,
                failureStatus: ctx.ok ? undefined : ctx.status,
                userId: ctx.ok ? ctx.userId : undefined,
                orgId: ctx.ok ? ctx.orgId : undefined,
                role: ctx.ok ? ctx.role : undefined,
                roleKeys: access.ok ? access.roleKeys : [],
                permissionKeys: access.ok ? access.permissionKeys : [],
            },
            documentId: resolvedDocumentId,
            operation: "download",
            // If the caller stated a path, it may only AGREE with the row.
            expected: path ? { storagePath: path } : undefined,
        });

        if (decision.outcome !== "allowed") {
            const http = documentAccessHttp(decision);
            return NextResponse.json(http.body, { status: http.status });
        }

        const { data, error } = await adminSb.storage
            .from(decision.document.bucket || ORG_DOCUMENTS_STORAGE_BUCKET)
            .createSignedUrl(decision.document.storagePath, signedUrlExpirySeconds("download"));

        if (error || !data?.signedUrl) {
            console.error("[VENDOR_DOC_SIGNED_URL]", { document_id: decision.document.id });
            return NextResponse.json({ ok: false, error: "Could not sign document" }, { status: 500 });
        }

        return NextResponse.json({ ok: true, signedUrl: data.signedUrl });
    } catch (e) {
        console.error("[VENDOR_DOC_SIGNED_URL_UNEXPECTED]");
        return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
    }
}
