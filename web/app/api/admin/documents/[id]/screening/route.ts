import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { PROCESSING_DOCUMENTS_MANAGE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { canonicalDocumentEntityType } from "@/lib/documents/documentEntityTypes";
import { documentSubjectInActorScope, requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { actorMayReadSensitivity, resolveDocumentSensitivity } from "@/lib/documents/documentSensitivity";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { QUARANTINED_DOCUMENT_STATUS } from "@/lib/documents/documentAvailability";

/**
 * POST /api/admin/documents/[id]/screening { action: "release", reason } releases a quarantined document (D1c-1).
 *
 * WHO. A reviewer: `processing.documents.manage` AND document read admission, with the document's subject inside the
 * reviewer's department/site scope and every sensitive class it carries cleared (medical → health.view, safeguarding
 * evidence → safeguarding view). Anyone else gets the same refusal as the review queue, or a 404 that does not disclose the
 * document.
 *
 * WHAT. Only a document that is actually `quarantined`; anything else is a 409. A written reason (at least 10 characters)
 * is required. `document_released` is recorded BEFORE the status changes: if the audit cannot be written, nothing is
 * released (503 AUDIT_UNAVAILABLE). The release sets status `uploaded` and keeps the original screening record, adding who
 * released it, when, and why. Releasing never re-runs extraction or opens a Processing case; that stays an explicit
 * operator action.
 *
 * Releasing a file is a human judgement on the screening findings. It does not make the file malware-free, and the record
 * never says so. To discard a quarantined file instead, use the audited document delete.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_DOCUMENTS_MANAGE);
    if (denied) return denied;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const deniedRead = requireDocumentRead(access);
    if (deniedRead) return deniedRead;

    const { id: rawId } = await params;
    const documentId = parseUuidParam(rawId, "id");
    if (documentId instanceof NextResponse) return documentId;

    const body = (await request.json().catch(() => ({}))) as { action?: unknown; reason?: unknown };
    if (body.action !== "release") {
        return NextResponse.json({ error: "Unsupported action", code: "BAD_REQUEST" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10) {
        return NextResponse.json({ error: "A release needs a written reason (at least 10 characters).", code: "REASON_REQUIRED" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("documents")
        .select("id, status, doc_type, entity_type, entity_id, metadata")
        .eq("org_id", ctx.orgId)
        .eq("id", documentId)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const row = data as { id: string; status: string | null; doc_type: string | null; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown> | null } | null;
    // Another organization's id, an absent id and an out-of-scope id are indistinguishable.
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
        return NextResponse.json({ ok: false, error: "You do not have permission to review this document.", code: "SENSITIVE_DOCUMENT" }, { status: 403 });
    }
    if (row.status !== QUARANTINED_DOCUMENT_STATUS) {
        return NextResponse.json({ ok: false, error: "This document is not quarantined.", code: "NOT_QUARANTINED" }, { status: 409 });
    }

    const screening = (row.metadata?.screening as Record<string, unknown> | undefined) ?? {};
    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_released",
        subject: { type: "documents", id: row.id },
        route: "admin/documents/screening/release",
        detail: { reason, screening_engine: screening.engine ?? null, screening_reason: screening.reason ?? null, findings: screening.findings ?? [] },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const releasedAt = new Date().toISOString();
    const { error: upErr } = await supabase
        .from("documents")
        .update({
            status: "uploaded",
            metadata: { ...(row.metadata ?? {}), screening: { ...screening, release: { by: ctx.userId, at: releasedAt, reason, audit_event_id: audit.eventId } } },
        })
        .eq("org_id", ctx.orgId)
        .eq("id", row.id)
        .eq("status", QUARANTINED_DOCUMENT_STATUS);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, document_id: row.id, status: "uploaded", released_at: releasedAt });
}
