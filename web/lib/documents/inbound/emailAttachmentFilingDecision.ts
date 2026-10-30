/**
 * D10 pilot — what Documents does with ONE inbound email attachment. A pure decision; nothing here reads, stores, opens
 * or sends anything.
 *
 * The pipeline is the existing one and only that (user-approved 2026-10-30):
 *   Communications receives and owns the message (`ingestResendInboundEmail`, ownership `resolveInboundEmailOwnership`,
 *   one receipt per provider message id)  →  WS11 stores the attachment as a `documents` row
 *   (`communication_message_attachments`, planned in CONVERSATION-PLATFORM-V1-PLAN.md)  →  the document is screened
 *   →  ONE Processing case with `source_kind = 'email_attachment'` (already admitted by `chk_pcs_source_kind`)  →
 *   the filing workspace  →  `commitDocumentFiling` with the key below.
 * There is no second pipeline, no new ingress and no subject guess: the case opens WITHOUT a proposed child or family,
 * so it lands in the existing "Needs a record" lane (`awaiting_subject`) for an operator to resolve.
 *
 * ── HELD UNTIL PROVEN SAFE ──
 * Today two prerequisites do not exist, and the decision says so instead of pretending: WS11 storage (no migration
 * creates `communication_message_attachments`; attachments are metadata only) and content screening (D1c-2 malware
 * scanning, deferred in D5). Every attachment is therefore HELD, with the reasons, until both are real. A dependency is
 * marked available only by changing `EMAIL_ATTACHMENT_FILING_CAPABILITY` in the same change that ships it — never by
 * configuration, and never by assuming a scan happened.
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
    /** The `documents` row WS11 created for this attachment, when it exists. */
    stored: { documentId: string; orgId: string; status: string | null } | null;
    /** The screening verdict for that document, when a screening service exists. */
    screening: { verdict: "clean" | "infected" | "suspicious" | "pending" | "failed" } | null;
};

export type HoldReason =
    | "storage_unavailable"
    | "screening_unavailable"
    | "message_not_owned"
    | "message_ownership_ambiguous"
    | "not_an_attachment"
    | "attachment_not_stored"
    | "stored_in_another_organization"
    | "document_unavailable"
    | "screening_pending"
    | "screening_rejected";

export type AttachmentFilingDecision =
    | { action: "hold"; reasons: HoldReason[] }
    | {
          action: "open_processing_case";
          orgId: string;
          documentId: string;
          sourceKind: "email_attachment";
          /** Idempotency: one case and one filing per (message, document), however often the email is redelivered. */
          sourceKey: string;
          filingKey: string;
          /** No subject is proposed: the operator chooses the child or family. */
          proposedSubject: null;
      };

/** The real state of the two prerequisites. Changed only by the change that ships each one. */
export const EMAIL_ATTACHMENT_FILING_CAPABILITY = Object.freeze({
    /** WS11: `communication_message_attachments` + attachment bytes stored as `documents`. Absent. */
    storage: false,
    /** D1c-2: malware / content screening with a recorded verdict. Absent. */
    screening: false,
});

export type FilingDependency = {
    key: "ws11_attachment_storage" | "d1c2_content_screening" | "d10_case_opening";
    owner: string;
    state: "missing" | "ready";
    proof: string;
    next: string;
};

/** The prerequisites, their owners and the proof each needs — so "held" always names what would release it. */
export const EMAIL_ATTACHMENT_FILING_DEPENDENCIES: readonly FilingDependency[] = Object.freeze([
    {
        key: "ws11_attachment_storage",
        owner: "Communications (Conversation Platform WS11)",
        state: EMAIL_ATTACHMENT_FILING_CAPABILITY.storage ? "ready" : "missing",
        proof: "a migration creating communication_message_attachments (org_id, message_id, document_id → documents, disposition, UNIQUE (message_id, document_id)) and ingestion storing attachment bytes as documents in org_documents",
        next: "WS11 storage slice; Documents consumes it unchanged",
    },
    {
        key: "d1c2_content_screening",
        owner: "Documents security (D1c-2, deferred in D5)",
        state: EMAIL_ATTACHMENT_FILING_CAPABILITY.screening ? "ready" : "missing",
        proof: "a screening verdict recorded per document version before release from quarantine; no verdict = not screened",
        next: "decide the screening provider within existing services (no new paid provider without approval), then the D1c-2 slice",
    },
    {
        key: "d10_case_opening",
        owner: "Documents / Processing",
        state: "missing",
        proof: "the existing non-form case opener called with this decision, and email_attachment added to the filing queue's document sources",
        next: "the bounded consumer slice after both prerequisites are ready",
    },
]);

export function emailAttachmentSourceKey(messageId: string, documentId: string): string {
    return `email_attachment:${messageId}:${documentId}`;
}

export function decideInboundAttachmentFiling(
    input: InboundAttachmentInput,
    capability: { storage: boolean; screening: boolean } = EMAIL_ATTACHMENT_FILING_CAPABILITY,
): AttachmentFilingDecision {
    const reasons: HoldReason[] = [];
    if (!capability.storage) reasons.push("storage_unavailable");
    if (!capability.screening) reasons.push("screening_unavailable");

    if (input.message.ownership === "cross_org_ambiguous") reasons.push("message_ownership_ambiguous");
    else if (input.message.ownership !== "owned" || !input.message.orgId) reasons.push("message_not_owned");

    // Inline images and link parts are not documents a family sent us.
    if ((input.attachment.disposition ?? "attachment").toLowerCase() !== "attachment") reasons.push("not_an_attachment");

    const stored = input.stored;
    if (!stored) reasons.push("attachment_not_stored");
    else {
        if (input.message.orgId && stored.orgId !== input.message.orgId) reasons.push("stored_in_another_organization");
        if (isDocumentUnavailable(stored.status)) reasons.push("document_unavailable");
    }

    const verdict = input.screening?.verdict ?? null;
    if (capability.screening) {
        if (verdict === null || verdict === "pending") reasons.push("screening_pending");
        else if (verdict !== "clean") reasons.push("screening_rejected");
    }

    if (reasons.length > 0 || !stored || !input.message.orgId) return { action: "hold", reasons: reasons.length ? reasons : ["attachment_not_stored"] };
    const key = emailAttachmentSourceKey(input.message.id, stored.documentId);
    return {
        action: "open_processing_case",
        orgId: input.message.orgId,
        documentId: stored.documentId,
        sourceKind: "email_attachment",
        sourceKey: key,
        filingKey: key,
        proposedSubject: null,
    };
}
