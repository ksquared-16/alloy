import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertDocumentAccess, documentAccessHttp, documentActorForRequest, requireDocumentWrite } from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";

/**
 * POST { decision: "accepted" | "rejected", reason?, version_id? } — D6: record the review of a document's CURRENT version.
 *
 * Accepting is what turns uploaded-but-unaccepted evidence into evidence that satisfies a document requirement; rejecting
 * blocks it until a new document arrives. The review is a fact about the version (`document_versions.review_status`,
 * through the governed `document_set_version_review`), never about a requirement: requirement satisfaction stays derived.
 *
 * Authority: `documents.write` AND the full document access decision (organization, subject scope, every sensitive
 * class, availability) — the same authority that accepts a review when D5 files a document. A quarantined or otherwise
 * unavailable document cannot be reviewed (the access decision refuses it), so a review never bypasses quarantine.
 * Only the current version is reviewed; a rejection needs a reason. `document_version_reviewed` is recorded first.
 */
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

    const body = (await request.json().catch(() => ({}))) as { decision?: unknown; reason?: unknown; version_id?: unknown };
    const review = body.decision === "accepted" || body.decision === "rejected" ? body.decision : null;
    if (!review) return NextResponse.json({ error: "decision must be accepted or rejected", code: "BAD_REQUEST" }, { status: 400 });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (review === "rejected" && reason.length < 3) {
        return NextResponse.json({ error: "A rejection needs a reason.", code: "REASON_REQUIRED" }, { status: 400 });
    }

    const { data: doc, error: docErr } = await supabase.from("documents").select("id, current_version_id").eq("org_id", ctx.orgId).eq("id", id).maybeSingle();
    if (docErr) return NextResponse.json({ error: "The document could not be read.", code: "READ_FAILED" }, { status: 500 });
    const currentVersionId = (doc as { current_version_id?: string | null } | null)?.current_version_id ?? null;
    if (!currentVersionId) return NextResponse.json({ error: "The document has no version to review.", code: "NO_VERSION" }, { status: 409 });
    if (typeof body.version_id === "string" && body.version_id !== currentVersionId) {
        return NextResponse.json({ error: "Only the current version is reviewed; reload and try again.", code: "NOT_CURRENT_VERSION" }, { status: 409 });
    }
    const { data: version } = await supabase
        .from("document_versions")
        .select("id, review_status, effective_on, expires_on")
        .eq("org_id", ctx.orgId)
        .eq("id", currentVersionId)
        .maybeSingle();
    const v = version as { review_status?: string | null; effective_on?: string | null; expires_on?: string | null } | null;
    if (!v) return NextResponse.json({ error: "The document has no version to review.", code: "NO_VERSION" }, { status: 409 });

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_version_reviewed",
        subject: { type: "documents", id },
        route: "admin/documents/review",
        detail: { version_id: currentVersionId, from: v.review_status ?? null, to: review, reason: reason || null },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    // Validity dates belong to the version and are D7's; the review keeps whatever the version already records.
    const { error } = await supabase.rpc("document_set_version_review", {
        p_org_id: ctx.orgId,
        p_version_id: currentVersionId,
        p_review_status: review,
        p_actor: ctx.userId,
        p_effective_on: v.effective_on ?? null,
        p_expires_on: v.expires_on ?? null,
    });
    if (error) return NextResponse.json({ error: "The review could not be recorded.", code: "REVIEW_FAILED" }, { status: 500 });
    return NextResponse.json({ ok: true, document_id: id, version_id: currentVersionId, review_status: review });
}
