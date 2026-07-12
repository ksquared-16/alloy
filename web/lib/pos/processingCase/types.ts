/**
 * POS-FP1 — Processing Case envelope types (conceptual, thin).
 *
 * The Processing Case references sources; it never absorbs source data and holds
 * no canonical record truth. POS owns only the lifecycle status here (review /
 * resolution / outcome state are later packages).
 */

/** POS-internal lifecycle (distinct from CRM status and Lifecycle stages). FP1 only ever sets `received`. */
export type ProcessingCaseStatus =
    | "received"
    | "processing"
    | "needs_review"
    | "needs_resolution"
    | "ready"
    | "completed"
    | "archived";

/** Source taxonomy (POS-02). FP1 opens cases from form/packet; others are later on-ramps. */
export type ProcessingCaseSourceKind =
    | "form_submission"
    | "form_packet_session"
    | "document"
    | "upload"
    | "email_attachment"
    | "import"
    | "recreated_document"
    | "create_lead";

export type ProcessingCaseSourceRole = "primary" | "related";

/**
 * Storage operations the envelope service depends on. Injected so the service's
 * orchestration (idempotency, one-primary) is unit-testable without a database.
 * The production implementation lives in `processingCaseDb.ts`.
 */
export interface ProcessingCaseDeps {
    findCaseIdByPrimarySource(args: {
        orgId: string;
        sourceKind: ProcessingCaseSourceKind;
        sourceId: string;
    }): Promise<string | null>;
    insertCase(args: { orgId: string; status: ProcessingCaseStatus; caseType: string | null }): Promise<{ id: string }>;
    insertSource(args: {
        orgId: string;
        processingCaseId: string;
        sourceKind: ProcessingCaseSourceKind;
        sourceId: string;
        role: ProcessingCaseSourceRole;
    }): Promise<void>;
}
