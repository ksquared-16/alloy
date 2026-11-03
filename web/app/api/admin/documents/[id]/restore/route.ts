import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { canonicalDocumentEntityType } from "@/lib/documents/documentEntityTypes";
import { documentSubjectInActorScope, requireDocumentRead, requireDocumentWrite } from "@/lib/documents/assertDocumentAccess";
import { actorMayReadSensitivity, resolveDocumentSensitivity } from "@/lib/documents/documentSensitivity";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { ARCHIVED_DOCUMENT_STATUS } from "@/lib/documents/documentAvailability";

/**
 * POST /api/admin/documents/[id]/restore { reason } — D9.3: staff restore of an archived document.
 *
 * WHO. Staff only, never an `/api/v1` application: `documents.write` AND document read admission, with the document's
 * subject inside the actor's department/site scope and every sensitive class it carries cleared. Anyone else gets the
 * library's refusal, or a 404 that does not disclose the document (another organization, absent, out of scope).
 *
 * WHAT. Only an `archived` document; anything else is a 409 NOT_ARCHIVED. A written reason (at least 10 characters) is
 * required. `document_restored` is recorded BEFORE `public.document_unarchive` runs: if the audit cannot be written,
 * nothing is restored (503 AUDIT_UNAVAILABLE). The database function returns the document to the status it had before
 * the archive and keeps the archive record, adding who restored it, when and why. Nothing else changes: no version,
 * review, subject or file is touched.
 *
 * `document_unarchive` is part of the pending archive migration (`20261217090000_documents_d9_3_archive.sql`, NOT
 * applied). Until a database has it this answers 503 `archive_unavailable` — and no document can be archived there.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const writeDenied = requireDocumentWrite(ctx);
    if (writeDenied) return writeDenied;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const readDenied = requireDocumentRead(access);
    if (readDenied) return readDenied;

    const { id: rawId } = await params;
    const documentId = parseUuidParam(rawId, "id");
    if (documentId instanceof NextResponse) return documentId;

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
    if (reason.length < 10) {
        return NextResponse.json({ error: "A restore needs a written reason (at least 10 characters).", code: "REASON_REQUIRED" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("documents")
        .select("id, status, doc_type, entity_type, entity_id, metadata")
        .eq("org_id", ctx.orgId)
        .eq("id", documentId)
        .maybeSingle();
    if (error) return NextResponse.json({ error: "The document could not be read.", code: "READ_FAILED" }, { status: 500 });
    const row = data as { id: string; status: string | null; doc_type: string | null; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown> | null } | null;
    const notFound = NextResponse.json({ ok: false, error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
    if (!row) return notFound;
    if (
        !(await documentSubjectInActorScope(supabase, ctx.orgId, scopeDimensionsFromAccess(access), {
            entityType: canonicalDocumentEntityType(row.entity_type),
            entityId: row.entity_id,
        }))
    ) {
        return notFound;
    }
    const classes = await resolveDocumentSensitivity(supabase, ctx.orgId, [{ id: row.id, doc_type: row.doc_type }]);
    if (!actorMayReadSensitivity(access, classes.get(row.id) ?? new Set())) {
        return NextResponse.json({ ok: false, error: "You do not have permission to restore this document.", code: "SENSITIVE_DOCUMENT" }, { status: 403 });
    }
    if (row.status !== ARCHIVED_DOCUMENT_STATUS) {
        return NextResponse.json({ ok: false, error: "This document is not archived.", code: "NOT_ARCHIVED" }, { status: 409 });
    }

    const archive = (row.metadata?.archive as Record<string, unknown> | undefined) ?? {};
    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_restored",
        subject: { type: "documents", id: row.id },
        route: "admin/documents/restore",
        detail: { reason, archived_at: archive.archived_at ?? null, previous_status: archive.previous_status ?? null },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const { data: restored, error: rpcError } = await supabase.rpc("document_unarchive", {
        p_org_id: ctx.orgId,
        p_document_id: row.id,
        p_reason: reason,
        p_actor: ctx.userId,
        p_audit_event_id: audit.eventId,
    });
    if (rpcError) {
        if (rpcError.code === "PGRST202" || rpcError.code === "42883") {
            return NextResponse.json({ ok: false, error: "Restoring is not available yet.", code: "archive_unavailable" }, { status: 503 });
        }
        if (/document_unarchive_not_archived/.test(rpcError.message ?? "")) {
            return NextResponse.json({ ok: false, error: "This document is not archived.", code: "NOT_ARCHIVED" }, { status: 409 });
        }
        if (/document_archive_not_found/.test(rpcError.message ?? "")) return notFound;
        return NextResponse.json({ ok: false, error: "The document could not be restored.", code: "RESTORE_FAILED" }, { status: 500 });
    }
    const status = (restored as { status?: unknown } | null)?.status;
    return NextResponse.json({ ok: true, document_id: row.id, status: typeof status === "string" ? status : null });
}
