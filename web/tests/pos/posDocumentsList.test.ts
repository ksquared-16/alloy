/**
 * POS Documents tab list model — proves the data model the panel renders:
 * each uploaded document carries its classification + linked Processing Case status,
 * entity-less (POS intake) docs are included, and unlinked docs are honest.
 */

import { describe, it, expect } from "vitest";
import {
    buildPosDocumentsList,
    type PosDocumentCaseInfo,
    type PosDocumentCaseLink,
    type PosDocumentRow,
} from "@/lib/pos/posDocumentsList";

const docs: PosDocumentRow[] = [
    { id: "doc-1", title: "Subsidy Contract", original_filename: "subsidy.pdf", doc_type: null, created_at: "2026-06-17T10:00:00Z" },
    { id: "doc-2", title: null, original_filename: "scan_002.pdf", doc_type: "scan", created_at: "2026-06-17T09:00:00Z" },
    { id: "doc-3", title: null, original_filename: null, doc_type: null, created_at: null },
];
const links: PosDocumentCaseLink[] = [
    { document_id: "doc-1", processing_case_id: "case-1" },
    { document_id: "doc-2", processing_case_id: "case-2" },
];
const cases: PosDocumentCaseInfo[] = [
    { id: "case-1", status: "received", classification_key: "subsidy_contract" },
    { id: "case-2", status: "needs_review", classification_key: null },
];

describe("buildPosDocumentsList", () => {
    it("joins each document to its case (classification + status)", () => {
        const list = buildPosDocumentsList(docs, links, cases);
        const byId = Object.fromEntries(list.map((d) => [d.documentId, d]));
        expect(byId["doc-1"]).toMatchObject({
            label: "Subsidy Contract",
            uploadedAt: "2026-06-17T10:00:00Z",
            processingCaseId: "case-1",
            caseStatus: "received",
            classificationKey: "subsidy_contract",
        });
        expect(byId["doc-2"]).toMatchObject({
            label: "scan_002.pdf",
            processingCaseId: "case-2",
            caseStatus: "needs_review",
            classificationKey: null,
        });
    });

    it("falls back to filename then 'Untitled document' for the label", () => {
        const list = buildPosDocumentsList(docs, links, cases);
        expect(list.find((d) => d.documentId === "doc-2")?.label).toBe("scan_002.pdf");
        expect(list.find((d) => d.documentId === "doc-3")?.label).toBe("Untitled document");
    });

    it("a document with no case link is honest (no fabricated case/classification)", () => {
        const list = buildPosDocumentsList(docs, links, cases);
        const d3 = list.find((d) => d.documentId === "doc-3")!;
        expect(d3.processingCaseId).toBeNull();
        expect(d3.caseStatus).toBeNull();
        expect(d3.classificationKey).toBeNull();
    });

    it("preserves input order and length", () => {
        const list = buildPosDocumentsList(docs, links, cases);
        expect(list.map((d) => d.documentId)).toEqual(["doc-1", "doc-2", "doc-3"]);
    });
});
