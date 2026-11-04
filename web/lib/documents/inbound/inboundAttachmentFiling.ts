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
 *   4. malware scanning — a clean verdict bound to the stored version, always required (structural screening never releases);
 *   5. the gate (`decideInboundAttachmentFiling`), then ONE Processing case through the existing non-form opener,
 *      `source_kind = 'email_attachment'`, `source_id = document id`, with `requireAtomic`: only the one-transaction
 *      `open_processing_case_with_primary_source` may open it. Where that function is not in the database yet the
 *      attachment is HELD (`processing_atomic_open_unavailable`) — never opened by the orphan-prone legacy sequence.
 * Filing is then the existing document path: the case appears in the filing queue and is filed by `commitDocumentFiling`
 * under `processing_case:<case>:document:<document>`; nothing here files, proposes a subject, or sends a message.
 *
 * MALWARE HOLD. Every newly stored attachment is written `quarantined` with `metadata.screening.malware_hold =
 * "awaiting_verdict"` — never available before a malware verdict, whatever structural screening said. The structural
 * result is kept beside it (`screening.structural_status`), and `structural` is read from THAT, never from the document
 * status: a structurally clean file held for its scan is not a structurally quarantined one. Releasing it after a clean
 * verdict is a separate governed transition (the database refuses it otherwise: `document_malware_scan_pending`); until
 * then the gate holds it as `document_unavailable`. Nothing here updates a stored row.
 *
 * DELETED ATTACHMENTS. The stored document's id is derived from (organization, message, attachment), so a provider
 * redelivery after an operator's audited delete would re-create it. `findStored` reports such an attachment as
 * deleted, and it is held (`attachment_deleted`) without being retrieved or stored again.
 *
 * The production boundaries are the measured reality: storage and malware scanning are UNAVAILABLE, so every attachment
 * is held with its reasons until the owning slices ship (`EMAIL_ATTACHMENT_FILING_DEPENDENCIES`).
 */
import { decideIngestion } from "@/lib/documents/screenedIngestion";
import { sniffPublicUploadKind } from "@/lib/documents/documentContentSignature";
import { PUBLIC_UPLOAD_MAX_FILE_BYTES } from "@/lib/documents/publicUploadGuard";
import { QUARANTINED_DOCUMENT_STATUS } from "@/lib/documents/documentAvailability";
import { openNonFormProcessingCaseFromSource } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe";
import { isAtomicProcessingOpenUnavailable } from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import type { ProcessingCaseDeps } from "@/lib/pos/processingCase/types";
import {
    EMAIL_ATTACHMENT_FILING_CAPABILITY,
    decideInboundAttachmentFiling,
    emailAttachmentSourceKey,
    preStorageHolds,
    type FilingCapability,
    type HoldReason,
    type InboundOwnership,
    type MalwareVerdict,
} from "@/lib/documents/inbound/emailAttachmentFilingDecision";

/** One owned inbound message, as Communications persists it (`communication_messages` + `metadata.attachments[]`). */
export type InboundMessageForFiling = {
    id: string;
    orgId: string | null;
    ownership: InboundOwnership;
    attachments: Array<{ id: string; filename: string | null; content_type: string | null; content_disposition: string | null; size: number | null }>;
};

/**
 * The stored document, and the exact version WS11 wrote (`documents.current_version_id` + its SHA-256). A malware
 * verdict releases a file only when it names this version; a row without them can never be released on a scan.
 */
export type StoredAttachment = {
    documentId: string;
    orgId: string;
    status: string | null;
    versionId?: string | null;
    checksumSha256?: string | null;
    /**
     * The persisted STRUCTURAL screening result (`metadata.screening.structural_status`), independent of `status`: a
     * document held for its malware scan is `quarantined` by status and may still be structurally clean. Absent on a
     * legacy row, whose status is then the only evidence.
     */
    structural?: "clean" | "quarantined" | null;
};

/**
 * An attachment whose stored document an operator deleted through the audited delete. Its id is stable, so without this
 * a redelivery would fetch and re-create it; instead it is held and never retrieved again.
 */
export type DeletedAttachment = { documentId: string; orgId: string; deleted: true };

/** Every newly stored attachment carries this hold until a clean verdict about its exact version releases it. */
export const INBOUND_ATTACHMENT_MALWARE_HOLD = "awaiting_verdict" as const;

/** A legacy row (no `structural_status`): its status is the structural result it was stored with. */
export function structuralFromStatus(status: string | null): "clean" | "quarantined" {
    return status === QUARANTINED_DOCUMENT_STATUS ? "quarantined" : "clean";
}

/**
 * The WS11 contract this pipeline consumes. Communications owns its implementation; `store` must be idempotent on
 * (message, attachment) — the same attachment is one `documents` row however often it is offered.
 */
export interface AttachmentStorageBoundary {
    readonly available: boolean;
    /** The stored attachment whatever its status, a deletion marker after an audited delete, or null (never stored). */
    findStored(args: { orgId: string; messageId: string; attachmentId: string }): Promise<StoredAttachment | DeletedAttachment | null>;
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

/**
 * D1c-2. Asked about ONE stored version — document, version id and content hash — and answers about that version. The
 * gate checks the answer's `subject` against what was stored: a verdict about any other bytes holds the file
 * (`malware_verdict_unbound`). No implementation exists; structural screening is never an implementation of this.
 */
export interface MalwareScanBoundary {
    readonly available: boolean;
    verdict(args: { orgId: string; documentId: string; versionId: string | null; checksumSha256: string | null }): Promise<MalwareVerdict>;
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
    async verdict(): Promise<MalwareVerdict> { return { verdict: "pending", subject: null }; },
});

export type InboundAttachmentFilingDeps = {
    storage: AttachmentStorageBoundary;
    malware: MalwareScanBoundary;
    processing: ProcessingCaseDeps;
    now?: () => Date;
    /**
     * Marks the case as a document to file (`processing_intent = store_document`) and records where it came from. Run on
     * EVERY converged open, not only on creation, and must be an idempotent merge: a redelivery repairs an annotation a
     * crash lost. Without it the case opens but never reaches the filing queue (`caseRequiresFiling`).
     */
    annotateCase?: (args: { orgId: string; processingCaseId: string; documentId: string; messageId: string; attachmentId: string; filename: string | null }) => Promise<void>;
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
    const out: AttachmentFilingOutcome[] = [];

    for (const a of message.attachments) {
        const sourceKey = emailAttachmentSourceKey(message.id, a.id);
        const held = (reasons: HoldReason[], documentId: string | null = null) =>
            out.push({ attachmentId: a.id, sourceKey, outcome: "held", reasons: [...new Set(reasons)], documentId });
        const base = { message: { id: message.id, ownership: message.ownership, orgId: message.orgId }, attachment: { id: a.id, disposition: a.content_disposition } };

        // 1. Nothing is retrieved or stored while any of these hold.
        const early = preStorageHolds(base, capability);
        if (early.length > 0 || !message.orgId) {
            held(early.length ? early : ["message_not_owned"]);
            continue;
        }
        const orgId = message.orgId;

        // 2–3. Reuse what is stored; otherwise retrieve, screen as an outside file, store.
        const found = await deps.storage.findStored({ orgId, messageId: message.id, attachmentId: a.id }).catch(() => undefined);
        if (found === undefined) {
            held(["attachment_not_stored"]);
            continue;
        }
        // Deliberately deleted: never fetched or stored again under its stable id.
        if (found && "deleted" in found) {
            held(["attachment_deleted"], found.documentId);
            continue;
        }
        let stored: StoredAttachment | null = found;
        // From the persisted structural result, never from the status (a scan-held file is `quarantined` by status).
        let structural: "clean" | "quarantined" | "refused" | null = stored ? (stored.structural ?? structuralFromStatus(stored.status)) : null;
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
            stored = await deps.storage
                .store({
                orgId,
                messageId: message.id,
                attachmentId: a.id,
                filename: a.filename,
                mimeType: CANONICAL_MIME[kind],
                bytes: got.bytes,
                // Never available before a malware verdict: the structural result is kept beside the hold, not in the status.
                status: QUARANTINED_DOCUMENT_STATUS,
                screening: { ...screened.screening, structural_status: screened.status, malware_hold: INBOUND_ATTACHMENT_MALWARE_HOLD },
                })
                // One attachment's storage failure holds that attachment; the others still proceed, and a redelivery retries.
                .catch(() => null);
            if (!stored) {
                held(["attachment_not_stored"]);
                continue;
            }
            structural = screened.status === "quarantined" ? "quarantined" : "clean";
        }

        // 4. Malware verdict. Without a scanner step 1 already held the attachment; structural screening never substitutes.
        const malware =
            deps.malware.available
                ? await deps.malware
                      .verdict({ orgId, documentId: stored.documentId, versionId: stored.versionId ?? null, checksumSha256: stored.checksumSha256 ?? null })
                      .catch((): MalwareVerdict => ({ verdict: "failed", subject: null }))
                : null;

        // 5. The gate, then one case.
        const decision = decideInboundAttachmentFiling({ ...base, stored, structural, malware }, capability);
        if (decision.action === "hold") {
            held(decision.reasons, stored.documentId);
            continue;
        }
        let opened: { processingCaseId: string; created: boolean } | null = null;
        try {
            opened = await openNonFormProcessingCaseFromSource(deps.processing, {
                orgId: decision.orgId,
                sourceKind: "email_attachment",
                sourceId: decision.sourceId,
                caseType: null,
                // D10 deliveries race by design (provider redelivery): only the one-transaction open is acceptable.
                requireAtomic: true,
            });
        } catch (e) {
            if (isAtomicProcessingOpenUnavailable(e)) {
                held(["processing_atomic_open_unavailable"], decision.documentId);
                continue;
            }
            // Any other failure of the atomic open (a transient error after a concurrent delivery committed): a read-only
            // re-find converges on the committed case; nothing is written here.
            const existing = await deps.processing
                .findCaseIdByPrimarySource({ orgId: decision.orgId, sourceKind: "email_attachment", sourceId: decision.sourceId })
                .catch(() => null);
            if (existing) opened = { processingCaseId: existing, created: false };
        }
        if (!opened) {
            held(["case_open_failed"], decision.documentId);
            continue;
        }
        // Best-effort and idempotent: the case exists either way; the next delivery re-applies a lost annotation.
        await deps.annotateCase?.({
            orgId: decision.orgId,
            processingCaseId: opened.processingCaseId,
            documentId: decision.documentId,
            messageId: message.id,
            attachmentId: a.id,
            filename: a.filename,
        }).catch(() => undefined);
        out.push({ attachmentId: a.id, sourceKey, outcome: opened.created ? "case_opened" : "case_existing", processingCaseId: opened.processingCaseId, documentId: decision.documentId });
    }
    return out;
}
