/**
 * D10 — the hook Communications calls once an inbound email has persisted, and the production wiring behind it.
 *
 * CONTRACT FOR THE CALLER (Communications, `ingestResendInboundEmail`, after step 7 — the message row exists and its
 * receipt is resolved): `await fileInboundAttachmentsForPersistedMessage(deps, { orgId, messageId })`. It never throws and
 * never changes the ingestion outcome; it re-reads the message itself, so the caller passes identifiers, not content.
 * A redelivery is safe to hook again: every step converges (stable document id, unique primary source, idempotent
 * case annotation).
 *
 * TODAY'S WIRING IS THE MEASURED REALITY: no attachment-content fetcher exists, and no malware scanner. With the
 * production deps every attachment is HELD before a byte is read. Nothing here sends a message.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { makeProcessingCaseDbDeps } from "@/lib/pos/processingCase/processingCaseDb";
import { processingIntentMetadata } from "@/lib/pos/processingImportIntent";
import {
    UNAVAILABLE_MALWARE_SCAN,
    fileInboundEmailAttachments,
    type AttachmentFilingOutcome,
    type InboundAttachmentFilingDeps,
    type InboundMessageForFiling,
} from "@/lib/documents/inbound/inboundAttachmentFiling";
import { createWs11AttachmentStorage, type AttachmentContentFetcher } from "@/lib/documents/inbound/ws11AttachmentStorage";

/**
 * A persisted inbound message, as the filing pipeline sees it. A row exists only for a message whose organization
 * Communications already resolved from the receiving binding, so a readable row in THIS organization is "owned"; no row
 * (another organization's id, a non-inbound row) is not owned and nothing of it is touched.
 */
export async function loadInboundMessageForFiling(
    supabase: SupabaseClient,
    ref: { orgId: string; messageId: string },
): Promise<InboundMessageForFiling | null> {
    const { data } = await supabase
        .from("communication_messages")
        .select("id, org_id, direction, channel, metadata")
        .eq("org_id", ref.orgId)
        .eq("id", ref.messageId)
        .maybeSingle();
    const row = data as { id: string; org_id: string; direction: string; channel: string; metadata: Record<string, unknown> | null } | null;
    if (!row || row.org_id !== ref.orgId || row.direction !== "inbound" || row.channel !== "email") return null;
    const raw = Array.isArray(row.metadata?.attachments) ? (row.metadata!.attachments as Array<Record<string, unknown>>) : [];
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    return {
        id: row.id,
        orgId: row.org_id,
        ownership: "owned",
        attachments: raw
            .filter((a) => typeof a?.id === "string" && a.id)
            .map((a) => ({
                id: a.id as string,
                filename: str(a.filename),
                content_type: str(a.content_type),
                content_disposition: str(a.content_disposition),
                size: typeof a.size === "number" ? a.size : null,
            })),
    };
}

/** Marks the case as a document to file, with its provenance. A merge: repeated application changes nothing. */
export function makeInboundCaseAnnotator(supabase: SupabaseClient): NonNullable<InboundAttachmentFilingDeps["annotateCase"]> {
    return async ({ orgId, processingCaseId, documentId, messageId, attachmentId, filename }) => {
        const { data } = await supabase.from("processing_cases").select("metadata").eq("org_id", orgId).eq("id", processingCaseId).maybeSingle();
        const existing = (data as { metadata?: unknown } | null)?.metadata;
        const meta = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
        const { error } = await supabase
            .from("processing_cases")
            .update({
                metadata: {
                    ...meta,
                    ...processingIntentMetadata("store_document"),
                    source_document_display_name: filename?.trim() || "Email attachment",
                    source_document_filename: filename,
                    inbound_email: { communication_message_id: messageId, attachment_id: attachmentId, document_id: documentId },
                },
            })
            .eq("org_id", orgId)
            .eq("id", processingCaseId);
        if (error) throw new Error("annotate case failed");
    };
}

/**
 * Production wiring. With no options: no fetcher and no message link — the default. Communications passes its
 * flag-gated options (`inboundAttachmentFilingOptions`, `INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED`, OFF); malware
 * scanning is unavailable until D1c-2. Neither may be supplied by a stand-in: structural screening is not a scanner.
 */
export function makeInboundAttachmentFilingDeps(
    supabase: SupabaseClient,
    opts: { fetchContent?: AttachmentContentFetcher | null; linkAttachments?: boolean } = {},
): InboundAttachmentFilingDeps {
    return {
        storage: createWs11AttachmentStorage({ supabase, fetchContent: opts.fetchContent ?? null, linkAttachments: opts.linkAttachments === true }),
        malware: UNAVAILABLE_MALWARE_SCAN,
        processing: makeProcessingCaseDbDeps(supabase),
        annotateCase: makeInboundCaseAnnotator(supabase),
    };
}

export type InboundAttachmentHookResult =
    | { status: "filed"; outcomes: AttachmentFilingOutcome[] }
    | { status: "message_not_found" }
    | { status: "failed"; reason: string };

export async function fileInboundAttachmentsForPersistedMessage(
    deps: { supabase: SupabaseClient; filing: InboundAttachmentFilingDeps },
    ref: { orgId: string; messageId: string },
): Promise<InboundAttachmentHookResult> {
    try {
        const message = await loadInboundMessageForFiling(deps.supabase, ref);
        if (!message) return { status: "message_not_found" };
        return { status: "filed", outcomes: await fileInboundEmailAttachments(deps.filing, message) };
    } catch (e) {
        // Ingestion already succeeded; a filing failure is retried by the next delivery, never surfaced as a lost email.
        return { status: "failed", reason: e instanceof Error ? e.message : "unknown" };
    }
}
