import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertDocumentAccess, documentAccessHttp, documentActorForRequest, requireDocumentWrite } from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { loadRequirementTypes, versionValidity } from "@/lib/documents/requirements/documentRequirementService";
import { validityNeedsEventDates } from "@/lib/documents/validity/documentValidity";
import { loadDocumentOwnerEventDates } from "@/lib/documents/validity/validityEventDates";
import { setDocumentVersionValidity } from "@/lib/documents/review/documentReviewService";
import { resolveDocumentsClock } from "@/lib/documents/validity/documentsClock";
import { isIsoDate } from "@/lib/documents/validity/documentValidity";

/**
 * D7 — a document's validity: the dates recorded on its CURRENT version and what they mean today.
 *
 * GET  `documents.read` admission through the full document access decision (the one that signs a link). Returns the
 *      recorded `effective_on` / `expires_on`, the type's published validity policy and the derived validity on the
 *      ORGANIZATION-local date (valid / expiring soon / expired / not yet in force / date missing / not tracked).
 * PUT  { effective_on: "YYYY-MM-DD" | null, expires_on: "YYYY-MM-DD" | null, reason?, version_id? } — record the dates.
 *      `documents.write` AND the access decision; an unavailable (quarantined, deleted, restricted) document is refused;
 *      only the current version; effective_on <= expires_on. The review is untouched. `document_version_validity_set` is
 *      recorded first; the change is appended to the version's review history (`document_set_version_validity`).
 */
async function current(supabase: ReturnType<typeof createAdminClient>, orgId: string, id: string) {
    const { data: doc } = await supabase.from("documents").select("id, doc_type, current_version_id").eq("org_id", orgId).eq("id", id).maybeSingle();
    const d = doc as { id: string; doc_type: string | null; current_version_id: string | null } | null;
    if (!d?.current_version_id) return null;
    const { data: v } = await supabase
        .from("document_versions")
        .select("id, version_number, review_status, reviewed_at, effective_on, expires_on, created_at")
        .eq("org_id", orgId)
        .eq("id", d.current_version_id)
        .maybeSingle();
    if (!v) return null;
    return { doc: d, version: v as { id: string; version_number: number | null; review_status: string | null; reviewed_at: string | null; effective_on: string | null; expires_on: string | null; created_at: string | null } };
}

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
    const orgId = decision.document.orgId;
    const [cur, types, clock] = await Promise.all([current(supabase, orgId, id), loadRequirementTypes(supabase, orgId), resolveDocumentsClock(supabase, orgId)]);
    if (!cur) return NextResponse.json({ error: "The document has no version.", code: "NO_VERSION" }, { status: 409 });
    if (!types) return NextResponse.json({ error: "Validity could not be read.", code: "VALIDITY_UNAVAILABLE" }, { status: 500 });
    const policy = cur.doc.doc_type ? types.get(cur.doc.doc_type)?.validity_policy ?? null : null;
    const events = validityNeedsEventDates(policy) ? await loadDocumentOwnerEventDates(supabase, orgId, id) : null;
    return NextResponse.json({
        ok: true,
        document_id: id,
        version_id: cur.version.id,
        effective_on: cur.version.effective_on,
        expires_on: cur.version.expires_on,
        policy: policy ?? { kind: "none" },
        validity: versionValidity(types, cur.doc.doc_type, cur.version, clock, events),
        today: clock.today,
    });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const body = (await request.json().catch(() => ({}))) as { effective_on?: unknown; expires_on?: unknown; reason?: unknown; version_id?: unknown };
    const date = (v: unknown): string | null | "invalid" => (v === null || v === undefined || v === "" ? null : isIsoDate(v) ? v : "invalid");
    const effectiveOn = date(body.effective_on);
    const expiresOn = date(body.expires_on);
    if (effectiveOn === "invalid" || expiresOn === "invalid") return NextResponse.json({ error: "Dates are YYYY-MM-DD.", code: "BAD_DATE" }, { status: 400 });
    if (effectiveOn && expiresOn && expiresOn < effectiveOn) {
        return NextResponse.json({ error: "The expiration date is before the effective date.", code: "VALIDITY_RANGE_INVERTED" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;

    const cur = await current(supabase, ctx.orgId, id);
    if (!cur) return NextResponse.json({ error: "The document has no version.", code: "NO_VERSION" }, { status: 409 });
    if (typeof body.version_id === "string" && body.version_id !== cur.version.id) {
        return NextResponse.json({ error: "Only the current version's dates are recorded; reload and try again.", code: "NOT_CURRENT_VERSION" }, { status: 409 });
    }

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_version_validity_set",
        subject: { type: "documents", id },
        route: "admin/documents/validity",
        detail: {
            version_id: cur.version.id,
            from: { effective_on: cur.version.effective_on, expires_on: cur.version.expires_on },
            to: { effective_on: effectiveOn, expires_on: expiresOn },
            reason,
        },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const written = await setDocumentVersionValidity(supabase, {
        orgId: ctx.orgId,
        documentId: id,
        versionId: cur.version.id,
        effectiveOn,
        expiresOn,
        reason,
        actorUserId: ctx.userId,
    });
    if (!written.ok) return NextResponse.json({ error: "The dates could not be recorded.", code: written.code }, { status: written.status });

    const [types, clock] = await Promise.all([loadRequirementTypes(supabase, ctx.orgId), resolveDocumentsClock(supabase, ctx.orgId)]);
    const putPolicy = types && cur.doc.doc_type ? types.get(cur.doc.doc_type)?.validity_policy ?? null : null;
    const putEvents = validityNeedsEventDates(putPolicy) ? await loadDocumentOwnerEventDates(supabase, ctx.orgId, id) : null;
    const validity = types ? versionValidity(types, cur.doc.doc_type, { ...cur.version, effective_on: effectiveOn, expires_on: expiresOn }, clock, putEvents) : null;
    return NextResponse.json({ ok: true, document_id: id, version_id: cur.version.id, changed: written.value.changed, effective_on: effectiveOn, expires_on: expiresOn, validity, today: clock.today });
}
