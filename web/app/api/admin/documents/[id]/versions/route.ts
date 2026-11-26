import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";
import { capabilitiesForFormat, detectProcessingSourceFormat } from "@/lib/pos/processingSourceCapabilities";
import {
    assertDocumentAccess,
    documentAccessHttp,
    documentActorForRequest,
    requireDocumentWrite,
} from "@/lib/documents/assertDocumentAccess";
import { bytesMatchDocumentKind, CANONICAL_DOCUMENT_MIME, type DocumentContentKind } from "@/lib/documents/documentContentSignature";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { ADMIN_DOCUMENT_UPLOAD_MAX_BYTES } from "@/lib/documents/documentUploadLimits";
import { decideIngestion } from "@/lib/documents/screenedIngestion";
import { addDocumentVersion, listDocumentVersions } from "@/lib/documents/documentVersions";
import { checkDocumentTypeForWrite, markVersionPendingReview } from "@/lib/documents/configuration/documentTypeEnforcement";
import { documentSubjectTypeForLegacy } from "@/lib/documents/documentSubjects";
import { setDocumentVersionValidity } from "@/lib/documents/review/documentReviewService";
import { isIsoDate } from "@/lib/documents/validity/documentValidity";

/**
 * D2 — a document's versions.
 *
 * GET  lists them, newest first, with the current one marked. Metadata only: never a storage path. Admission is the full
 *      document access decision (read admission, subject scope, every sensitive class, availability), the same one that
 *      signs a link — so the list is visible exactly to those who may open the document.
 *
 * POST replaces the file: multipart `file` + `reason` (at least 10 characters). It needs `documents.write` AND the access
 *      decision. The new bytes go through the same content-signature check and D1c-1 screening as an upload, and only a
 *      CLEAN file becomes a version: a file screening would quarantine or refuse is not stored at all (a replacement
 *      never reaches a reader through a release queue). `document_version_added` is recorded before the version exists;
 *      no record, no version. The previous version is kept and stays retrievable through
 *      `GET /api/admin/documents/[id]/signed-url?version=<id>`. The document's OCR text belonged to the previous bytes and
 *      is cleared; extraction is not re-run here.
 *
 *      D7 RENEWAL: a replacement is how an expiring or expired document is renewed. Optional `effective_on` /
 *      `expires_on` (YYYY-MM-DD) are recorded on the NEW version (`document_set_version_validity`, in its review history).
 *      The new version is PENDING review when the type requires review or its validity policy says `review_on_renewal`;
 *      until it is accepted it satisfies nothing, while the earlier accepted version keeps counting if it is still in
 *      force (the D6/D7 evaluator). A file screening would quarantine is never stored, so it can never satisfy anything.
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
    const listed = await listDocumentVersions(supabase, decision.document.orgId, decision.document.id);
    if (!listed.ok) return NextResponse.json({ ok: false, error: "Versions could not be read.", code: "VERSIONS_UNAVAILABLE" }, { status: 500 });
    return NextResponse.json({ ok: true, document_id: decision.document.id, versions: listed.versions });
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
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

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: "Expected multipart form data", code: "BAD_REQUEST" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "A file is required", code: "FILE_REQUIRED" }, { status: 400 });
    const reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")).trim() : "";
    if (reason.length < 10) {
        return NextResponse.json({ error: "A replacement needs a written reason (at least 10 characters).", code: "REASON_REQUIRED" }, { status: 400 });
    }
    const dateField = (k: string): string | null | "invalid" => {
        const raw = formData.get(k);
        if (raw === null || raw === "") return null;
        return typeof raw === "string" && isIsoDate(raw.trim()) ? raw.trim() : "invalid";
    };
    const effectiveOn = dateField("effective_on");
    const expiresOn = dateField("expires_on");
    if (effectiveOn === "invalid" || expiresOn === "invalid") return NextResponse.json({ error: "Dates are YYYY-MM-DD.", code: "BAD_DATE" }, { status: 400 });
    if (effectiveOn && expiresOn && expiresOn < effectiveOn) {
        return NextResponse.json({ error: "The expiration date is before the effective date.", code: "VALIDITY_RANGE_INVERTED" }, { status: 400 });
    }

    const origName = file instanceof File && file.name ? file.name : "replacement";
    const sourceFormat = detectProcessingSourceFormat(origName, file.type || "");
    const caps = capabilitiesForFormat(sourceFormat);
    if (!caps.store) return NextResponse.json({ error: `${caps.label} is not supported.`, code: "UNSUPPORTED_FORMAT" }, { status: 415 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > ADMIN_DOCUMENT_UPLOAD_MAX_BYTES) {
        return NextResponse.json({ error: "The file is too large.", code: "FILE_TOO_LARGE", max_bytes: ADMIN_DOCUMENT_UPLOAD_MAX_BYTES }, { status: 413 });
    }
    const kind = sourceFormat as DocumentContentKind;
    if (!bytesMatchDocumentKind(buffer, kind)) {
        return NextResponse.json({ error: `This file is not a valid ${caps.label}.`, code: "CONTENT_MISMATCH" }, { status: 415 });
    }
    const screened = decideIngestion(buffer, kind);
    if (!screened.store || screened.status !== "uploaded") {
        return NextResponse.json(
            {
                error: "A replacement must pass screening; this file was not stored.",
                code: "SCREENING_REFUSED",
                reason: screened.result.verdict === "clean" ? null : screened.result.reason,
            },
            { status: 415 },
        );
    }

    // D5: the type's replacement policy decides whether a document takes a new version at all, and the new file must be
    // an allowed format. A document whose type was archived keeps its history replaceable (it is not a new filing).
    const { data: typed } = await supabase.from("documents").select("doc_type").eq("org_id", document.orgId).eq("id", document.id).maybeSingle();
    const typeCheck = await checkDocumentTypeForWrite(supabase, document.orgId, {
        docType: (typed as { doc_type?: string | null } | null)?.doc_type ?? null,
        subjectType: documentSubjectTypeForLegacy(document.entityType),
        format: kind,
        mode: "public",
        replacement: true,
    });
    if (!typeCheck.ok) {
        return NextResponse.json({ error: typeCheck.message, code: typeCheck.code, problems: typeCheck.problems }, { status: typeCheck.status === 422 ? 409 : typeCheck.status });
    }

    const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
    const mimeType = CANONICAL_DOCUMENT_MIME[kind];
    const segment = document.entityType && document.entityId ? `${document.entityType}/${document.entityId}` : "pos_intake";
    const storagePath = `${document.orgId}/${segment}/${randomUUID()}-${sanitizeFilename(origName)}`;

    const audit = await recordDocumentAudit({
        orgId: document.orgId,
        actorUserId: ctx.userId,
        event: "document_version_added",
        subject: { type: "documents", id: document.id },
        route: "admin/documents/versions",
        detail: {
            reason,
            checksum_sha256: checksumSha256,
            byte_size: buffer.length,
            mime_type: mimeType,
            screening_engine: screened.screening.engine ?? null,
            ...(effectiveOn || expiresOn ? { effective_on: effectiveOn, expires_on: expiresOn } : {}),
        },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const { error: upErr } = await supabase.storage.from(document.bucket).upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (upErr) {
        console.error("[DOCUMENT_VERSION_STORAGE]", { document_id: document.id });
        const classified = classifySupabaseStorageError(upErr);
        return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.httpStatus });
    }

    const added = await addDocumentVersion(supabase, {
        orgId: document.orgId,
        documentId: document.id,
        bucket: document.bucket,
        storagePath,
        originalFilename: origName !== "replacement" ? origName : null,
        mimeType,
        byteSize: buffer.length,
        checksumSha256,
        reason,
        actorUserId: ctx.userId,
        screening: screened.screening,
        provenance: { route: "admin/documents/versions", audit_event_id: audit.eventId, source_format: sourceFormat },
    });
    if (!added.ok) {
        await supabase.storage.from(document.bucket).remove([storagePath]).catch(() => console.error("[DOCUMENT_VERSION_ROLLBACK]", { document_id: document.id }));
        const status = added.code === "DOCUMENT_UNAVAILABLE" ? 409 : added.code === "NOT_FOUND" ? 404 : 500;
        return NextResponse.json({ ok: false, error: "The new version could not be recorded.", code: added.code }, { status });
    }
    if (typeCheck.policy?.review_required || typeCheck.policy?.validity_policy?.review_on_renewal === true) {
        await markVersionPendingReview(supabase, document.orgId, document.id).catch(() => undefined);
    }
    let validityRecorded: boolean | null = null;
    if (effectiveOn || expiresOn) {
        const v = await setDocumentVersionValidity(supabase, {
            orgId: document.orgId,
            documentId: document.id,
            versionId: added.versionId,
            effectiveOn,
            expiresOn,
            reason: `Renewal: ${reason}`.slice(0, 2000),
            actorUserId: ctx.userId,
        });
        validityRecorded = v.ok;
    }

    return NextResponse.json({
        ok: true,
        document_id: document.id,
        version_id: added.versionId,
        version_number: added.versionNumber,
        supersedes_version_id: added.supersedesVersionId,
        checksum_sha256: checksumSha256,
        validity_recorded: validityRecorded,
    });
}
