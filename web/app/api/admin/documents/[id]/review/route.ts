import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertDocumentAccess, documentAccessHttp, documentActorForRequest, requireDocumentWrite } from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { actorMayRereview, DOCUMENT_REREVIEW_PERMISSION, reviewDocumentVersion } from "@/lib/documents/review/documentReviewService";

/**
 * POST { decision: "accepted" | "rejected" | "pending", reason?, version_id? } — record the review of a document's CURRENT
 * version (D6; lifecycle and history D7).
 *
 * Accepting is what turns uploaded-but-unaccepted evidence into evidence that satisfies a document requirement; rejecting
 * blocks it until a new document arrives. The review is a fact about the version (`document_versions.review_status`),
 * never about a requirement: requirement satisfaction stays derived.
 *
 * Lifecycle (D7, `document_review_version`):
 *   - a version still pending (or never reviewed) takes its FIRST decision with `documents.write`;
 *   - a rejection, and a reopen (`pending`), need a reason;
 *   - a version already accepted or rejected is RE-REVIEWED (changed, or reopened) only with re-review authority
 *     (`processing.documents.manage`, else 403 REREVIEW_NOT_AUTHORIZED) and a reason;
 *   - every decision is appended to `document_version_review_events` (reviewer, decision, reason, prior state), so the
 *     record keeps the whole history, not only the latest decision.
 *
 * Authority: `documents.write` AND the full document access decision (organization, subject scope, every sensitive
 * class, availability) — the same authority that accepts a review when D5 files a document. A quarantined or otherwise
 * unavailable document cannot be reviewed (the access decision refuses it, and the database function again), so a
 * review never bypasses quarantine. Only the current version is reviewed. `document_version_reviewed` is recorded first.
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
    const review = body.decision === "accepted" || body.decision === "rejected" || body.decision === "pending" ? body.decision : null;
    if (!review) return NextResponse.json({ error: "decision must be accepted, rejected or pending", code: "BAD_REQUEST" }, { status: 400 });
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
    if ((review === "rejected" || review === "pending") && reason.length < 3) {
        return NextResponse.json({ error: review === "rejected" ? "A rejection needs a reason." : "Reopening a review needs a reason.", code: "REASON_REQUIRED" }, { status: 400 });
    }

    const { data: doc, error: docErr } = await supabase.from("documents").select("id, current_version_id").eq("org_id", ctx.orgId).eq("id", id).maybeSingle();
    if (docErr) return NextResponse.json({ error: "The document could not be read.", code: "READ_FAILED" }, { status: 500 });
    const currentVersionId = (doc as { current_version_id?: string | null } | null)?.current_version_id ?? null;
    if (!currentVersionId) return NextResponse.json({ error: "The document has no version to review.", code: "NO_VERSION" }, { status: 409 });
    if (typeof body.version_id === "string" && body.version_id !== currentVersionId) {
        return NextResponse.json({ error: "Only the current version is reviewed; reload and try again.", code: "NOT_CURRENT_VERSION" }, { status: 409 });
    }
    const { data: version } = await supabase.from("document_versions").select("id, review_status").eq("org_id", ctx.orgId).eq("id", currentVersionId).maybeSingle();
    const v = version as { review_status?: string | null } | null;
    if (!v) return NextResponse.json({ error: "The document has no version to review.", code: "NO_VERSION" }, { status: 409 });

    const decided = v.review_status === "accepted" || v.review_status === "rejected";
    if (decided && !actorMayRereview(ctx)) {
        return NextResponse.json(
            { error: "This version was already reviewed; changing a review needs Documents administration.", code: "REREVIEW_NOT_AUTHORIZED", required_permission: DOCUMENT_REREVIEW_PERMISSION },
            { status: 403 },
        );
    }
    if (decided && reason.length < 3) {
        return NextResponse.json({ error: "Changing a review needs a reason.", code: "REASON_REQUIRED" }, { status: 400 });
    }

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_version_reviewed",
        subject: { type: "documents", id },
        route: "admin/documents/review",
        detail: { version_id: currentVersionId, from: v.review_status ?? null, to: review, reason: reason || null, rereview: decided },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const written = await reviewDocumentVersion(supabase, {
        orgId: ctx.orgId,
        documentId: id,
        versionId: currentVersionId,
        decision: review,
        reason: reason || null,
        actorUserId: ctx.userId,
        rereview: decided,
    });
    if (!written.ok) return NextResponse.json({ error: "The review could not be recorded.", code: written.code }, { status: written.status });
    return NextResponse.json({
        ok: true,
        document_id: id,
        version_id: currentVersionId,
        review_status: written.value.review_status,
        previous_review_status: written.value.previous_review_status,
        rereview: written.value.rereview,
        event_id: written.value.event_id,
    });
}
