/**
 * A document whose status makes it unavailable to every reader (D1a decision, D1c-1 quarantine).
 *
 * `quarantined` is set by structural screening (`structuralScreening.ts`) and cleared only by an authorized release
 * (`POST /api/admin/documents/[id]/screening`). Every path that serves a document's bytes, link, text or listing honours
 * this. The access decision refuses it (DOCUMENT_RESTRICTED), the byte readers return nothing, and the lists leave it out.
 */
export const UNAVAILABLE_DOCUMENT_STATUSES: readonly string[] = Object.freeze(["deleted", "quarantined", "restricted", "superseded"]);

/**
 * D5: a received document filed as the next VERSION of an existing document. Its bytes now live as that version; the
 * received row, its version and its object are kept as provenance (`metadata.filing.target_document_id`), never listed.
 */
export const SUPERSEDED_DOCUMENT_STATUS = "superseded" as const;

export const QUARANTINED_DOCUMENT_STATUS = "quarantined" as const;

export function isDocumentUnavailable(status: unknown): boolean {
    return typeof status === "string" && UNAVAILABLE_DOCUMENT_STATUSES.includes(status.trim());
}
