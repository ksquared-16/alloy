import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    BosReviewSummaryPlaceholder,
    CaseFileSection,
    FormsArtifactBadge,
    FormsProvenanceLine,
    FormsReviewBadge,
    FormsReviewStatePanel,
    TechnicalDetailDisclosure,
    TechnicalDetailJsonBlock,
} from "@/components/forms/review";
import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

const provenance: DocumentProvenanceV1 = {
    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    form_name: "Guardian Form",
    form_definition_version_id: "45454545-4545-4545-8545-454545454545",
    version_number: 2,
    form_submission_id: "23232323-2323-4232-8232-232323232323",
    submission_submitted_at: "2026-05-01T10:00:00.000Z",
    generated_at: "2026-05-01T12:00:00.000Z",
    template_key: "stub",
    idempotency_key: null,
    generation_label: "current",
};

describe("forms review components", () => {
    it("CaseFileSection renders hierarchy with section id", () => {
        const html = renderToStaticMarkup(
            <CaseFileSection id="needs-attention" title="Needs attention" variant="attention">
                <p>Fix linkage on step 2.</p>
            </CaseFileSection>
        );
        expect(html).toContain('id="needs-attention"');
        expect(html).toContain("Needs attention");
        expect(html).toContain("Fix linkage");
    });

    it("FormsReviewBadge and FormsArtifactBadge render semantic tones", () => {
        const review = renderToStaticMarkup(<FormsReviewBadge label="Needs review" tone="warning" />);
        expect(review).toContain("Needs review");
        expect(review).toContain("alloy-ember");

        const artifact = renderToStaticMarkup(<FormsArtifactBadge kind="generated_pdf" />);
        expect(artifact).toContain("Generated PDF");
        expect(artifact).toContain("alloy-pine");
    });

    it("FormsProvenanceLine renders line and generation chip", () => {
        const html = renderToStaticMarkup(<FormsProvenanceLine provenance={provenance} />);
        expect(html).toContain("From Guardian Form");
        expect(html).toContain("Current generated PDF");
    });

    it("TechnicalDetailDisclosure defaults collapsed (no open attribute)", () => {
        const html = renderToStaticMarkup(
            <TechnicalDetailDisclosure>
                <TechnicalDetailJsonBlock title="Launch context" value={{ mode: "packet" }} />
            </TechnicalDetailDisclosure>
        );
        expect(html).toContain('data-testid="forms-technical-detail-disclosure"');
        expect(html).toContain("Technical details");
        expect(html).not.toMatch(/\bopen\b/);
        expect(html).toContain("Launch context");
        expect(html).toContain("packet");
    });

    it("FormsReviewStatePanel renders loading and error variants", () => {
        const loading = renderToStaticMarkup(
            <FormsReviewStatePanel variant="loading" message="Loading review case file…" />
        );
        expect(loading).toContain('data-testid="forms-review-state-loading"');
        expect(loading).toContain("Loading review");

        const empty = renderToStaticMarkup(
            <FormsReviewStatePanel variant="empty" message="No documents yet." />
        );
        expect(empty).toContain('data-testid="forms-review-state-empty"');
    });

    it("BosReviewSummaryPlaceholder reserves assist region", () => {
        const html = renderToStaticMarkup(<BosReviewSummaryPlaceholder />);
        expect(html).toContain('data-testid="bos-review-summary-placeholder"');
        expect(html).toContain("Review assist");
        expect(html).toContain("read-only");
        expect(html).not.toContain("chat");
    });
});
