/**
 * D5 — Processing → Work → Documents: the filing PROPOSAL a document case carries, and the queue lane derived from it.
 *
 * The proposal lives on the case (`processing_cases.metadata.document_filing`) — the existing Processing case spine.
 * There is no second queue table and no Work Items row: the lane is DERIVED, every read, from the case, its document
 * and the organization's published Studio types. Filing itself is the Documents command
 * (`lib/documents/filing/documentFiling.ts`), called by the case's approval.
 *
 * Pure and client-safe: no server imports.
 */

export const DOCUMENT_FILING_LANES = ["unclassified", "awaiting_subject", "awaiting_review", "ready", "filing_error", "filed"] as const;
export type DocumentFilingLane = (typeof DOCUMENT_FILING_LANES)[number];

export const DOCUMENT_FILING_LANE_LABEL: Record<DocumentFilingLane, string> = {
    unclassified: "Unclassified",
    awaiting_subject: "Needs a record",
    awaiting_review: "Needs review",
    ready: "Ready to file",
    filing_error: "Filing errors",
    filed: "Filed",
};

export const DOCUMENT_FILING_ACTION: Record<DocumentFilingLane, string> = {
    unclassified: "Choose the document type",
    awaiting_subject: "Choose the record it belongs to",
    awaiting_review: "Review the document",
    ready: "File the document",
    filing_error: "Resolve the error and retry",
    filed: "No action",
};

export type FilingSubjectType = "household" | "person" | "child" | "opportunity" | "vendor";
export type ProposalSubject = { subject_type: FilingSubjectType; subject_id: string; label?: string | null };

export type DocumentFilingProposal = {
    mode: "new_document" | "new_version";
    doc_type: string | null;
    /** Who set the type: the operator, or the deterministic classifier's suggestion the operator accepted. */
    doc_type_source: "operator" | "suggested" | null;
    primary: ProposalSubject | null;
    contexts: ProposalSubject[];
    target_document_id: string | null;
    review_accepted: boolean;
    sensitivity: string | null;
    /** The household the operator chose the record from (UI context only; filing re-resolves everything). */
    household_id: string | null;
    updated_at: string | null;
    updated_by: string | null;
    last_error: { code: string; message: string; at: string } | null;
    attempts: number;
};

export const EMPTY_PROPOSAL: DocumentFilingProposal = Object.freeze({
    mode: "new_document",
    doc_type: null,
    doc_type_source: null,
    primary: null,
    contexts: [],
    target_document_id: null,
    review_accepted: false,
    sensitivity: null,
    household_id: null,
    updated_at: null,
    updated_by: null,
    last_error: null,
    attempts: 0,
}) as DocumentFilingProposal;

const SUBJECT_TYPES: readonly string[] = ["household", "person", "child", "opportunity", "vendor"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVITIES: readonly string[] = ["standard", "personal_identity", "medical", "custody_safeguarding", "restricted"];

function subject(v: unknown): ProposalSubject | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.subject_type !== "string" || !SUBJECT_TYPES.includes(o.subject_type)) return null;
    if (typeof o.subject_id !== "string" || !UUID_RE.test(o.subject_id)) return null;
    return { subject_type: o.subject_type as FilingSubjectType, subject_id: o.subject_id, label: typeof o.label === "string" ? o.label.slice(0, 200) : null };
}

/** Read a stored (or submitted) proposal, dropping anything malformed. */
export function readDocumentFilingProposal(raw: unknown): DocumentFilingProposal {
    if (!raw || typeof raw !== "object") return { ...EMPTY_PROPOSAL, contexts: [] };
    const o = raw as Record<string, unknown>;
    const primary = subject(o.primary);
    const contexts = (Array.isArray(o.contexts) ? o.contexts : [])
        .map(subject)
        .filter((s): s is ProposalSubject => s !== null && s.subject_type !== "vendor")
        .filter((s) => !(primary && s.subject_type === primary.subject_type && s.subject_id === primary.subject_id))
        .slice(0, 12);
    const err = o.last_error && typeof o.last_error === "object" ? (o.last_error as Record<string, unknown>) : null;
    return {
        mode: o.mode === "new_version" ? "new_version" : "new_document",
        doc_type: typeof o.doc_type === "string" && /^[a-z][a-z0-9_]{1,62}$/.test(o.doc_type) ? o.doc_type : null,
        doc_type_source: o.doc_type_source === "suggested" ? "suggested" : o.doc_type_source === "operator" ? "operator" : null,
        primary,
        contexts,
        target_document_id: typeof o.target_document_id === "string" && UUID_RE.test(o.target_document_id) ? o.target_document_id : null,
        review_accepted: o.review_accepted === true,
        sensitivity: typeof o.sensitivity === "string" && SENSITIVITIES.includes(o.sensitivity) ? o.sensitivity : null,
        household_id: typeof o.household_id === "string" && UUID_RE.test(o.household_id) ? o.household_id : null,
        updated_at: typeof o.updated_at === "string" ? o.updated_at : null,
        updated_by: typeof o.updated_by === "string" ? o.updated_by : null,
        last_error:
            err && typeof err.code === "string" ? { code: err.code, message: typeof err.message === "string" ? err.message : "", at: typeof err.at === "string" ? err.at : "" } : null,
        attempts: typeof o.attempts === "number" && o.attempts >= 0 ? Math.floor(o.attempts) : 0,
    };
}

/** The type facts the lane needs (a published Studio type). */
export type LaneTypeFacts = { review_required: boolean } | null;

/**
 * The queue lane. Order matters: a filed case is filed; an error is shown until the operator changes the proposal or
 * retries; then the first thing still missing.
 */
export function deriveDocumentFilingLane(input: {
    caseStatus: string;
    filed: boolean;
    proposal: DocumentFilingProposal;
    publishedType: LaneTypeFacts;
}): DocumentFilingLane {
    const p = input.proposal;
    if (input.filed) return "filed";
    if (p.last_error) return "filing_error";
    if (p.mode === "new_version") {
        if (!p.target_document_id) return "awaiting_subject";
    } else {
        if (!p.doc_type || !input.publishedType) return "unclassified";
        if (!p.primary) return "awaiting_subject";
    }
    if (input.publishedType?.review_required && !p.review_accepted) return "awaiting_review";
    return "ready";
}

/**
 * Which document cases belong to the Documents queue. A document uploaded to STORE or PROCESS is customer paperwork;
 * one uploaded to GENERATE a form or as a packet source is a form template and stays in the forms flow — unless an
 * operator has started filing it (a proposal exists).
 */
export function isFilingIntent(intent: string | null | undefined, hasProposal: boolean): boolean {
    if (hasProposal) return true;
    return intent === "store_document" || intent === "process_information";
}

export const DOCUMENT_SOURCE_KINDS: readonly string[] = ["document", "upload", "recreated_document"];

/** The deterministic idempotency key a case files its document under. A retry of the same case replays. */
export function processingFilingKey(caseId: string, documentId: string): string {
    return `processing_case:${caseId}:document:${documentId}`;
}
