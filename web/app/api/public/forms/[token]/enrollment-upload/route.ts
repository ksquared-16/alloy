/**
 * POST /api/public/forms/[token]/enrollment-upload
 *
 * A document the PARTICIPANT was asked to attach — their child's immunization record, the vaccine
 * module certificate — persisted as a canonical Document so the artifact's `file_ref` destination
 * can reference it by id, which is exactly what `validateSubmission` expects there.
 *
 * ## Why this route exists
 *
 * The Forms engine's `file_ref` control is a placeholder that renders "File upload ships with
 * documents integration". So three certified upload responsibilities on the enrollment packet — one
 * on the Oregon CIS, two on the Nonmedical Exemption — were REQUIRED, never presented to anyone,
 * and refused the submission at the end with "Required field missing". A parent could complete and
 * sign their paperwork and still be unable to finish it.
 *
 * ## Access doctrine — the same as every sibling route
 *
 * The token resolves the anchored session; the REQUEST SELECTS NOTHING. The caller names a field id
 * and the server reads the session's own pinned schema to decide whether that field is an upload
 * destination and what kind of document belongs there. A caller cannot name the entity, the
 * doc_type, or the artifact: those all come from the session. This is not an authentication bypass
 * and grants no operator capability.
 *
 * Narrow by design: PDF, PNG and JPEG, magic-bytes verified, 10MB cap.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import {
    resolveParticipantEnrollmentFromToken,
    resolveParticipantSubjectCustomerMemberId,
} from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { resolveParticipantUploadDestination } from "@/lib/enrollment/participantRuntime/resolveParticipantUploadDestination";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";

const MAX_BYTES = 10 * 1024 * 1024;

/** What a browser may hand us, recognised by its BYTES rather than by what the caller called it. */
const ACCEPTED = [
    { mime: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
    { mime: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { mime: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
] as const;

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function sniff(bytes: Buffer): (typeof ACCEPTED)[number] | null {
    for (const kind of ACCEPTED) {
        if (bytes.length < kind.magic.length) continue;
        if (kind.magic.every((b, i) => bytes[i] === b)) return kind;
    }
    return null;
}

/** A filename fit to store: the parent's own words, stripped of anything that is not a name. */
function safeFilename(raw: unknown, ext: string): string {
    const base = typeof raw === "string" ? raw.replace(/\.[A-Za-z0-9]+$/, "").replace(/[^\w. -]+/g, "").trim() : "";
    return `${(base || "upload").slice(0, 80)}.${ext}`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return publicErr("Server misconfiguration", 500);

    const { token: rawToken } = await params;
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(rawToken ?? ""));
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }

    let body: { field_id?: unknown; file_base64?: unknown; filename?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }
    const fieldId = typeof body.field_id === "string" ? body.field_id.trim() : "";
    if (!fieldId) return publicErr("Which attachment this is must be named.", 400, { code: "NO_FIELD" });

    let bytes: Buffer;
    try {
        bytes = Buffer.from(typeof body.file_base64 === "string" ? body.file_base64 : "", "base64");
    } catch {
        return publicErr("The file could not be read.", 400, { code: "BAD_FILE" });
    }
    if (bytes.length === 0) return publicErr("The file was empty.", 400, { code: "BAD_FILE" });
    if (bytes.length > MAX_BYTES) return publicErr("Please attach a file under 10MB.", 400, { code: "TOO_LARGE" });
    const kind = sniff(bytes);
    if (!kind) return publicErr("Please attach a PDF, PNG or JPEG.", 400, { code: "BAD_TYPE" });

    /*
     * The ARTIFACT decides what this attachment is — not the caller.
     *
     * Searched across every artifact THIS SESSION realized, not just the active one. Required
     * evidence is now collected before any paperwork is prepared, so the parent is asked for all of
     * it at once while only one artifact is active; resolving against the active one alone refused
     * the Exemption's two attachments with "That is not an attachment on this document". The
     * authority boundary is unchanged: the caller names a field id and nothing else, and everything
     * about the destination still comes from a pinned schema this session owns.
     */
    const resolved = await resolveParticipantUploadDestination(supabase, {
        orgId: access.value.orgId,
        sessionId: access.value.sessionId,
        fieldId,
    });
    if (!resolved) {
        return publicErr("That is not an attachment on this enrollment.", 400, { code: "NOT_AN_UPLOAD" });
    }
    const destination = resolved.request;
    const artifact = { formDefinitionId: resolved.formDefinitionId, versionId: resolved.versionId };

    // The session's own child. A Business Process journey names it on the process instance;
    // a manually launched packet names it in its CRM snapshot. Either way it is the child.
    const subjectId = await resolveParticipantSubjectCustomerMemberId(supabase, access.value);
    if (!subjectId) return publicErr("This packet has no child to attach the document to.", 409);

    const bucket = process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || "org_documents";
    const filename = safeFilename(body.filename, kind.ext);
    const storagePath = `${access.value.orgId}/customer_member/${subjectId}/${randomUUID()}-${filename}`;

    const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, bytes, { contentType: kind.mime, upsert: false });
    if (upErr) return publicErr(classifySupabaseStorageError(upErr).message, 500);

    const { data: docRow, error: insErr } = await supabase
        .from("documents")
        .insert({
            org_id: access.value.orgId,
            entity_type: "customer_member",
            entity_id: subjectId,
            doc_type: destination.docType,
            title: destination.title,
            original_filename: filename,
            mime_type: kind.mime,
            byte_size: bytes.length,
            bucket,
            storage_path: storagePath,
            status: "uploaded",
            metadata: {
                source: "participant_upload_v1",
                packet_session_id: access.value.sessionId,
                /* Which obligation this satisfies — the association a reviewer needs. */
                form_definition_id: artifact.formDefinitionId,
                form_definition_version_id: artifact.versionId,
                field_id: fieldId,
            },
        })
        .select("id")
        .maybeSingle();
    if (insErr || !docRow) {
        await supabase.storage.from(bucket).remove([storagePath]);
        return publicErr(insErr?.message ?? "Could not store the document.", 500);
    }

    return publicOk({ document_id: (docRow as { id: string }).id, filename, byte_size: bytes.length });
}

/**
 * GET ?document_id=… — hand a participant back the file they just attached.
 *
 * A parent could attach an immunization record, see only its filename, and have no way to check
 * they had picked the right photo before committing to it. "Replace" without "look" asks them to
 * correct a mistake they cannot see.
 *
 * Ownership is proved from the DOCUMENT, not from the request: the file must carry this session's
 * id in the metadata the upload wrote. A token grants sight of that session's own attachments and
 * nothing else — not another session's, not another family's, not an arbitrary org document whose
 * id someone guessed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return publicErr("Server misconfiguration", 500);

    const { token: rawToken } = await params;
    const documentId = request.nextUrl.searchParams.get("document_id")?.trim() ?? "";
    if (!documentId) return publicErr("document_id is required", 400);

    const supabase = createServiceRoleClient();
    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(rawToken ?? ""));
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }

    const { data: doc } = await supabase
        .from("documents")
        .select("id, org_id, bucket, storage_path, mime_type, original_filename, metadata")
        .eq("id", documentId)
        .eq("org_id", access.value.orgId)
        .maybeSingle();
    const row = doc as {
        bucket?: string | null;
        storage_path?: string | null;
        mime_type?: string | null;
        original_filename?: string | null;
        metadata?: { packet_session_id?: string } | null;
    } | null;

    // The document must belong to THIS session. Anything else is not this participant's to see.
    if (!row || String(row.metadata?.packet_session_id ?? "") !== access.value.sessionId) {
        return publicErr("That attachment is not part of this packet.", 404, { code: "NOT_FOUND" });
    }

    const bucket = row.bucket?.trim() || process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || "org_documents";
    const path = row.storage_path?.trim() ?? "";
    if (!path) return publicErr("That attachment is no longer available.", 404, { code: "NOT_FOUND" });

    const { data: blob, error } = await supabase.storage.from(bucket).download(path);
    if (error || !blob) return publicErr("That attachment is no longer available.", 404, { code: "NOT_FOUND" });

    const bytes = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(bytes, {
        status: 200,
        headers: {
            "Content-Type": row.mime_type?.trim() || "application/octet-stream",
            // Inline so it opens in a viewer rather than downloading — the parent is CHECKING it.
            "Content-Disposition": `inline; filename="${(row.original_filename ?? "attachment").replace(/"/g, "")}"`,
            "Cache-Control": "private, no-store",
        },
    });
}
