/**
 * POST /api/public/forms/[token]/enrollment-signature-asset
 *
 * The participant's DRAWN signature, captured on the signing surface, persisted as a document so
 * the Forms signature evidence (`form_submission_signatures.drawn_asset_document_id`) can reference
 * it — the same shape the operator-side drawn path expects.
 *
 * Same access doctrine as every sibling route: the token resolves the anchored session, and the
 * request selects nothing — the asset is attached to the session's OWN child (the D-95 process
 * anchor's subject), never to a caller-named entity. The body carries image bytes, never a target.
 *
 * Narrow by design: PNG only, magic-bytes verified, 300KB cap. This is a signature mark, not a
 * general upload channel.
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";

const MAX_BYTES = 300 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function decodePng(base64: string): Uint8Array | null {
    let bytes: Buffer;
    try {
        bytes = Buffer.from(base64, "base64");
    } catch {
        return null;
    }
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    if (bytes.length < PNG_MAGIC.length) return null;
    for (let i = 0; i < PNG_MAGIC.length; i++) {
        if (bytes[i] !== PNG_MAGIC[i]) return null;
    }
    return bytes;
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

    let body: { png_base64?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }
    const png = typeof body.png_base64 === "string" ? decodePng(body.png_base64) : null;
    if (!png) return publicErr("A PNG signature image under 300KB is required.", 400, { code: "BAD_IMAGE" });

    // The session's own child — the D-95 anchor's subject — is the only entity this can attach to.
    const { data: pi } = await supabase
        .from("process_instances")
        .select("subject_id, subject_type")
        .eq("org_id", access.value.orgId)
        .eq("id", access.value.processInstanceId)
        .maybeSingle();
    const subjectId = ((pi as { subject_id?: string | null } | null)?.subject_id ?? "").trim();
    if (!subjectId) return publicErr("Journey has no subject to attach the signature to.", 409);

    const bucket = process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || "org_documents";
    const storagePath = `${access.value.orgId}/customer_member/${subjectId}/${randomUUID()}-signature.png`;

    const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, png, { contentType: "image/png", upsert: false });
    if (upErr) return publicErr(classifySupabaseStorageError(upErr).message, 500);

    const { data: docRow, error: insErr } = await supabase
        .from("documents")
        .insert({
            org_id: access.value.orgId,
            entity_type: "customer_member",
            entity_id: subjectId,
            doc_type: "signature_asset",
            title: "Participant signature",
            original_filename: "signature.png",
            mime_type: "image/png",
            byte_size: png.length,
            bucket,
            storage_path: storagePath,
            status: "uploaded",
            metadata: {
                source: "participant_signature_capture_v1",
                packet_session_id: access.value.sessionId,
            },
        })
        .select("id")
        .maybeSingle();
    if (insErr || !docRow) {
        await supabase.storage.from(bucket).remove([storagePath]);
        return publicErr(insErr?.message ?? "Could not store the signature.", 500);
    }

    return publicOk({ document_id: (docRow as { id: string }).id });
}
