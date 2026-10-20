import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    assertDocumentAccess,
    documentAccessHttp,
    documentActorForRequest,
    signedUrlExpirySeconds,
} from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";

/**
 * GET: signed URL for a vendor document.
 *
 * Phase 0 commit 6B. This route previously took a caller-supplied storage
 * `path` and authorized it by PREFIX alone (`vendors/{id}/`), never consulting
 * the `documents` table. Path-prefix authorization makes the path the
 * authority and the row decorative, and it is why the six nonconforming
 * `vendors/...` objects exist at all.
 *
 * Authorization is row-driven: the path (or document_id) must resolve to a
 * real `documents` row owned by this org, and only that row's stored
 * bucket/path is ever signed. An arbitrary path with no row is a 404.
 *
 * D1a — THE DOCUMENT MUST BELONG TO THIS VENDOR. Phase 0 proved the vendor and the document were each
 * in the caller's org, and never that they were related: `/vendors/<any vendor>/documents/signed-url
 * ?document_id=<any document>` signed a child's record under a vendor's name. The row must now be
 * attached to vendor `[id]`, or be one of that vendor's referenced document files; anything else is a
 * 404, indistinguishable from a document that does not exist. The issuance is recorded before the
 * link is minted.
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
            actor: documentActorForRequest(ctx, access),
            documentId: resolvedDocumentId,
            operation: "download",
            // If the caller stated a path, it may only AGREE with the row.
            expected: path ? { storagePath: path } : undefined,
        });

        if (decision.outcome !== "allowed") {
            const http = documentAccessHttp(decision);
            return NextResponse.json(http.body, { status: http.status });
        }

        if (!(await documentBelongsToVendor(adminSb, ctx.orgId, id, decision.document))) {
            return NextResponse.json({ ok: false, error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
        }

        const expiresIn = signedUrlExpirySeconds("download");
        const audit = await recordDocumentAudit({
            orgId: decision.document.orgId,
            actorUserId: ctx.userId,
            event: "document_link_issued",
            subject: { type: "documents", id: decision.document.id },
            route: "admin/vendors/documents/signed-url",
            detail: { operation: "download", expires_in_seconds: expiresIn, vendor_id: id },
        });
        if (!audit.ok) {
            return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });
        }

        const { data, error } = await adminSb.storage
            .from(decision.document.bucket)
            .createSignedUrl(decision.document.storagePath, expiresIn);

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

/**
 * Is this document one of vendor `vendorId`'s?
 *
 * Either it is attached to the vendor (`entity_type` vendor, `entity_id` = the vendor — how the
 * public vendor application files them), or the vendor row references it as its insurance or
 * driver's-licence file. Read from the stored rows only; nothing the caller sent is trusted here.
 */
async function documentBelongsToVendor(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    vendorId: string,
    document: { id: string; entityType: string | null; entityId: string | null },
): Promise<boolean> {
    if (document.entityType === "vendor" && document.entityId === vendorId) return true;
    const { data } = await supabase
        .from("vendors")
        .select("insurance_doc_file_id, drivers_license_doc_file_id")
        .eq("id", vendorId)
        .eq("org_id", orgId)
        .maybeSingle();
    const refs = data as { insurance_doc_file_id?: string | null; drivers_license_doc_file_id?: string | null } | null;
    return Boolean(refs && (refs.insurance_doc_file_id === document.id || refs.drivers_license_doc_file_id === document.id));
}
