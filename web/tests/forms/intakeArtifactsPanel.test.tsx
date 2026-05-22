import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactsPanel } from "@/components/forms/review/ArtifactsPanel";
import { DocumentsRecordsPanel } from "@/components/forms/review/DocumentsRecordsPanel";
import { FormsProvenanceDetail } from "@/components/forms/review/FormsProvenanceDetail";
import {
    INTAKE_ARTIFACT_CURRENTNESS_LEGEND,
    resolveIntakeDocumentsEmptyState,
} from "@/lib/forms/review/intakeArtifactPresentation";
import type { PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { generationLabelDisplay } from "@/lib/forms/packets/documentProvenanceDisplay";

const provenance = {
    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    form_name: "Guardian PDF Form",
    form_definition_version_id: "45454545-4545-4545-8545-454545454545",
    version_number: 2,
    form_submission_id: "23232323-2323-4232-8232-232323232323",
    submission_submitted_at: "2026-05-01T10:00:00.000Z",
    generated_at: "2026-05-01T12:00:00.000Z",
    template_key: null,
    idempotency_key: null,
    generation_label: "current" as const,
};

const indexEntries: PacketReviewDocumentIndexEntryV1[] = [
    {
        kind: "generated_pdf",
        step_sequence_index: 0,
        form_name: "Guardian PDF Form",
        form_submission_id: "23232323-2323-4232-8232-232323232323",
        document_id: "67676767-6767-4767-8767-676767676767",
        title: "guardian.pdf",
        provenance,
        admin_links: {
            submission_path: "/admin/forms/fd/submissions/sub-pdf",
            packet_session_path: "/adminV2/forms/packets/sess-1",
        },
    },
    {
        kind: "submitted_record",
        step_sequence_index: 1,
        form_name: "Acknowledgement",
        form_submission_id: "34343434-3434-4343-8343-343434343434",
        document_id: null,
        title: "Acknowledgement",
        provenance: { ...provenance, form_name: "Acknowledgement", generated_at: null },
        admin_links: {
            submission_path: "/admin/forms/fd/submissions/sub-ack",
            packet_session_path: "/adminV2/forms/packets/sess-1",
        },
    },
];

describe("ArtifactsPanel UX-F", () => {
    it("groups generated PDFs before submitted records", () => {
        const html = renderToStaticMarkup(
            <ArtifactsPanel documentsIndex={indexEntries} onOpenPdf={() => {}} />
        );
        const pdfGroup = html.indexOf('data-testid="artifact-group-generated_pdf"');
        const recGroup = html.indexOf('data-testid="artifact-group-submitted_record"');
        expect(pdfGroup).toBeGreaterThan(0);
        expect(recGroup).toBeGreaterThan(pdfGroup);
        expect(html).toContain("Generated PDFs");
        expect(html).toContain("Submitted records");
    });

    it("renders kind as text labels and structured provenance (single currentness chip)", () => {
        const html = renderToStaticMarkup(
            <ArtifactsPanel documentsIndex={indexEntries} onOpenPdf={() => {}} />
        );
        expect(html).toContain("Submitted form record");
        expect(html).toContain('data-testid="forms-provenance-detail"');
        expect(html).toContain("From Guardian PDF Form");
        expect(html).toContain("font-medium uppercase tracking-wide");
        expect(html).toContain(">Current PDF</span>");
    });

    it("shows currentness legend when PDFs have generation_label", () => {
        const html = renderToStaticMarkup(
            <ArtifactsPanel documentsIndex={indexEntries} onOpenPdf={() => {}} />
        );
        expect(html).toContain(INTAKE_ARTIFACT_CURRENTNESS_LEGEND);
        expect(html).toContain('data-testid="artifact-currentness-legend"');
    });

    it("renders intentional empty state", () => {
        const html = renderToStaticMarkup(<ArtifactsPanel documentsIndex={[]} />);
        const empty = resolveIntakeDocumentsEmptyState({ total: 0, pdfCount: 0, recordCount: 0 });
        expect(html).toContain(empty.message);
        expect(html).toContain('data-empty-state="none"');
    });

    it("renders pending generation empty copy", () => {
        const html = renderToStaticMarkup(
            <ArtifactsPanel documentsIndex={[]} pendingPdfGeneration />
        );
        expect(html).toContain("Generated PDFs will appear");
        expect(html).toContain('data-empty-state="pending_generation"');
    });

    it("DocumentsRecordsPanel wires ArtifactsPanel in documents region", () => {
        const html = renderToStaticMarkup(
            <DocumentsRecordsPanel
                documentsIndex={indexEntries}
                openingDocId={null}
                onOpenPdf={() => {}}
            />
        );
        expect(html).toContain('id="documents-records"');
        expect(html).toContain('data-testid="intake-artifacts-panel"');
        expect(html).toContain("Open PDF");
        expect(html).toContain("View submission");
    });
});

describe("FormsProvenanceDetail", () => {
    it("shows origin, version, timing, and currentness chip", () => {
        const html = renderToStaticMarkup(<FormsProvenanceDetail provenance={provenance} />);
        expect(html).toContain("From Guardian PDF Form");
        expect(html).toContain("Version 2");
        expect(html).toContain("Submitted");
        expect(html).toContain("Generated");
        expect(html).toContain("Current PDF");
    });

    it("uses fallback line when provenance object missing", () => {
        const html = renderToStaticMarkup(
            <FormsProvenanceDetail fallbackLine="From Acknowledgement · v1 · submitted 5/1/2026" />
        );
        expect(html).toContain('data-testid="forms-provenance-fallback"');
        expect(html).toContain("From Acknowledgement");
    });
});

describe("generationLabelDisplay", () => {
    it("uses operator-facing currentness labels", () => {
        expect(generationLabelDisplay("current")).toBe("Current PDF");
        expect(generationLabelDisplay("also_generated")).toBe("Earlier PDF");
    });
});
