/**
 * D10 — the WS11 attachment storage boundary, implemented over the EXISTING document storage sequence (the admin upload
 * route): audit first, object under `<org>/pos_intake/`, one `documents` row whose D2 insert trigger writes version 1.
 * Storage needs no new table, bucket or framework; the message link below is the one addition, and it is opt-in.
 *
 * IDEMPOTENCY WITHOUT A NEW TABLE. The document id is derived from (organization, Communications message id, provider
 * attachment id). The same attachment is therefore always the same `documents` primary key: `findStored` is a primary-key
 * read, and two concurrent deliveries collide on that key — the loser removes ONLY the object it uploaded itself (never a
 * row, never the winner's object) and returns the winner's document.
 *
 * THE MESSAGE LINK (`linkAttachments`, migration 20261218090000). With it on, `store` also records the
 * `communication_message_attachments` row (message, document, provider attachment id) — on a fresh store AND when the
 * document already exists, so a crash between the two writes heals on the next delivery — and `findStored` reports a
 * document only once its link exists, which is what sends that next delivery back through `store`. The link converges on
 * its own UNIQUE (message_id, provider_attachment_id): a concurrent writer's row is success, not failure. Off (the
 * default, and production until the migration is applied and retrieval is enabled), nothing here reads or writes it.
 *
 * RETRIEVAL. Bytes come only through `fetchContent`, a port Communications implements under the ORGANIZATION'S
 * credential (`resolveInboundRetrievalCredential` from the message's provider binding — never the environment, never a
 * key passed through here). The repository holds no attachment-content contract for the provider; none is invented.
 * Without a fetcher this boundary reports `available: false` and the pipeline holds every attachment before any read.
 * Only an attachment the persisted message itself lists, on an inbound message of THIS organization, is ever fetched.
 */
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordDocumentAudit, type DocumentAuditInput, type DocumentAuditResult } from "@/lib/documents/documentAudit";
import { processingIntentMetadata } from "@/lib/pos/processingImportIntent";
import type { AttachmentStorageBoundary, StoredAttachment } from "@/lib/documents/inbound/inboundAttachmentFiling";

export const INBOUND_ATTACHMENT_BUCKET = "org_documents";
const AUDIT_ROUTE = "communications/inbound/email-attachment";
const UNIQUE_VIOLATION = "23505";
const MESSAGE_ATTACHMENTS_TABLE = "communication_message_attachments";

/** Result model of Communications' received-email fetcher: retryable vs permanent, never an exception. */
export type AttachmentContentResult =
    | { ok: true; bytes: Uint8Array }
    | { ok: false; retryable: boolean; reason: string };

/** Communications-owned. Resolves the credential from `providerBindingId` itself. */
export type AttachmentContentFetcher = (args: {
    orgId: string;
    providerMessageId: string;
    providerBindingId: string | null;
    attachmentId: string;
}) => Promise<AttachmentContentResult>;

/** The stable document id of one attachment of one message in one organization (UUID v5 layout over SHA-256). */
export function inboundAttachmentDocumentId(orgId: string, messageId: string, attachmentId: string): string {
    const h = createHash("sha256").update(`alloy:documents:email_attachment:v1\u0000${orgId}\u0000${messageId}\u0000${attachmentId}`).digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString("hex");
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

type DocRow = { id: string; org_id: string; status: string | null; current_version_id: string | null; checksum_sha256: string | null };

function toStored(row: DocRow): StoredAttachment {
    return { documentId: row.id, orgId: row.org_id, status: row.status, versionId: row.current_version_id, checksumSha256: row.checksum_sha256 };
}

export type Ws11AttachmentStorageDeps = {
    supabase: SupabaseClient;
    /** Null until Communications ships attachment-content retrieval: the boundary is then unavailable. */
    fetchContent: AttachmentContentFetcher | null;
    bucket?: string;
    /** Record `communication_message_attachments`. Needs migration 20261218090000; off by default. */
    linkAttachments?: boolean;
    audit?: (input: DocumentAuditInput) => Promise<DocumentAuditResult>;
    newId?: () => string;
};

export function createWs11AttachmentStorage(deps: Ws11AttachmentStorageDeps): AttachmentStorageBoundary {
    const db = deps.supabase;
    const bucket = deps.bucket ?? INBOUND_ATTACHMENT_BUCKET;
    const audit = deps.audit ?? recordDocumentAudit;
    const newId = deps.newId ?? randomUUID;
    const linkAttachments = deps.linkAttachments === true;

    async function readDocument(orgId: string, documentId: string): Promise<StoredAttachment | null> {
        const { data, error } = await db
            .from("documents")
            .select("id, org_id, status, current_version_id, checksum_sha256")
            .eq("org_id", orgId)
            .eq("id", documentId)
            .maybeSingle();
        if (error) throw new Error(`ws11 findStored: ${error.code ?? "unknown"}`);
        return data ? toStored(data as DocRow) : null;
    }

    async function isLinked(orgId: string, messageId: string, attachmentId: string, documentId: string): Promise<boolean> {
        const { data, error } = await db
            .from(MESSAGE_ATTACHMENTS_TABLE)
            .select("document_id")
            .eq("org_id", orgId)
            .eq("message_id", messageId)
            .eq("provider_attachment_id", attachmentId)
            .maybeSingle();
        if (error) throw new Error(`ws11 findStored link: ${error.code ?? "unknown"}`);
        const linked = (data as { document_id?: string } | null)?.document_id;
        if (linked && linked !== documentId) throw new Error("ws11 findStored link: names another document");
        return Boolean(linked);
    }

    /** Idempotent: a row already there (ours, or a concurrent delivery's) is the outcome wanted. */
    async function link(stored: StoredAttachment, messageId: string, attachmentId: string): Promise<StoredAttachment> {
        if (!linkAttachments) return stored;
        const { error } = await db.from(MESSAGE_ATTACHMENTS_TABLE).insert({
            org_id: stored.orgId,
            message_id: messageId,
            document_id: stored.documentId,
            provider_attachment_id: attachmentId,
            disposition: "attachment",
        });
        if (error && error.code !== UNIQUE_VIOLATION) throw new Error(`ws11 store: message link failed (${error.code ?? "unknown"})`);
        if (error && !(await isLinked(stored.orgId, messageId, attachmentId, stored.documentId))) {
            throw new Error("ws11 store: message link conflicts");
        }
        return stored;
    }

    return {
        available: deps.fetchContent !== null,

        async findStored({ orgId, messageId, attachmentId }) {
            const documentId = inboundAttachmentDocumentId(orgId, messageId, attachmentId);
            const found = await readDocument(orgId, documentId);
            // An unlinked document is "not stored yet": `store` finds it, writes no second object, and adds the link.
            if (found && linkAttachments && !(await isLinked(orgId, messageId, attachmentId, documentId))) return null;
            return found;
        },

        async retrieve({ orgId, messageId, attachmentId }) {
            if (!deps.fetchContent) return { ok: false, reason: "storage_unavailable" };
            // Ownership is the persisted message's, re-read here: this organization, inbound, and listing this attachment.
            const { data } = await db
                .from("communication_messages")
                .select("id, org_id, direction, channel, provider_message_id, communication_provider_binding_id, metadata")
                .eq("org_id", orgId)
                .eq("id", messageId)
                .maybeSingle();
            const m = data as {
                org_id: string;
                direction: string;
                channel: string;
                provider_message_id: string | null;
                communication_provider_binding_id: string | null;
                metadata: { attachments?: Array<{ id?: unknown }> } | null;
            } | null;
            if (!m || m.org_id !== orgId || m.direction !== "inbound" || m.channel !== "email" || !m.provider_message_id) {
                return { ok: false, reason: "message_not_owned" };
            }
            if (!(m.metadata?.attachments ?? []).some((a) => a?.id === attachmentId)) return { ok: false, reason: "attachment_not_listed" };
            const got = await deps
                .fetchContent({ orgId, providerMessageId: m.provider_message_id, providerBindingId: m.communication_provider_binding_id, attachmentId })
                .catch((): AttachmentContentResult => ({ ok: false, retryable: true, reason: "fetch_threw" }));
            return got.ok ? { ok: true, bytes: got.bytes } : { ok: false, reason: got.reason };
        },

        async store({ orgId, messageId, attachmentId, filename, mimeType, bytes, status, screening }) {
            const documentId = inboundAttachmentDocumentId(orgId, messageId, attachmentId);
            const already = await readDocument(orgId, documentId);
            if (already) return link(already, messageId, attachmentId);

            const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
            const versionId = newId();
            const storagePath = `${orgId}/pos_intake/${newId()}-${sanitizeFilename(filename ?? "attachment")}`;

            // Recorded BEFORE anything is stored, like every document write: no record, no file.
            const recorded = await audit({
                orgId,
                actorUserId: null,
                actorPrincipal: { kind: "system", process: "inbound_email_attachment" },
                event: "document_upload_authorized",
                subject: { type: "documents", id: documentId },
                route: AUDIT_ROUTE,
                detail: { communication_message_id: messageId, attachment_id: attachmentId, byte_size: bytes.byteLength, screening_status: status },
            });
            if (!recorded.ok) throw new Error("ws11 store: audit unavailable");

            const up = await db.storage.from(bucket).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
            if (up.error) throw new Error("ws11 store: object upload failed");

            const { error } = await db
                .from("documents")
                .insert({
                    id: documentId,
                    org_id: orgId,
                    // No legacy parent columns: an intake document's owner is chosen at filing, through the canonical
                    // association, exactly like an operator's intake upload.
                    title: filename?.trim() || "Email attachment",
                    original_filename: filename,
                    mime_type: mimeType,
                    byte_size: bytes.byteLength,
                    checksum_sha256: checksumSha256,
                    bucket,
                    storage_path: storagePath,
                    status,
                    // Named explicitly so the D2 insert trigger writes version 1 under an id this boundary can report.
                    current_version_id: versionId,
                    metadata: {
                        screening,
                        ...processingIntentMetadata("store_document"),
                        source: "inbound_email_attachment",
                        inbound_email: { communication_message_id: messageId, attachment_id: attachmentId },
                        upload_audit_event_id: recorded.eventId,
                    },
                })
                .select("id")
                .maybeSingle();

            if (error) {
                // Only this attempt's own object is removed; the row (ours or the winner's) is never deleted.
                await db.storage.from(bucket).remove([storagePath]).catch(() => undefined);
                if (error.code === UNIQUE_VIOLATION) {
                    const winner = await readDocument(orgId, documentId);
                    if (winner) return link(winner, messageId, attachmentId);
                }
                throw new Error(`ws11 store: document insert failed (${error.code ?? "unknown"})`);
            }
            return link({ documentId, orgId, status, versionId, checksumSha256 }, messageId, attachmentId);
        },
    };
}
