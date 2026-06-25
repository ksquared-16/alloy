import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/pos/documents/[id] — POS-FP15.
 *
 * SAFE delete of an unprocessed / unused source document (e.g. a test upload). Admin-only,
 * org-scoped, and GUARDED: it refuses if the document already produced an editable form
 * (a real template) or its Processing case is completed/archived — those are not throwaway.
 * Otherwise it discards the test artifact: the document's primary case-source link, the
 * Processing case it opened, the stored file, and the document row. Never touches forms,
 * records, billing, or anything published.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { id: rawId } = await params;
    const documentId = parseUuidParam(rawId, "id");
    if (documentId instanceof NextResponse) return documentId;

    const supabase = createAdminClient();

    try {
        const { data: docRow, error: docErr } = await supabase
            .from("documents")
            .select("id, bucket, storage_path")
            .eq("org_id", ctx.orgId)
            .eq("id", documentId)
            .maybeSingle();
        if (docErr) throw new Error(docErr.message);
        if (!docRow) return jsonError("Not found", 404);
        const doc = docRow as { id: string; bucket: string | null; storage_path: string | null };

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

        if (doc.bucket && doc.storage_path) {
            // Best-effort storage cleanup — don't fail the delete if the object is already gone.
            const { error: rmErr } = await supabase.storage.from(doc.bucket).remove([doc.storage_path]);
            if (rmErr) console.warn("[POS_DOC_DELETE_STORAGE]", doc.bucket, doc.storage_path, rmErr.message);
        }

        const { error: delDocErr } = await supabase
            .from("documents")
            .delete()
            .eq("org_id", ctx.orgId)
            .eq("id", documentId);
        if (delDocErr) throw new Error(delDocErr.message);

        return jsonData({ deleted: true, document_id: documentId, removed_cases: caseIds.length });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
    }
}
