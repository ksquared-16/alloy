/**
 * D10 pilot — inbound email attachments → Processing → canonical filing. The orchestration, over injected boundaries.
 *
 * For each attachment of ONE message Communications has already received and owned, in this order:
 *   1. holds knowable without touching bytes — storage unavailable, malware scanning required but absent, unowned or
 *      ambiguous message, inline/link part. An unowned message's attachment is never retrieved or stored;
 *   2. idempotency — the attachment WS11 already stored for (message, attachment) is reused, never stored twice;
 *   3. retrieval (WS11) and the canonical D1c-1 ingestion of a file from an outside sender: size cap, byte sniffing
 *      (`sniffPublicUploadKind` — PDF, PNG, JPEG; the declared type is never trusted) and `decideIngestion` —
 *      refused is never stored, flagged is stored `quarantined` (the existing review queue), clean is stored;
 *   4. malware scanning, when the policy requires it and a scanner exists;
 *   5. the gate (`decideInboundAttachmentFiling`), then ONE Processing case through the existing non-form opener,
 *      `source_kind = 'email_attachment'`, `source_id = document id`. A concurrent redelivery that loses the race on the
 *      database's unique primary-source index re-reads and converges on the winner's case.
 * Filing is then the existing document path: the case appears in the filing queue and is filed by `commitDocumentFiling`
 * under `processing_case:<case>:document:<document>`; nothing here files, proposes a subject, or sends a message.
 *
 * The production boundaries are the measured reality: storage and malware scanning are UNAVAILABLE, so every attachment
 * is held with its reasons until the owning slices ship (`EMAIL_ATTACHMENT_FILING_DEPENDENCIES`).
 */
import { decideIngestion } from "@/lib/documents/screenedIngestion";
import { sniffPublicUploadKind } from "@/lib/documents/documentContentSignature";
import { PUBLIC_UPLOAD_MAX_FILE_BYTES } from "@/lib/documents/publicUploadGuard";
import { openNonFormProcessingCaseFromSource } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe";
import type { ProcessingCaseDeps } from "@/lib/pos/processingCase/types";
import {
    DEFAULT_EMAIL_ATTACHMENT_FILING_POLICY,
    EMAIL_ATTACHMENT_FILING_CAPABILITY,
    decideInboundAttachmentFiling,
    emailAttachmentSourceKey,
    preStorageHolds,
    type FilingCapability,
    type FilingPolicy,
    type HoldReason,
    type InboundOwnership,
} from "@/lib/documents/inbound/emailAttachmentFilingDecision";

/** One owned inbound message, as Communications persists it (`communication_messages` + `metadata.attachments[]`). */
export type InboundMessageForFiling = {
    id: string;
    orgId: string | null;
    ownership: InboundOwnership;
    attachments: Array<{ id: string; filename: string | null; content_type: string | null; content_disposition: string | null; size: number | null }>;
};

export type StoredAttachment = { documentId: string; orgId: string; status: string | null };

/**
 * The WS11 contract this pipeline consumes. Communications owns its implementation; `store` must be idempotent on
 * (message, attachment) — the same attachment is one `documents` row however often it is offered.
 */
export interface AttachmentStorageBoundary {
    readonly available: boolean;
    findStored(args: { orgId: string; messageId: string; attachmentId: string }): Promise<StoredAttachment | null>;
    retrieve(args: { orgId: string; messageId: string; attachmentId: string }): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }>;
    store(args: {
        orgId: string;
        messageId: string;
        attachmentId: string;
        filename: string | null;
        mimeType: string;
        bytes: Uint8Array;
        status: string;
        screening: Record<string, unknown>;
    }): Promise<StoredAttachment>;
}

export interface MalwareScanBoundary {
    readonly available: boolean;
    verdict(args: { orgId: string; documentId: string }): Promise<{ verdict: "clean" | "infected" | "suspicious" | "pending" | "failed" }>;
}

/** Today's WS11 reality: no retrieval, no storage. Calling it is a programming error — the gate holds first. */
export const UNAVAILABLE_ATTACHMENT_STORAGE: AttachmentStorageBoundary = Object.freeze({
    available: false,
    async findStored() { return null; },
    async retrieve() { return { ok: false as const, reason: "storage_unavailable" }; },
    async store(): Promise<StoredAttachment> { throw new Error("WS11 attachment storage is not available"); },
});

/** Today's D1c-2 reality: no scanner. */
export const UNAVAILABLE_MALWARE_SCAN: MalwareScanBoundary = Object.freeze({
    available: false,
    async verdict(): Promise<{ verdict: "pending" }> { return { verdict: "pending" }; },
});

export type InboundAttachmentFilingDeps = {
    storage: AttachmentStorageBoundary;
    malware: MalwareScanBoundary;
    processing: ProcessingCaseDeps;
    policy?: FilingPolicy;
    now?: () => Date;
};

export type AttachmentFilingOutcome =
    | { attachmentId: string; sourceKey: string; outcome: "held"; reasons: HoldReason[]; documentId: string | null }
    | { attachmentId: string; sourceKey: string; outcome: "case_opened" | "case_existing"; processingCaseId: string; documentId: string };

const CANONICAL_MIME = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg" } as const;

export async function fileInboundEmailAttachments(
    deps: InboundAttachmentFilingDeps,
    message: InboundMessageForFiling,
): Promise<AttachmentFilingOutcome[]> {
    const capability: FilingCapability = {
        storage: deps.storage.available,
        structuralScreening: EMAIL_ATTACHMENT_FILING_CAPABILITY.structuralScreening,
        malwareScanning: deps.malware.available,
    };
    const policy = deps.policy ?? DEFAULT_EMAIL_ATTACHMENT_FILING_POLICY;
    const out: AttachmentFilingOutcome[] = [];

    for (const a of message.attachments) {
        const sourceKey = emailAttachmentSourceKey(message.id, a.id);
        const held = (reasons: HoldReason[], documentId: string | null = null) =>
            out.push({ attachmentId: a.id, sourceKey, outcome: "held", reasons: [...new Set(reasons)], documentId });
        const base = { message: { id: message.id, ownership: message.ownership, orgId: message.orgId }, attachment: { id: a.id, disposition: a.content_disposition } };

        // 1. Nothing is retrieved or stored while any of these hold.
        const early = preStorageHolds(base, capability, policy);
        if (early.length > 0 || !message.orgId) {
            held(early.length ? early : ["message_not_owned"]);
            continue;
        }
        const orgId = message.orgId;

        // 2–3. Reuse what is stored; otherwise retrieve, screen as an outside file, store.
        let stored = await deps.storage.findStored({ orgId, messageId: message.id, attachmentId: a.id });
        let structural: "clean" | "quarantined" | "refused" | null = stored ? (stored.status === "quarantined" ? "quarantined" : "clean") : null;
        if (!stored) {
            if (typeof a.size === "number" && a.size > PUBLIC_UPLOAD_MAX_FILE_BYTES) {
                held(["screening_refused"]);
                continue;
            }
            const got = await deps.storage.retrieve({ orgId, messageId: message.id, attachmentId: a.id });
            if (!got.ok) {
                held(["retrieval_failed"]);
                continue;
            }
            const kind = got.bytes.byteLength <= PUBLIC_UPLOAD_MAX_FILE_BYTES ? sniffPublicUploadKind(got.bytes) : null;
            if (!kind) {
                held(["screening_refused"]);
                continue;
            }
            const screened = decideIngestion(got.bytes, kind, deps.now ? deps.now() : new Date());
            if (!screened.store) {
                held(["screening_refused"]);
                continue;
            }
            stored = await deps.storage.store({
                orgId,
                messageId: message.id,
                attachmentId: a.id,
                filename: a.filename,
                mimeType: CANONICAL_MIME[kind],
                bytes: got.bytes,
                status: screened.status,
                screening: screened.screening,
            });
            structural = screened.status === "quarantined" ? "quarantined" : "clean";
        }

        // 4. Malware verdict, only where the policy requires one and a scanner exists.
        const malware = policy.requireMalwareScan && deps.malware.available ? await deps.malware.verdict({ orgId, documentId: stored.documentId }) : null;

        // 5. The gate, then one case.
        const decision = decideInboundAttachmentFiling({ ...base, stored, structural, malware }, capability, policy);
        if (decision.action === "hold") {
            held(decision.reasons, stored.documentId);
            continue;
        }
        try {
            const opened = await openNonFormProcessingCaseFromSource(deps.processing, {
                orgId: decision.orgId,
                sourceKind: "email_attachment",
                sourceId: decision.sourceId,
                caseType: null,
            });
            out.push({ attachmentId: a.id, sourceKey, outcome: opened.created ? "case_opened" : "case_existing", processingCaseId: opened.processingCaseId, documentId: decision.documentId });
        } catch {
            // A concurrent redelivery won the unique primary-source race: converge on its case rather than fail or fork.
            const existing = await deps.processing
                .findCaseIdByPrimarySource({ orgId: decision.orgId, sourceKind: "email_attachment", sourceId: decision.sourceId })
                .catch(() => null);
            if (existing) out.push({ attachmentId: a.id, sourceKey, outcome: "case_existing", processingCaseId: existing, documentId: decision.documentId });
            else held(["case_open_failed"], decision.documentId);
        }
    }
    return out;
}
