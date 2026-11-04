/**
 * D10 pilot — may ONE inbound email attachment become a Processing case? A pure gate; it reads, stores, opens and sends
 * nothing. `inboundAttachmentFiling.ts` runs the pipeline around it.
 *
 * The pipeline is the existing one and only that (user-approved 2026-10-30):
 *   Communications receives and owns the message (`ingestResendInboundEmail`, ownership `resolveInboundEmailOwnership`,
 *   one receipt per provider message id)  →  WS11 retrieves and stores the attachment as a `documents` row
 *   →  D1c-1 structural screening (`decideIngestion`: refuse = nothing stored, quarantine = stored unavailable, clean)
 *   →  malware scanning, D1c-2 (always required; there is no structural-only release)
 *   →  ONE Processing case, `source_kind = 'email_attachment'`, `source_id = <document id>` (idempotent at the database:
 *      `uq_pcs_primary_source_once (org_id, source_kind, source_id) WHERE role='primary'`)
 *   →  the document filing queue  →  `commitDocumentFiling` under `processing_case:<case>:document:<document>`.
 * No subject is ever proposed: the case lands in the existing "Needs a record" lane (`awaiting_subject`).
 *
 * ── WHAT EXISTS AND WHAT DOES NOT (measured, not assumed) ──
 *   storage            ABSENT. Communications records attachment metadata only ("Retrieval and storage are WS11");
 *                      no migration creates `communication_message_attachments`.
 *   structural screen  PRESENT. D1c-1 `decideIngestion` is the screening every outside file already passes; it is not
 *                      antivirus and never claims a file is "safe".
 *   malware scanning   ABSENT. D1c-2 is deferred. No scanner is invented; without one every attachment holds.
 * A capability is changed only by the change that ships it.
 */
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";

export type InboundOwnership = "owned" | "no_attributable_org" | "cross_org_ambiguous";

export type InboundAttachmentInput = {
    message: {
        /** Communications' own message id (`communication_messages.id`), never the sender's RFC Message-ID. */
        id: string;
        ownership: InboundOwnership;
        orgId: string | null;
    };
    attachment: {
        /** The provider's attachment id, as Communications records it in `metadata.attachments[].id`. */
        id: string;
        disposition: string | null;
    };
    /**
     * The `documents` row WS11 holds for this attachment, when it exists. `versionId` / `checksumSha256` name the exact
     * stored bytes (`documents.current_version_id`, the D2 version row); a malware verdict is only ever about them.
     */
    stored: { documentId: string; orgId: string; status: string | null; versionId?: string | null; checksumSha256?: string | null } | null;
    /** Structural screening (D1c-1) of the stored bytes; `refused` means nothing was stored. */
    structural: "clean" | "quarantined" | "refused" | null;
    /** Malware verdict (D1c-2), when a scanner exists. */
    malware: MalwareVerdict | null;
};

/**
 * A D1c-2 verdict, and WHICH bytes it is about. A verdict that does not name the exact stored version — its document,
 * version id and content hash — is no verdict: it cannot release a file, however "clean" it says it is.
 */
export type MalwareVerdict = {
    verdict: "clean" | "infected" | "suspicious" | "pending" | "failed";
    subject?: { documentId: string; versionId: string; checksumSha256: string } | null;
};

/** True only when the verdict is bound to exactly the stored version. Absent identity on either side is never a match. */
export function malwareVerdictBindsStoredVersion(
    stored: InboundAttachmentInput["stored"],
    malware: MalwareVerdict | null,
): boolean {
    const s = malware?.subject;
    if (!stored || !s) return false;
    if (!stored.versionId || !stored.checksumSha256) return false;
    return s.documentId === stored.documentId && s.versionId === stored.versionId && s.checksumSha256 === stored.checksumSha256;
}

export type HoldReason =
    | "storage_unavailable"
    | "malware_scanning_unavailable"
    | "message_not_owned"
    | "message_ownership_ambiguous"
    | "not_an_attachment"
    | "attachment_not_stored"
    | "retrieval_failed"
    | "stored_in_another_organization"
    | "screening_refused"
    | "screening_missing"
    | "document_unavailable"
    | "malware_pending"
    | "malware_rejected"
    | "malware_verdict_unbound"
    | "case_open_failed"
    /** The atomic Processing open is not in this database yet: D10 never uses the orphan-prone sequence. */
    | "processing_atomic_open_unavailable";

export type AttachmentFilingDecision =
    | { action: "hold"; reasons: HoldReason[] }
    | {
          action: "open_processing_case";
          orgId: string;
          documentId: string;
          sourceKind: "email_attachment";
          /** `processing_case_sources.source_id`: the stored document. Redelivery converges on the same case. */
          sourceId: string;
          /** Provenance and idempotency label of this attachment's ingestion. */
          sourceKey: string;
          /** No subject is proposed: the operator chooses the child or family. */
          proposedSubject: null;
      };

export type FilingCapability = { storage: boolean; structuralScreening: boolean; malwareScanning: boolean };

/** The real state today. Changed only by the change that ships each capability. */
export const EMAIL_ATTACHMENT_FILING_CAPABILITY: Readonly<FilingCapability> = Object.freeze({
    /** WS11: retrieval + `communication_message_attachments` + bytes stored as `documents`. Absent. */
    storage: false,
    /** D1c-1 `decideIngestion`, already applied to every outside file. Present. */
    structuralScreening: true,
    /** D1c-2 malware scanning. Absent. */
    malwareScanning: false,
});

/**
 * There is no filing policy. An email attachment from an arbitrary sender is released only by a clean malware verdict
 * bound to its exact stored version. Structural screening (D1c-1) alone NEVER releases one — not by default, not by an
 * organization's choice, not by a caller's argument. A missing, failed, pending or unbound verdict holds.
 */

export type FilingDependency = {
    key: "ws11_attachment_storage" | "d1c2_malware_scanning" | "communications_ingestion_hook" | "processing_atomic_open";
    owner: string;
    state: "missing" | "ready";
    proof: string;
    next: string;
};

/** What would release a held attachment, with its owner. */
export const EMAIL_ATTACHMENT_FILING_DEPENDENCIES: readonly FilingDependency[] = Object.freeze([
    {
        key: "ws11_attachment_storage",
        owner: "Communications (Conversation Platform WS11)",
        state: EMAIL_ATTACHMENT_FILING_CAPABILITY.storage ? "ready" : "missing",
        proof: "the per-attachment adapter exists and is NOT enabled: makeResendAttachmentContentFetcher (lib/documents/inbound/resendAttachmentContentFetcher.ts) follows Resend's published contract — GET api.resend.com/emails/receiving/{email_id}/attachments/{id} with the organization's key, then the signed inbound-cdn.resend.com download_url (one hour) with no credentials, no redirects, a size cap and one deadline; never the raw message. Storage half: createWs11AttachmentStorage. Missing for enablement: the binding-credential resolver wired to it, and a live proof of the documented contract (unspecified in the docs: download auth, error codes, size limits)",
        next: "Communications wires resolveApiKey to resolveInboundRetrievalCredential and passes the fetcher to makeInboundAttachmentFilingDeps after a live contract proof and the scanner exist",
    },
    {
        key: "d1c2_malware_scanning",
        owner: "Documents security (D1c-2, deferred in D5)",
        state: EMAIL_ATTACHMENT_FILING_CAPABILITY.malwareScanning ? "ready" : "missing",
        proof: "a MalwareScanBoundary whose verdict names the exact stored version — document id, documents.current_version_id and its SHA-256 — from a trusted scanner; any other verdict holds (malware_verdict_unbound), a scanner error holds (malware_rejected), no verdict = not scanned. Structural screening is not a scanner and never releases an attachment",
        next: "author the verdict store (pending migration) and a scanner integration; choosing, provisioning and enabling a scanner are separate operator decisions",
    },
    {
        key: "communications_ingestion_hook",
        owner: "Communications (inbound email ingestion)",
        state: "missing",
        proof: "ingestResendInboundEmail calls fileInboundAttachmentsForPersistedMessage after the message persists (and again on a resolved redelivery), isolated so it can never change the ingestion outcome. WIRED locally; it remains missing as a capability because it releases nothing until the fetcher and scanner exist",
        next: "nothing further at the call site; it activates when the two capabilities above ship",
    },
    {
        key: "processing_atomic_open",
        owner: "Processing / database (certification/documents-v1/pending-migrations/20261215093000_processing_open_case_atomic.sql — authored, held out of supabase/migrations until its apply is approved)",
        state: "missing",
        proof: "open_processing_case_with_primary_source applied to the target database, then the single-session invariant (certification/invariants/processing-open-case-atomic.sql) and a two-session race test on an isolated database. Until then D10 holds every releasable attachment as processing_atomic_open_unavailable and writes no case or source",
        next: "move the migration into supabase/migrations and apply it BEFORE any D10 capability is enabled; code may deploy first (other callers keep their fallback)",
    },
]);

export function emailAttachmentSourceKey(messageId: string, attachmentId: string): string {
    return `email_attachment:${messageId}:${attachmentId}`;
}

/** Holds that are knowable BEFORE anything is retrieved or stored — an unowned message's attachment is never stored. */
export function preStorageHolds(
    input: Pick<InboundAttachmentInput, "message" | "attachment">,
    capability: FilingCapability = EMAIL_ATTACHMENT_FILING_CAPABILITY,
): HoldReason[] {
    const reasons: HoldReason[] = [];
    if (!capability.storage) reasons.push("storage_unavailable");
    if (!capability.malwareScanning) reasons.push("malware_scanning_unavailable");
    if (input.message.ownership === "cross_org_ambiguous") reasons.push("message_ownership_ambiguous");
    else if (input.message.ownership !== "owned" || !input.message.orgId) reasons.push("message_not_owned");
    // Inline images and link parts are not documents a family sent.
    if ((input.attachment.disposition ?? "attachment").toLowerCase() !== "attachment") reasons.push("not_an_attachment");
    return reasons;
}

export function decideInboundAttachmentFiling(
    input: InboundAttachmentInput,
    capability: FilingCapability = EMAIL_ATTACHMENT_FILING_CAPABILITY,
): AttachmentFilingDecision {
    const reasons = preStorageHolds(input, capability);

    if (input.structural === "refused") reasons.push("screening_refused");
    const stored = input.stored;
    if (!stored) {
        if (input.structural !== "refused") reasons.push("attachment_not_stored");
    } else {
        if (input.message.orgId && stored.orgId !== input.message.orgId) reasons.push("stored_in_another_organization");
        if (!capability.structuralScreening || input.structural === null) reasons.push("screening_missing");
        if (input.structural === "quarantined" || isDocumentUnavailable(stored.status)) reasons.push("document_unavailable");
    }

    // Without a scanner the attachment is already held (`malware_scanning_unavailable`); with one, only a bound clean verdict passes.
    if (capability.malwareScanning) {
        const v = input.malware?.verdict ?? null;
        if (v === null || v === "pending") reasons.push("malware_pending");
        else if (v !== "clean") reasons.push("malware_rejected");
        // A clean verdict releases only the version it names. Another version, another hash or no identity holds.
        else if (!malwareVerdictBindsStoredVersion(stored, input.malware)) reasons.push("malware_verdict_unbound");
    }

    if (reasons.length > 0 || !stored || !input.message.orgId) {
        return { action: "hold", reasons: reasons.length ? [...new Set(reasons)] : ["attachment_not_stored"] };
    }
    return {
        action: "open_processing_case",
        orgId: input.message.orgId,
        documentId: stored.documentId,
        sourceKind: "email_attachment",
        sourceId: stored.documentId,
        sourceKey: emailAttachmentSourceKey(input.message.id, input.attachment.id),
        proposedSubject: null,
    };
}
