/**
 * POS Documents tab — pure list model.
 *
 * Joins uploaded document rows with their Processing Case (via the polymorphic
 * `processing_case_sources` primary link) so the operator can see, per document:
 * filename/title, upload time, classification, and linked Processing Case status.
 * Pure + deterministic — the route supplies the three already-fetched arrays.
 *
 * Read-only projection. No record writes, no matching, no commit.
 */

export interface PosDocumentRow {
    id: string;
    title: string | null;
    original_filename: string | null;
    doc_type: string | null;
    created_at: string | null;
}

/** Primary document source link: which case a document opened. */
export interface PosDocumentCaseLink {
    document_id: string;
    processing_case_id: string;
}

export interface PosDocumentCaseInfo {
    id: string;
    status: string;
    /** Classification key (from `processing_cases.case_type`); null when unclassified. */
    classification_key: string | null;
}

export interface PosDocumentListItem {
    documentId: string;
    label: string;
    uploadedAt: string | null;
    docType: string | null;
    processingCaseId: string | null;
    caseStatus: string | null;
    classificationKey: string | null;
}

function documentLabel(doc: PosDocumentRow): string {
    return (
        (doc.title && doc.title.trim()) ||
        (doc.original_filename && doc.original_filename.trim()) ||
        "Untitled document"
    );
}

export function buildPosDocumentsList(
    docs: PosDocumentRow[],
    links: PosDocumentCaseLink[],
    cases: PosDocumentCaseInfo[]
): PosDocumentListItem[] {
    const caseByDoc = new Map<string, string>();
    for (const l of links) caseByDoc.set(l.document_id, l.processing_case_id);
    const caseById = new Map<string, PosDocumentCaseInfo>();
    for (const c of cases) caseById.set(c.id, c);

    return docs.map((doc) => {
        const caseId = caseByDoc.get(doc.id) ?? null;
        const info = caseId ? caseById.get(caseId) ?? null : null;
        return {
            documentId: doc.id,
            label: documentLabel(doc),
            uploadedAt: doc.created_at,
            docType: doc.doc_type,
            processingCaseId: caseId,
            caseStatus: info?.status ?? null,
            classificationKey: info?.classification_key ?? null,
        };
    });
}
