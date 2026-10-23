/**
 * The one ingestion decision for a file that came from outside the platform (D1c-1).
 *
 * Every path that stores an uploaded file calls `decideIngestion` BEFORE the bytes reach storage or any parser:
 * the vendor application, the enrollment attachment, the drawn signature, and the operator upload.
 * `web/tests/documents/screenedIngestionCoverage.test.ts` fails if a new storage upload appears that is neither screened
 * here nor one of the server-generated writers.
 *
 *   refuse      nothing is stored. The caller answers 400/415 with code SCREENING_REFUSED.
 *   quarantine  stored with status `quarantined` and the screening record. No reader can reach it, and it is listed only in
 *               the review queue (`GET /api/admin/documents/screening`) until an authorized release.
 *   clean       stored as usual, with the screening record.
 *
 * Structural screening is not antivirus. The record says which engine looked and what it found. It never says a file
 * is "safe".
 */
import { recordDocumentAudit } from "@/lib/documents/documentAudit";
import { QUARANTINED_DOCUMENT_STATUS } from "@/lib/documents/documentAvailability";
import type { DocumentContentKind } from "@/lib/documents/documentContentSignature";
import { screenDocumentBytes, screeningMetadata, type ScreeningResult } from "@/lib/documents/structuralScreening";

export type IngestionDecision =
    | { store: true; status: "uploaded" | typeof QUARANTINED_DOCUMENT_STATUS; screening: Record<string, unknown>; result: ScreeningResult }
    | { store: false; result: Extract<ScreeningResult, { verdict: "refuse" }>; message: string };

const REFUSAL_MESSAGE: Record<"type_mismatch" | "corrupt" | "unsupported", string> = {
    type_mismatch: "This file is not the type it claims to be.",
    corrupt: "This file is damaged or incomplete and could not be read.",
    unsupported: "This type of file is not accepted.",
};

export function decideIngestion(bytes: Uint8Array, kind: DocumentContentKind, at: Date = new Date()): IngestionDecision {
    const result = screenDocumentBytes(bytes, kind);
    if (result.verdict === "refuse") return { store: false, result, message: REFUSAL_MESSAGE[result.reason] };
    return {
        store: true,
        status: result.verdict === "quarantine" ? QUARANTINED_DOCUMENT_STATUS : "uploaded",
        screening: screeningMetadata(result, at),
        result,
    };
}

/**
 * Record a quarantine. Best-effort by design: the document is already unreachable (its status is the control), so an
 * audit write failure never makes it available. It is logged instead.
 */
export async function auditQuarantine(input: {
    orgId: string;
    actor: string;
    documentId: string;
    decision: Extract<IngestionDecision, { store: true }>;
    route: string;
}): Promise<void> {
    if (input.decision.status !== QUARANTINED_DOCUMENT_STATUS) return;
    const r = input.decision.result;
    await recordDocumentAudit({
        orgId: input.orgId,
        actorUserId: input.actor,
        event: "document_quarantined",
        subject: { type: "documents", id: input.documentId },
        route: input.route,
        detail: {
            engine: r.engine,
            kind: r.kind,
            reason: r.verdict === "quarantine" ? r.reason : null,
            findings: r.verdict === "quarantine" ? r.findings : [],
        },
    });
}
