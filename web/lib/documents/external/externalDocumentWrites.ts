/**
 * D9.2 — the `/api/v1` document WRITE surface (user-ratified 2026-11-03, Q1–Q8). Upload, file, link, unlink.
 *
 * Every operation reuses the staff command and adds only the application principal's reach:
 *   - an UPLOAD is two named intents. `createDocumentUpload` writes nothing: it answers an opaque, signed, expiring
 *     `upload_id` that binds organization, installation, declared format, size and SHA-256 (no table). Its bytes then
 *     go THROUGH Alloy (`completeDocumentUpload`, Q1) and meet the admin upload's checks in the admin upload's order:
 *     storable format, bytes match the format, D1c-1 structural screening BEFORE storage, audit BEFORE effect, object,
 *     then the `documents` row. The row is unfiled (no subject, no type) and marked `received_via` this installation —
 *     the only principal that may file it (`commitDocumentFilingAsApplication`).
 *   - IDEMPOTENCY (Q4) is required and domain-native: the `Idempotency-Key` names the upload, the upload names the
 *     document id, and the filing key is `ext:<installation>:<key>`. A retry converges on the same row; the same key
 *     over different bytes is 409 `idempotency_conflict`. The object path carries the SHA-256, so different bytes can
 *     never overwrite the winner's object, and identical retries rewrite the same object.
 *   - ABANDONED uploads: no row exists before content arrives. An object whose row insert failed is removed at once; an
 *     object orphaned by a crash between upload and insert is removed by `sweepAbandonedApiUploads` (objects under
 *     `<org>/api_uploads/` older than an hour that no row references).
 *   - LINKS are secondary (`context`) only, on a document the installation can already read, to a subject it can see.
 *     The primary owner — which decides access — is never changed or removed. Nothing is deleted.
 * Signing key: purpose-separated HMAC over an EXISTING platform secret (`DOCUMENT_API_UPLOAD_SECRET`, else the secrets
 * the unsubscribe and destructive-preview tokens already use). No new credential; production refuses without one.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordDocumentAudit, type DocumentAuditInput, type DocumentAuditResult } from "@/lib/documents/documentAudit";
import { bytesMatchDocumentKind, CANONICAL_DOCUMENT_MIME, type DocumentContentKind } from "@/lib/documents/documentContentSignature";
import { decideIngestion } from "@/lib/documents/screenedIngestion";
import { linkDocumentSubject, unlinkDocumentSubject } from "@/lib/documents/documentSubjects";
import { EXTERNAL_DOCUMENT_SUBJECT_TYPES, listExternalDocuments, subjectVisibility, type ExternalDocumentSubjectType } from "@/lib/documents/external/externalDocumentAuthority";
import { commitDocumentFilingAsApplication, type ApplicationFilingContext } from "@/lib/documents/filing/documentFiling";
import type { OperationContext } from "@/lib/platform/external/operationRoute";
import { capabilitiesForFormat, detectProcessingSourceFormat } from "@/lib/pos/processingSourceCapabilities";

/**
 * 4 MiB. The bytes pass through a Vercel function, whose request body is capped at 4.5 MB by the platform; the admin
 * route's 10 MB ceiling is not reachable there either (the largest stored object on the deployed tenant is 4.4 MB).
 */
export const API_DOCUMENT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const API_UPLOAD_TTL_SECONDS = 60 * 60;
export const API_UPLOADS_SEGMENT = "api_uploads";
const BUCKET = "org_documents";
const UNIQUE_VIOLATION = "23505";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,184}$/;

export type WriteContext = ApplicationFilingContext;

/** The write context of one authenticated, scoped, budgeted, boundary-resolved operation. */
export function writeContextFor(ctx: OperationContext): WriteContext {
    return {
        organizationId: ctx.organizationId,
        installationId: ctx.installationId,
        boundaryMode: ctx.boundaryMode,
        siteIds: ctx.siteIds,
        principal: { applicationId: ctx.principal.applicationId, installationId: ctx.installationId, credentialId: ctx.principal.credentialId },
    };
}
export type WriteRefusal = { code: string; message: string; status: 400 | 404 | 409 | 413 | 415 | 422 | 502 | 503 };
export type WriteResult<T> = { ok: true; status: 200 | 201; result: T } | { ok: false; error: WriteRefusal };
type Audit = (input: DocumentAuditInput) => Promise<DocumentAuditResult>;
const refuse = (status: WriteRefusal["status"], code: string, message: string): { ok: false; error: WriteRefusal } => ({ ok: false, error: { status, code, message } });

// ───────────────────────────────────────────────────────────────────────────── idempotency + ids

/** The required `Idempotency-Key` (8–184 visible ASCII characters). */
export function readIdempotencyKey(headers: Headers): string | null {
    const k = headers.get("idempotency-key")?.trim() ?? "";
    return IDEMPOTENCY_KEY.test(k) ? k : null;
}

/** A stable UUID (v5 layout over SHA-256) for a namespaced tuple. */
export function stableUuid(...parts: string[]): string {
    const h = createHash("sha256").update(parts.join("\u0000")).digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString("hex");
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** The filing key an installation's `Idempotency-Key` maps to (within commitDocumentFiling's 8–200 bound). */
export const externalFilingKey = (installationId: string, key: string) => `ext:${installationId}:${key}`;

// ───────────────────────────────────────────────────────────────────────────── signed upload ids

export function uploadSigningSecret(env: NodeJS.ProcessEnv = process.env): string | null {
    const secret = env.DOCUMENT_API_UPLOAD_SECRET?.trim() || env.COMMUNICATION_UNSUBSCRIBE_SECRET?.trim() || env.COMMAND_DESTRUCTIVE_PREVIEW_SECRET?.trim() || env.INTERNAL_CRON_TOKEN?.trim();
    if (secret) return secret;
    return env.NODE_ENV === "production" ? null : "document-api-upload-development-secret";
}

type UploadClaims = { v: 1; u: string; o: string; i: string; k: DocumentContentKind; n: number; s: string; f: string; e: number };
const PURPOSE = "alloy:documents:api-upload:v1";
const mac = (secret: string, payload: string) => createHmac("sha256", secret).update(`${PURPOSE}\u0000${payload}`).digest("base64url");

export function signUploadId(claims: UploadClaims, secret: string): string {
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    return `du1.${payload}.${mac(secret, payload)}`;
}

export function verifyUploadId(token: string, secret: string, nowMs = Date.now()): { ok: true; claims: UploadClaims } | { ok: false; code: "upload_invalid" | "upload_expired" } {
    const m = /^du1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(token ?? ""));
    if (!m) return { ok: false, code: "upload_invalid" };
    const expected = Buffer.from(mac(secret, m[1]));
    const given = Buffer.from(m[2]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, code: "upload_invalid" };
    let claims: UploadClaims;
    try {
        claims = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")) as UploadClaims;
    } catch {
        return { ok: false, code: "upload_invalid" };
    }
    if (claims.v !== 1 || !UUID.test(claims.u) || !SHA256.test(claims.s)) return { ok: false, code: "upload_invalid" };
    if (!(claims.e * 1000 > nowMs)) return { ok: false, code: "upload_expired" };
    return { ok: true, claims };
}

const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";

// ───────────────────────────────────────────────────────────────────────────── createDocumentUpload

export type CreateUploadResult = { upload_id: string; expires_at: string; max_bytes: number; content_url: string };

/** Writes nothing. Declared format and size are refused before any byte is sent. */
export function createDocumentUpload(
    body: Record<string, unknown>,
    ctx: WriteContext,
    key: string | null,
    { env = process.env, nowMs = Date.now() }: { env?: NodeJS.ProcessEnv; nowMs?: number } = {},
): WriteResult<CreateUploadResult> {
    if (!key) return refuse(400, "idempotency_key_required", "An Idempotency-Key header (8–184 visible characters) is required.");
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    const mime = typeof body.mime_type === "string" ? body.mime_type.trim() : "";
    const size = body.byte_size;
    const sha = typeof body.sha256 === "string" ? body.sha256.trim().toLowerCase() : "";
    if (!filename || filename.length > 255) return refuse(400, "invalid_request", "filename is required (at most 255 characters).");
    if (typeof size !== "number" || !Number.isInteger(size) || size < 1) return refuse(400, "invalid_request", "byte_size must be a positive integer.");
    if (!SHA256.test(sha)) return refuse(400, "invalid_request", "sha256 must be 64 lowercase hexadecimal characters.");
    if (size > API_DOCUMENT_UPLOAD_MAX_BYTES) return refuse(413, "FILE_TOO_LARGE", `Files must be ${API_DOCUMENT_UPLOAD_MAX_BYTES} bytes or smaller.`);
    const format = detectProcessingSourceFormat(filename, mime);
    if (!capabilitiesForFormat(format).store) return refuse(415, "UNSUPPORTED_FORMAT", "This file format cannot be stored.");
    const secret = uploadSigningSecret(env);
    if (!secret) return refuse(503, "upload_unavailable", "Uploads are not available.");
    const uploadUuid = stableUuid("alloy:documents:api-upload", ctx.organizationId, ctx.installationId, key);
    const exp = Math.floor(nowMs / 1000) + API_UPLOAD_TTL_SECONDS;
    const token = signUploadId({ v: 1, u: uploadUuid, o: ctx.organizationId, i: ctx.installationId, k: format as DocumentContentKind, n: size, s: sha, f: filename, e: exp }, secret);
    return { ok: true, status: 201, result: { upload_id: token, expires_at: new Date(exp * 1000).toISOString(), max_bytes: API_DOCUMENT_UPLOAD_MAX_BYTES, content_url: "/api/v1/document-uploads/content" } };
}

// ───────────────────────────────────────────────────────────────────────────── completeDocumentUpload

export type CompleteUploadResult = { document_id: string; status: "received" | "quarantined"; replay: boolean };

/** The document id an upload resolves to — the same for every retry of the same upload. */
export const uploadDocumentId = (uploadUuid: string) => stableUuid("alloy:documents:api-upload-document", uploadUuid);

export async function completeDocumentUpload(
    supabase: SupabaseClient,
    ctx: WriteContext,
    uploadIdToken: string | null,
    bytes: Uint8Array,
    { env = process.env, nowMs = Date.now(), audit = recordDocumentAudit }: { env?: NodeJS.ProcessEnv; nowMs?: number; audit?: Audit } = {},
): Promise<WriteResult<CompleteUploadResult>> {
    const secret = uploadSigningSecret(env);
    if (!secret) return refuse(503, "upload_unavailable", "Uploads are not available.");
    const v = verifyUploadId(uploadIdToken ?? "", secret, nowMs);
    if (!v.ok) return v.code === "upload_expired" ? refuse(409, "upload_expired", "This upload has expired; create a new one.") : refuse(404, "NOT_FOUND", "Not found.");
    const c = v.claims;
    // An upload belongs to the installation that created it; any other caller is told nothing.
    if (c.o !== ctx.organizationId || c.i !== ctx.installationId) return refuse(404, "NOT_FOUND", "Not found.");
    if (bytes.byteLength > API_DOCUMENT_UPLOAD_MAX_BYTES) return refuse(413, "FILE_TOO_LARGE", `Files must be ${API_DOCUMENT_UPLOAD_MAX_BYTES} bytes or smaller.`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== c.n || sha !== c.s) return refuse(422, "checksum_mismatch", "The bytes do not match the declared size and SHA-256.");

    const documentId = uploadDocumentId(c.u);
    const existing = await readUploadRow(supabase, ctx.organizationId, documentId);
    if (existing === "error") return refuse(503, "upload_unavailable", "The upload could not be completed.");
    if (existing) {
        return existing.checksum_sha256 === sha
            ? { ok: true, status: 200, result: { document_id: documentId, status: existing.status === "quarantined" ? "quarantined" : "received", replay: true } }
            : refuse(409, "idempotency_conflict", "This Idempotency-Key was already used for different content.");
    }

    if (!bytesMatchDocumentKind(Buffer.from(bytes), c.k)) return refuse(415, "CONTENT_MISMATCH", "The file is not the format it declares.");
    const screened = decideIngestion(bytes, c.k, new Date(nowMs));
    if (!screened.store) return refuse(415, "SCREENING_REFUSED", screened.message);
    const storedMime = CANONICAL_DOCUMENT_MIME[c.k];
    const storagePath = `${ctx.organizationId}/${API_UPLOADS_SEGMENT}/${documentId}/${sha}`;

    const recorded = await audit({
        orgId: ctx.organizationId,
        actorUserId: null,
        actorPrincipal: { kind: "application", ...ctx.principal },
        event: "document_upload_authorized",
        subject: { type: "documents", id: documentId },
        route: "api/v1/document-uploads/content",
        detail: { byte_size: bytes.byteLength, screening_status: screened.status, source_format: c.k },
    });
    if (!recorded.ok) return refuse(503, "AUDIT_UNAVAILABLE", "The upload could not be recorded, so it was not performed.");

    // Same path for the same bytes: an identical retry after a crash rewrites the same object, never a second one.
    const up = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: storedMime, upsert: true });
    if (up.error) return refuse(502, "STORAGE_UNAVAILABLE", "The file could not be stored.");

    const { error } = await supabase
        .from("documents")
        .insert({
            id: documentId,
            org_id: ctx.organizationId,
            title: c.f,
            original_filename: c.f,
            mime_type: storedMime,
            byte_size: bytes.byteLength,
            checksum_sha256: sha,
            bucket: BUCKET,
            storage_path: storagePath,
            status: screened.status,
            metadata: {
                screening: screened.screening,
                source_format: c.k,
                source: "api_v1_upload",
                received_via: { kind: "api_v1", installation_id: ctx.installationId, application_id: ctx.principal.applicationId, credential_id: ctx.principal.credentialId },
                upload_audit_event_id: recorded.eventId,
            },
        })
        .select("id")
        .maybeSingle();
    if (error) {
        if (error.code === UNIQUE_VIOLATION) {
            // A concurrent identical completion won. Its row names the same path, so the object stays.
            const winner = await readUploadRow(supabase, ctx.organizationId, documentId);
            if (winner && winner !== "error" && winner.checksum_sha256 === sha) {
                return { ok: true, status: 200, result: { document_id: documentId, status: winner.status === "quarantined" ? "quarantined" : "received", replay: true } };
            }
        }
        // No row references this object: remove it now (the sweep is only for a crash between the two steps).
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
        return refuse(503, "upload_unavailable", "The upload could not be completed.");
    }
    return { ok: true, status: 201, result: { document_id: documentId, status: screened.status === "quarantined" ? "quarantined" : "received", replay: false } };
}

async function readUploadRow(supabase: SupabaseClient, orgId: string, id: string): Promise<{ checksum_sha256: string | null; status: string | null } | null | "error"> {
    const { data, error } = await supabase.from("documents").select("id, checksum_sha256, status").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error) return "error";
    return (data as { checksum_sha256: string | null; status: string | null } | null) ?? null;
}

// ───────────────────────────────────────────────────────────────────────────── secondary links

export type LinkResult = { document_id: string; subject_type: ExternalDocumentSubjectType; subject_id: string; linked: boolean };

function parseSubjectBody(body: Record<string, unknown>): { documentId: string; type: ExternalDocumentSubjectType; id: string } | null {
    const documentId = typeof body.document_id === "string" ? body.document_id : "";
    const type = body.subject_type;
    const id = typeof body.subject_id === "string" ? body.subject_id : "";
    if (!UUID.test(documentId) || !UUID.test(id) || !(EXTERNAL_DOCUMENT_SUBJECT_TYPES as readonly unknown[]).includes(type)) return null;
    return { documentId, type: type as ExternalDocumentSubjectType, id };
}

async function linkPreconditions(supabase: SupabaseClient, ctx: WriteContext, p: { documentId: string; type: ExternalDocumentSubjectType; id: string }) {
    const boundary = { organizationId: ctx.organizationId, installationId: ctx.installationId, boundaryMode: ctx.boundaryMode, siteIds: [...ctx.siteIds] };
    const visible = await listExternalDocuments(supabase, boundary, { documentId: p.documentId }, { limit: 1, cursorSort: null, cursorId: null, updatedSince: null });
    if (!visible.ok || !visible.rows.some((r) => r.id === p.documentId)) return refuse(404, "NOT_FOUND", "Not found.");
    if (!(await subjectVisibility(supabase, boundary).isVisible({ type: p.type, id: p.id }))) return refuse(404, "NOT_FOUND", "Not found.");
    const { data, error } = await supabase
        .from("document_subjects")
        .select("subject_type, subject_id, is_primary")
        .eq("org_id", ctx.organizationId)
        .eq("document_id", p.documentId)
        .eq("is_primary", true)
        .is("ended_at", null);
    if (error) return refuse(503, "link_unavailable", "The link could not be changed.");
    const primary = (data ?? []) as Array<{ subject_type: string; subject_id: string }>;
    if (primary.some((s) => s.subject_type === p.type && s.subject_id === p.id)) {
        return refuse(409, "primary_subject_immutable", "The document's owner cannot be linked or unlinked through the API.");
    }
    return null;
}

export async function changeDocumentSubjectLink(
    supabase: SupabaseClient,
    ctx: WriteContext,
    body: Record<string, unknown>,
    op: "link" | "unlink",
    key: string | null,
    { audit = recordDocumentAudit }: { audit?: Audit } = {},
): Promise<WriteResult<LinkResult>> {
    if (!key) return refuse(400, "idempotency_key_required", "An Idempotency-Key header (8–184 visible characters) is required.");
    const p = parseSubjectBody(body);
    if (!p) return refuse(400, "invalid_request", "document_id, subject_type (child | household | person) and subject_id are required.");
    const blocked = await linkPreconditions(supabase, ctx, p);
    if (blocked) return blocked;
    const recorded = await audit({
        orgId: ctx.organizationId,
        actorUserId: null,
        actorPrincipal: { kind: "application", ...ctx.principal },
        event: "document_subject_changed",
        subject: { type: "documents", id: p.documentId },
        route: op === "link" ? "api/v1/document-subjects" : "api/v1/document-subjects/unlink",
        detail: { change: op, association: "context", subject_type: p.type, subject_id: p.id, idempotency_key_sha256: createHash("sha256").update(key).digest("hex") },
    });
    if (!recorded.ok) return refuse(503, "AUDIT_UNAVAILABLE", "The change could not be recorded, so it was not performed.");
    const r =
        op === "link"
            ? await linkDocumentSubject(supabase, { orgId: ctx.organizationId, documentId: p.documentId, subjectType: p.type, subjectId: p.id, association: "context", actorUserId: null })
            : await unlinkDocumentSubject(supabase, { orgId: ctx.organizationId, documentId: p.documentId, subjectType: p.type, subjectId: p.id, actorUserId: null });
    if (!r.ok) {
        if (r.code === "NOT_FOUND" || r.code === "SUBJECT_NOT_IN_ORG") return refuse(404, "NOT_FOUND", "Not found.");
        if (r.code === "PRIMARY_REQUIRED") return refuse(409, "primary_subject_immutable", "The document's owner cannot be unlinked through the API.");
        return refuse(503, "link_unavailable", "The link could not be changed.");
    }
    return { ok: true, status: 200, result: { document_id: p.documentId, subject_type: p.type, subject_id: p.id, linked: op === "link" } };
}

// ───────────────────────────────────────────────────────────────────────────── abandoned-upload sweep

/**
 * Removes objects under `<org>/api_uploads/` older than `olderThanMs` that no `documents` row references — the object
 * a crash left between upload and row insert. Never touches a referenced object, another prefix or another org.
 */
export async function sweepAbandonedApiUploads(
    supabase: SupabaseClient,
    orgId: string,
    { nowMs = Date.now(), olderThanMs = API_UPLOAD_TTL_SECONDS * 1000, limit = 200 }: { nowMs?: number; olderThanMs?: number; limit?: number } = {},
): Promise<{ ok: true; removed: string[] } | { ok: false; error: string }> {
    if (!UUID.test(orgId)) return { ok: false, error: "invalid_org" };
    const root = `${orgId}/${API_UPLOADS_SEGMENT}`;
    const { data: folders, error } = await supabase.storage.from(BUCKET).list(root, { limit });
    if (error) return { ok: false, error: "list_failed" };
    const stale: string[] = [];
    for (const folder of (folders ?? []) as Array<{ name: string }>) {
        if (!UUID.test(folder.name)) continue;
        const { data: files } = await supabase.storage.from(BUCKET).list(`${root}/${folder.name}`, { limit: 20 });
        for (const f of (files ?? []) as Array<{ name: string; created_at?: string | null; updated_at?: string | null }>) {
            if (!SHA256.test(f.name)) continue;
            const at = Date.parse(String(f.updated_at ?? f.created_at ?? ""));
            if (!Number.isFinite(at) || nowMs - at < olderThanMs) continue;
            stale.push(`${root}/${folder.name}/${f.name}`);
        }
    }
    if (!stale.length) return { ok: true, removed: [] };
    const { data: refs, error: refErr } = await supabase.from("documents").select("storage_path").eq("org_id", orgId).in("storage_path", stale);
    if (refErr) return { ok: false, error: "reference_check_failed" };
    const referenced = new Set(((refs ?? []) as Array<{ storage_path: string }>).map((r) => r.storage_path));
    const orphans = stale.filter((p) => !referenced.has(p));
    if (!orphans.length) return { ok: true, removed: [] };
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(orphans);
    if (rmErr) return { ok: false, error: "remove_failed" };
    return { ok: true, removed: orphans };
}

// ───────────────────────────────────────────────────────────────────────────── fileDocument

export type FileDocumentResult = { document_id: string; filed_document_id: string; mode: "new_document" | "new_version"; doc_type: string | null; replay: boolean };

const FILING_STATUSES = new Set([400, 404, 409, 413, 415, 422, 502, 503]);

/**
 * Body: `{ document_id, mode?: "new_document" | "new_version", type_key, primary: { subject_type, subject_id },
 * contexts?: [...], target_document_id? }`. The filing key is `ext:<installation>:<Idempotency-Key>`.
 */
export async function fileDocumentAsApplication(
    supabase: SupabaseClient,
    ctx: WriteContext,
    body: Record<string, unknown>,
    key: string | null,
): Promise<WriteResult<FileDocumentResult>> {
    if (!key) return refuse(400, "idempotency_key_required", "An Idempotency-Key header (8–184 visible characters) is required.");
    const documentId = typeof body.document_id === "string" ? body.document_id : "";
    if (!UUID.test(documentId)) return refuse(400, "invalid_request", "document_id is required.");
    const mode = body.mode === undefined ? "new_document" : body.mode;
    if (mode !== "new_document" && mode !== "new_version") return refuse(400, "invalid_request", "mode must be new_document or new_version.");
    const ref = (v: unknown) => {
        const o = v as { subject_type?: unknown; subject_id?: unknown } | null;
        return o && typeof o === "object" && typeof o.subject_type === "string" && typeof o.subject_id === "string"
            ? { subject_type: o.subject_type, subject_id: o.subject_id }
            : null;
    };
    const contextsRaw = body.contexts === undefined ? [] : body.contexts;
    if (!Array.isArray(contextsRaw) || contextsRaw.length > 10) return refuse(400, "invalid_request", "contexts must be a list of at most 10 subjects.");
    const contexts = contextsRaw.map(ref);
    if (contexts.some((c) => c === null)) return refuse(400, "invalid_request", "Each context needs subject_type and subject_id.");
    const r = await commitDocumentFilingAsApplication(
        supabase,
        ctx,
        {
            documentId,
            mode,
            docType: typeof body.type_key === "string" ? body.type_key : null,
            primary: ref(body.primary) as never,
            contexts: contexts as never,
            targetDocumentId: typeof body.target_document_id === "string" ? body.target_document_id : null,
            reviewAccepted: false,
            filingKey: externalFilingKey(ctx.installationId, key),
        },
        "api/v1/document-filings",
    );
    if (!r.ok) {
        const status = (FILING_STATUSES.has(r.status) ? r.status : 422) as WriteRefusal["status"];
        return refuse(status, r.code, r.message);
    }
    return {
        ok: true,
        status: r.result.replay ? 200 : 201,
        result: { document_id: r.result.document_id, filed_document_id: r.result.filed_document_id, mode: r.result.mode, doc_type: r.result.doc_type, replay: r.result.replay },
    };
}

/**
 * The scheduled-work backstop: sweep every organization in which an installation holds `documents.write` (the only
 * principals that can create `api_uploads` objects). Bounded per wake; one organization's failure never stops the rest.
 */
export async function sweepAbandonedApiUploadsAcrossOrgs(
    supabase: SupabaseClient,
    { maxOrgs = 25, nowMs = Date.now() }: { maxOrgs?: number; nowMs?: number } = {},
): Promise<{ orgs: number; removed: number; failed: number }> {
    const { data, error } = await supabase.from("app_installations").select("org_id").contains("granted_scopes", ["documents.write"]);
    if (error) return { orgs: 0, removed: 0, failed: 1 };
    const orgs = [...new Set(((data ?? []) as Array<{ org_id: string }>).map((r) => r.org_id))].filter((o) => UUID.test(o)).sort().slice(0, maxOrgs);
    let removed = 0;
    let failed = 0;
    for (const org of orgs) {
        const r = await sweepAbandonedApiUploads(supabase, org, { nowMs }).catch(() => ({ ok: false as const, error: "threw" }));
        if (r.ok) removed += r.removed.length;
        else failed += 1;
    }
    return { orgs: orgs.length, removed, failed };
}
