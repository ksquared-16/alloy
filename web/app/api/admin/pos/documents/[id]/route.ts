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
import { DOCUMENT_SOURCE_KINDS } from "@/lib/pos/documentFiling/documentFilingModel";

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

/** D10 (migration 20261218090000): an inbound message's link to the document an attachment was stored as. */
const MESSAGE_ATTACHMENTS_TABLE = "communication_message_attachments";
/**
 * The case-source kinds whose `source_id` is a document id: the filing model's own list, so the guard and the case
 * removal see every case a document can open, including the D9.2 escalation's `upload` and `recreated_document`.
 */
const DOCUMENT_ID_SOURCE_KINDS = [...DOCUMENT_SOURCE_KINDS];

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
 *
 * D10: an inbound email attachment is linked to its message by `communication_message_attachments` (FK ON DELETE
 * RESTRICT, kept) and opens its case as `source_kind = 'email_attachment'`. Both are read before the audit (a read
 * failure refuses with nothing written), named in it, and removed with the document. The row goes BEFORE its stored
 * objects: an object is removed only once the row is gone, so a failure part-way never leaves a row without its file.
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

        // D10: the inbound-message links naming this document. Read before anything is written; a failure refuses.
        const { data: linkRows, error: linkErr } = await supabase
            .from(MESSAGE_ATTACHMENTS_TABLE)
            .select("message_id, provider_attachment_id, disposition")
            .eq("org_id", ctx.orgId)
            .eq("document_id", documentId);
        if (linkErr) throw new Error(linkErr.message);
        const messageLinks = ((linkRows ?? []) as Array<{ message_id: string; provider_attachment_id: string; disposition: string | null }>).map((l) => ({
            message_id: l.message_id,
            provider_attachment_id: l.provider_attachment_id,
            disposition: l.disposition,
        }));

        // Processing cases this document is a source of (an upload's, or an inbound email attachment's).
        const { data: srcRows, error: srcErr } = await supabase
            .from("processing_case_sources")
            .select("processing_case_id")
            .eq("org_id", ctx.orgId)
            .in("source_kind", DOCUMENT_ID_SOURCE_KINDS)
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
                removed_message_attachment_links: messageLinks,
                had_stored_file: Boolean(doc.bucket && doc.storage_path),
            },
        });
        if (!audit.ok) {
            return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });
        }
        auditedDeletion = true;

        // Safe to discard. Remove case-source links, the opened case(s), the message links, the row, then the files.
        // These are separate calls, not one transaction: a failure after the link delete and before the row delete leaves
        // the row without its link, and the next inbound delivery re-links it (the row wins) — harmless, and retryable.
        const { error: delSrcErr } = await supabase
            .from("processing_case_sources")
            .delete()
            .eq("org_id", ctx.orgId)
            .in("source_kind", DOCUMENT_ID_SOURCE_KINDS)
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

        // The links are ON DELETE RESTRICT: removed explicitly (and named in the audit above), never cascaded.
        if (messageLinks.length > 0) {
            const { error: delLinkErr } = await supabase
                .from(MESSAGE_ATTACHMENTS_TABLE)
                .delete()
                .eq("org_id", ctx.orgId)
                .eq("document_id", documentId);
            if (delLinkErr) throw new Error(delLinkErr.message);
        }

        // Every stored file of the document: each version's and the row's own. Listed BEFORE the row goes — the version
        // rows go with it (ON DELETE CASCADE).
        const stored = await documentStoredObjects(supabase, ctx.orgId, [documentId]);
        if (!stored.ok) throw new Error(stored.error);

        const { error: delDocErr } = await supabase
            .from("documents")
            .delete()
            .eq("org_id", ctx.orgId)
            .eq("id", documentId);
        if (delDocErr) throw new Error(delDocErr.message);

        // Only after the row is gone. Best-effort — an object already gone, or a removal that fails, is logged; it is
        // never a 500 that would leave the deletion looking undone.
        for (const object of stored.objects) {
            if (!isStoragePathWithinOrg(object.storagePath, ctx.orgId)) continue;
            const rm = await supabase.storage
                .from(object.bucket)
                .remove([object.storagePath])
                .catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : "remove threw" } }));
            if (rm.error) console.warn("[POS_DOC_DELETE_STORAGE]", { document_id: documentId, error: rm.error.message });
        }

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
