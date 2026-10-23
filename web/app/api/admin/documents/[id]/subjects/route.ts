import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import {
    assertDocumentAccess,
    documentAccessHttp,
    documentActorForRequest,
    documentSubjectInActorScope,
    requireDocumentWrite,
} from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import {
    isDocumentOwnerSubjectType,
    legacyEntityTypeForSubject,
    linkDocumentSubject,
    listDocumentSubjects,
    setPrimaryDocumentSubject,
    unlinkDocumentSubject,
} from "@/lib/documents/documentSubjects";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * D2 — what a document belongs to.
 *
 * GET  the document's active associations: its owners (one primary) and its context links, including the ones other
 *      domains hold (form submissions, Processing cases). Admission is the full document access decision.
 *
 * POST { action: "set_primary" | "link" | "unlink", subject_type, subject_id, association? } changes them.
 *      Needs `documents.write`, the access decision on the DOCUMENT, and the TARGET subject inside the actor's scope — an
 *      actor can never file a document under, or link it to, a record they could not see. Only owning subject types are
 *      named here; Processing-case and form-submission context links are owned by those domains and appear through the
 *      derived view. The primary owner decides access, so moving it is the re-filing action; linking a further owner or a
 *      context grants nobody anything. `document_subject_changed` is recorded before the change.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    const access = await getAdminAccessContextCached();
    const { id } = await context.params;
    const supabase = createAdminClient();
    const decision = await assertDocumentAccess({ supabase, actor: documentActorForRequest(ctx, access), documentId: id, operation: "preview" });
    if (decision.outcome !== "allowed") {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }
    const listed = await listDocumentSubjects(supabase, decision.document.orgId, decision.document.id);
    if (!listed.ok) return NextResponse.json({ ok: false, error: "Subjects could not be read.", code: "SUBJECTS_UNAVAILABLE" }, { status: 500 });
    return NextResponse.json({ ok: true, document_id: decision.document.id, subjects: listed.subjects });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden", code: "AUTH" }, { status: ctx.status });
    const writeDenied = requireDocumentWrite(ctx);
    if (writeDenied) return writeDenied;
    const access = await getAdminAccessContextCached();
    const { id } = await context.params;
    const supabase = createAdminClient();

    const decision = await assertDocumentAccess({ supabase, actor: documentActorForRequest(ctx, access), documentId: id, operation: "download" });
    if (decision.outcome !== "allowed") {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }
    const document = decision.document;

    const body = (await request.json().catch(() => ({}))) as { action?: unknown; subject_type?: unknown; subject_id?: unknown; association?: unknown };
    const action = body.action;
    if (action !== "set_primary" && action !== "link" && action !== "unlink") {
        return NextResponse.json({ error: "Unsupported action", code: "BAD_REQUEST" }, { status: 400 });
    }
    const subjectType = body.subject_type;
    const subjectId = typeof body.subject_id === "string" ? body.subject_id.trim() : "";
    if (!isDocumentOwnerSubjectType(subjectType) || !UUID_RE.test(subjectId)) {
        return NextResponse.json({ error: "Name an owning subject (household, person, child, opportunity or vendor) by id.", code: "BAD_SUBJECT" }, { status: 400 });
    }
    const association = body.association === "context" ? "context" : "owner";

    // The target must be a subject this actor can see. Not-in-scope and not-in-org are indistinguishable.
    const targetVisible = await documentSubjectInActorScope(supabase, document.orgId, access.ok ? scopeDimensionsFromAccess(access) : null, {
        entityType: legacyEntityTypeForSubject(subjectType),
        entityId: subjectId,
    });
    if (!targetVisible) return NextResponse.json({ ok: false, error: "Subject not found", code: "SUBJECT_NOT_FOUND" }, { status: 404 });

    const audit = await recordDocumentAudit({
        orgId: document.orgId,
        actorUserId: ctx.userId,
        event: "document_subject_changed",
        subject: { type: "documents", id: document.id },
        route: "admin/documents/subjects",
        detail: {
            action,
            subject_type: subjectType,
            subject_id: subjectId,
            association: action === "set_primary" ? "owner" : association,
            previous_primary: document.entityType && document.entityId ? { entity_type: document.entityType, entity_id: document.entityId } : null,
        },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const input = { orgId: document.orgId, documentId: document.id, subjectType, subjectId, actorUserId: ctx.userId };
    const changed =
        action === "set_primary"
            ? await setPrimaryDocumentSubject(supabase, input)
            : action === "link"
              ? await linkDocumentSubject(supabase, { ...input, association })
              : await unlinkDocumentSubject(supabase, input);
    if (!changed.ok) {
        const status = changed.code === "SUBJECT_NOT_IN_ORG" ? 404 : changed.code === "NOT_FOUND" ? 404 : changed.code === "SUBJECT_CHANGE_FAILED" ? 500 : 409;
        return NextResponse.json({ ok: false, error: "The association could not be changed.", code: changed.code }, { status });
    }
    return NextResponse.json({ ok: true, document_id: document.id, action, result: changed.result });
}
