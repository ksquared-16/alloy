/**
 * D2 — immutable document versions. A document's FILE is a version; the document is the logical record around it.
 *
 * `document_versions` (migration 20261208090000) holds bucket, path, sha256, size, MIME and provenance, and the database
 * refuses to change any of them: only review and expiration metadata may move. `documents.current_version_id` names the
 * current file, and the legacy file columns on `documents` are its projection. A replacement adds version n+1 that
 * supersedes the current one with a written reason; the previous version stays and stays retrievable, under the same
 * authorization as the document. A version goes only with its document (the audited delete) or through the governed
 * purge — never on an ordinary update.
 *
 * Every write goes through the governed functions (`document_add_version`, `document_set_version_review`); creation of
 * the first version is the database's own insert trigger, so every writer — old and new — produces one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** What a caller may see about a version. Never the storage path: the path is not disclosed outside the signer. */
export type DocumentVersionView = {
    id: string;
    version_number: number;
    is_current: boolean;
    mime_type: string | null;
    byte_size: number | null;
    checksum_sha256: string | null;
    source: string | null;
    created_at: string;
    created_by: string | null;
    supersedes_version_id: string | null;
    replacement_reason: string | null;
    review_status: string | null;
    reviewed_at: string | null;
    effective_on: string | null;
    expires_on: string | null;
};

const VERSION_VIEW_COLUMNS =
    "id, version_number, mime_type, byte_size, checksum_sha256, source, created_at, created_by, supersedes_version_id, replacement_reason, review_status, reviewed_at, effective_on, expires_on";

export async function listDocumentVersions(
    supabase: SupabaseClient,
    orgId: string,
    documentId: string,
): Promise<{ ok: true; versions: DocumentVersionView[] } | { ok: false; error: string }> {
    const [{ data: doc, error: docErr }, { data, error }] = await Promise.all([
        supabase.from("documents").select("current_version_id").eq("org_id", orgId).eq("id", documentId).maybeSingle(),
        supabase
            .from("document_versions")
            .select(VERSION_VIEW_COLUMNS)
            .eq("org_id", orgId)
            .eq("document_id", documentId)
            .order("version_number", { ascending: false }),
    ]);
    if (docErr || error) return { ok: false, error: (docErr ?? error)?.message ?? "unknown error" };
    const current = (doc as { current_version_id?: string | null } | null)?.current_version_id ?? null;
    // Picked field by field, so a location can never ride along whatever a select returns.
    const versions = ((data ?? []) as Array<Record<string, unknown>>).map(
        (v): DocumentVersionView => ({
            id: String(v.id),
            version_number: Number(v.version_number),
            is_current: v.id === current,
            mime_type: (v.mime_type as string | null) ?? null,
            byte_size: (v.byte_size as number | null) ?? null,
            checksum_sha256: (v.checksum_sha256 as string | null) ?? null,
            source: (v.source as string | null) ?? null,
            created_at: String(v.created_at),
            created_by: (v.created_by as string | null) ?? null,
            supersedes_version_id: (v.supersedes_version_id as string | null) ?? null,
            replacement_reason: (v.replacement_reason as string | null) ?? null,
            review_status: (v.review_status as string | null) ?? null,
            reviewed_at: (v.reviewed_at as string | null) ?? null,
            effective_on: (v.effective_on as string | null) ?? null,
            expires_on: (v.expires_on as string | null) ?? null,
        }),
    );
    return { ok: true, versions };
}

/** The stored location of one version of one document, for the signer only. Org- and document-bound. */
export async function loadDocumentVersionLocation(
    supabase: SupabaseClient,
    orgId: string,
    documentId: string,
    versionId: string,
): Promise<{ ok: true; version: { id: string; version_number: number; bucket: string; storagePath: string } } | { ok: false; notFound: boolean; error?: string }> {
    const { data, error } = await supabase
        .from("document_versions")
        .select("id, version_number, bucket, storage_path")
        .eq("org_id", orgId)
        .eq("document_id", documentId)
        .eq("id", versionId)
        .maybeSingle();
    if (error) return { ok: false, notFound: false, error: error.message };
    const row = data as { id: string; version_number: number; bucket: string | null; storage_path: string | null } | null;
    if (!row || !row.bucket || !row.storage_path) return { ok: false, notFound: true };
    return { ok: true, version: { id: row.id, version_number: row.version_number, bucket: row.bucket, storagePath: row.storage_path } };
}

export type AddVersionInput = {
    orgId: string;
    documentId: string;
    bucket: string;
    storagePath: string;
    originalFilename: string | null;
    mimeType: string;
    byteSize: number;
    checksumSha256: string;
    reason: string;
    actorUserId: string;
    screening: Record<string, unknown>;
    provenance: Record<string, unknown>;
};

export async function addDocumentVersion(
    supabase: SupabaseClient,
    input: AddVersionInput,
): Promise<{ ok: true; versionId: string; versionNumber: number; supersedesVersionId: string } | { ok: false; code: string; error: string }> {
    const { data, error } = await supabase.rpc("document_add_version", {
        p_org_id: input.orgId,
        p_document_id: input.documentId,
        p_bucket: input.bucket,
        p_storage_path: input.storagePath,
        p_original_filename: input.originalFilename,
        p_mime_type: input.mimeType,
        p_byte_size: input.byteSize,
        p_checksum_sha256: input.checksumSha256,
        p_reason: input.reason,
        p_actor: input.actorUserId,
        p_screening: input.screening,
        p_provenance: input.provenance,
    });
    if (error) {
        const message = error.message ?? "unknown error";
        const code = /document_unavailable/.test(message)
            ? "DOCUMENT_UNAVAILABLE"
            : /document_not_found/.test(message)
              ? "NOT_FOUND"
              : /document_without_version/.test(message)
                ? "NO_CURRENT_VERSION"
                : "VERSION_ADD_FAILED";
        return { ok: false, code, error: message };
    }
    const r = (data ?? {}) as { version_id?: string; version_number?: number; supersedes_version_id?: string };
    if (!r.version_id || typeof r.version_number !== "number" || !r.supersedes_version_id) {
        return { ok: false, code: "VERSION_ADD_FAILED", error: "the database returned no version" };
    }
    return { ok: true, versionId: r.version_id, versionNumber: r.version_number, supersedesVersionId: r.supersedes_version_id };
}

/** Every stored object of the given documents: each version's file and the row's own (the same object, or a legacy one). */
export async function documentStoredObjects(
    supabase: SupabaseClient,
    orgId: string,
    documentIds: readonly string[],
): Promise<{ ok: true; objects: Array<{ documentId: string; bucket: string; storagePath: string }> } | { ok: false; error: string }> {
    if (documentIds.length === 0) return { ok: true, objects: [] };
    const ids = [...new Set(documentIds)];
    const [{ data: docs, error: docErr }, { data: versions, error: verErr }] = await Promise.all([
        supabase.from("documents").select("id, bucket, storage_path").eq("org_id", orgId).in("id", ids),
        supabase.from("document_versions").select("document_id, bucket, storage_path").eq("org_id", orgId).in("document_id", ids),
    ]);
    if (docErr || verErr) return { ok: false, error: (docErr ?? verErr)?.message ?? "unknown error" };
    const seen = new Set<string>();
    const objects: Array<{ documentId: string; bucket: string; storagePath: string }> = [];
    const add = (documentId: string, bucket: string | null, storagePath: string | null) => {
        if (!bucket || !storagePath) return;
        const key = `${bucket}\u0000${storagePath}`;
        if (seen.has(key)) return;
        seen.add(key);
        objects.push({ documentId, bucket, storagePath });
    };
    for (const d of (docs ?? []) as Array<{ id: string; bucket: string | null; storage_path: string | null }>) add(d.id, d.bucket, d.storage_path);
    for (const v of (versions ?? []) as Array<{ document_id: string; bucket: string | null; storage_path: string | null }>) {
        add(v.document_id, v.bucket, v.storage_path);
    }
    return { ok: true, objects };
}
