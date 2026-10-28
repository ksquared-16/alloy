import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { PROCESSING_DOCUMENTS_MANAGE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { isStoragePathWithinOrg } from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { documentStoredObjects } from "@/lib/documents/documentVersions";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { disclosableDocumentIds } from "@/lib/documents/documentMetadataDisclosure";

/**
 * EN-FI-01: the Processing source-document authority acts only on a document its holder may READ — documents admission,
 * subject scope and sensitivity clearance (health.view for a medical document). Before, `processing.documents.manage`
 * alone could rename (and read back the title and file name of) or delete any document in the organization. Refused as
 * not found, the same answer as a document in another organization.
 */
async function documentReadableByCaller(supabase: ReturnType<typeof createAdminClient>, orgId: string, documentId: string): Promise<boolean> {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return false;
    const readable = await disclosableDocumentIds(supabase, orgId, {
        roleKeys: access.roleKeys,
        permissionKeys: access.permissionKeys,
        scope: scopeDimensionsFromAccess(access),
    }, [documentId]);
    return readable.has(documentId);
}

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/pos/documents/[id] — update operator display name (title only).
 * Original filename remains unchanged for audit.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_DOCUMENTS_MANAGE);
    if (denied) return denied;

    const { id: rawId } = await params;
    const documentId = parseUuidParam(rawId, "id");
    if (documentId instanceof NextResponse) return documentId;

    const body = (await request.json().catch(() => ({}))) as { display_name?: string };
    const displayName = (body.display_name ?? "").trim();
    if (!displayName) return jsonError("Display name cannot be empty.", 400);

    const supabase = createAdminClient();
    if (!(await documentReadableByCaller(supabase, ctx.orgId, documentId))) return jsonError("Not found", 404);
    const { data, error } = await supabase
        .from("documents")
        .update({ title: displayName, updated_at: new Date().toISOString() })
        .eq("org_id", ctx.orgId)
        .eq("id", documentId)
        .select("id, title, original_filename")
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return jsonError("Not found", 404);
    return jsonData({ id: data.id, display_name: data.title, original_filename: data.original_filename });
}

/**
 * DELETE /api/admin/pos/documents/[id] — POS-FP15.
 *
 * SAFE delete of an unprocessed / unused source document (e.g. a test upload). Requires
 * `processing.documents.manage` — deliberately NOT `documents.write`, which `ops` holds in every
 * organization and which would therefore have handed `ops` this deletion. See processingAuthority.
 * org-scoped, and GUARDED: it refuses if the document already produced an editable form
 * (a real template) or its Processing case is completed/archived — those are not throwaway.
 * Otherwise it discards the test artifact: the document's primary case-source link, the
 * Processing case it opened, the stored file, and the document row. Never touches forms,
 * records, billing, or anything published.
 *
 * D1a: the deletion is recorded (`document_delete_authorized`) BEFORE anything is removed, and is
 * refused when that record cannot be written; a failure part-way is recorded as
 * `document_delete_failed`. The stored object is removed only when its path lies inside this
 * organization's prefix — a row is never allowed to aim the service-role client at another tenant's
 * file — and a row whose path does not is refused outright rather than half-deleted.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_DOCUMENTS_MANAGE);
    if (denied) return denied;

    const { id: rawId } = await params;
    const documentId = parseUuidParam(rawId, "id");
    if (documentId instanceof NextResponse) return documentId;

    const supabase = createAdminClient();
    if (!(await documentReadableByCaller(supabase, ctx.orgId, documentId))) return jsonError("Not found", 404);
    let auditedDeletion = false;

    try {
        const { data: docRow, error: docErr } = await supabase
            .from("documents")
            .select("id, bucket, storage_path, entity_type, entity_id, doc_type, legal_hold, retention_until")
            .eq("org_id", ctx.orgId)
            .eq("id", documentId)
            .maybeSingle();
        if (docErr) throw new Error(docErr.message);
        if (!docRow) return jsonError("Not found", 404);
        const doc = docRow as {
            id: string;
            bucket: string | null;
            storage_path: string | null;
            entity_type: string | null;
            entity_id: string | null;
            doc_type: string | null;
            legal_hold: boolean | null;
            retention_until: string | null;
        };
        // D2: a held or retained document is never discarded here.
        const retainedUntil = doc.retention_until ? Date.parse(doc.retention_until) : NaN;
        if (doc.legal_hold === true || (Number.isFinite(retainedUntil) && retainedUntil > Date.now())) {
            return jsonError("This document is under a legal hold or retention period and cannot be deleted.", 409);
        }
        if (doc.storage_path && !isStoragePathWithinOrg(doc.storage_path, ctx.orgId)) {
            return jsonError("This document's stored file is not inside this organization, so it cannot be deleted here.", 409);
        }

        // Processing cases this document is a source of.
        const { data: srcRows, error: srcErr } = await supabase
            .from("processing_case_sources")
            .select("processing_case_id")
            .eq("org_id", ctx.orgId)
            .eq("source_kind", "document")
            .eq("source_id", documentId);
        if (srcErr) throw new Error(srcErr.message);
        const caseIds = [...new Set((srcRows ?? []).map((r) => (r as { processing_case_id: string }).processing_case_id))];

        // GUARD: never delete a document that already produced a form or has a finished case.
        if (caseIds.length > 0) {
            const { data: caseRows, error: caseErr } = await supabase
                .from("processing_cases")
                .select("id, status, metadata")
                .eq("org_id", ctx.orgId)
                .in("id", caseIds);
            if (caseErr) throw new Error(caseErr.message);
            for (const c of (caseRows ?? []) as Array<{ status: string; metadata: Record<string, unknown> | null }>) {
                const meta = c.metadata ?? {};
                if (meta.form_draft_created) {
                    return jsonError("This document already produced a form template — archive that form instead of deleting the document.", 409);
                }
                if (c.status === "completed" || c.status === "archived") {
                    return jsonError("This document’s Processing case is completed/archived — it isn’t a throwaway upload.", 409);
                }
            }
        }

        // Recorded before anything is removed. No record, no deletion.
        const audit = await recordDocumentAudit({
            orgId: ctx.orgId,
            actorUserId: ctx.userId,
            event: "document_delete_authorized",
            subject: { type: "documents", id: documentId },
            route: "admin/pos/documents/delete",
            detail: {
                document_entity_type: doc.entity_type,
                document_entity_id: doc.entity_id,
                doc_type: doc.doc_type,
                processing_case_ids: caseIds,
                had_stored_file: Boolean(doc.bucket && doc.storage_path),
            },
        });
        if (!audit.ok) {
            return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });
        }
        auditedDeletion = true;

        // Safe to discard. Remove case-source links, the opened case(s), the file, the row.
        const { error: delSrcErr } = await supabase
            .from("processing_case_sources")
            .delete()
            .eq("org_id", ctx.orgId)
            .eq("source_kind", "document")
            .eq("source_id", documentId);
        if (delSrcErr) throw new Error(delSrcErr.message);

        if (caseIds.length > 0) {
            const { error: delCaseErr } = await supabase
                .from("processing_cases")
                .delete()
                .eq("org_id", ctx.orgId)
                .in("id", caseIds);
            if (delCaseErr) throw new Error(delCaseErr.message);
        }

        // Every stored file of the document: each version's and the row's own. Best-effort — an object already gone is
        // not a failure. The version rows go with the document row (ON DELETE CASCADE).
        const stored = await documentStoredObjects(supabase, ctx.orgId, [documentId]);
        if (!stored.ok) throw new Error(stored.error);
        for (const object of stored.objects) {
            if (!isStoragePathWithinOrg(object.storagePath, ctx.orgId)) continue;
            const { error: rmErr } = await supabase.storage.from(object.bucket).remove([object.storagePath]);
            if (rmErr) console.warn("[POS_DOC_DELETE_STORAGE]", { document_id: documentId, error: rmErr.message });
        }

        const { error: delDocErr } = await supabase
            .from("documents")
            .delete()
            .eq("org_id", ctx.orgId)
            .eq("id", documentId);
        if (delDocErr) throw new Error(delDocErr.message);

        return jsonData({ deleted: true, document_id: documentId, removed_cases: caseIds.length });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Delete failed";
        if (auditedDeletion) {
            // Best-effort: the authorizing record already exists; this marks that it did not finish.
            await recordDocumentAudit({
                orgId: ctx.orgId,
                actorUserId: ctx.userId,
                event: "document_delete_failed",
                subject: { type: "documents", id: documentId },
                route: "admin/pos/documents/delete",
                detail: { error: message },
            });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
