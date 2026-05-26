import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPacketReviewInsightV1 } from "@/lib/forms/packets/buildPacketReviewInsightV1";
import { BosReviewSummaryPlaceholder } from "@/components/forms/review/BosReviewSummaryPlaceholder";
import { PacketReviewRollupView } from "@/components/forms/packets/PacketReviewRollupView";
import { CASE_FILE_SECTION_ORDER } from "@/lib/forms/review/formsReviewPresentation";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

describe("BosReviewSummaryPlaceholder UX-H", () => {
    it("renders structured assist sections with readiness from rollup", () => {
        const html = renderToStaticMarkup(<BosReviewSummaryPlaceholder rollup={fixtureRollup()} />);
        expect(html).toContain('data-testid="bos-review-summary-placeholder"');
        expect(html).toContain('id="bos-review-summary"');
        expect(html).toContain('data-bos-readiness="needs_attention"');
        expect(html).toContain('data-testid="bos-readiness-badge"');
        expect(html).toContain("Needs attention");
        expect(html).toContain('data-testid="bos-review-summary"');
        expect(html).toContain('data-testid="bos-key-changes"');
        expect(html).toContain('data-testid="bos-attention-items"');
        expect(html).toContain('data-testid="bos-suggested-focus"');
        expect(html).toContain('data-testid="bos-action-guidance"');
        expect(html).toContain('data-testid="bos-human-authority-note"');
        expect(html).toContain("nothing applies automatically");
    });

    it("places BOS region early in case-file order (before what changed)", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        const bos = html.indexOf('id="bos-review-summary"');
        const changed = html.indexOf('id="what-changed"');
        expect(bos).toBeGreaterThan(0);
        expect(changed).toBeGreaterThan(bos);
        const bosOrder = CASE_FILE_SECTION_ORDER.indexOf("bos-review-summary");
        const changedOrder = CASE_FILE_SECTION_ORDER.indexOf("what-changed");
        expect(bosOrder).toBeLessThan(changedOrder);
    });

    it("shows loading state without implying AI", () => {
        const html = renderToStaticMarkup(
            <BosReviewSummaryPlaceholder rollup={fixtureRollup()} loading />
        );
        expect(html).toContain('data-testid="bos-review-loading"');
        expect(html).not.toContain('data-testid="bos-review-summary"');
    });

    it("renders P2-5 insight content when insight prop provided", () => {
        const insight = buildPacketReviewInsightV1(fixtureRollup());
        const html = renderToStaticMarkup(<BosReviewSummaryPlaceholder insight={insight} />);
        expect(html).toContain('data-bos-source="insight"');
        expect(html).toContain('data-testid="bos-review-checklist"');
        expect(html).toContain("Review confidence");
        expect(html).toContain('data-testid="bos-confidence-notes"');
        expect(html).toContain("submitted form record on file");
    });

    it("falls back to rollup assist when insight not provided", () => {
        const html = renderToStaticMarkup(<BosReviewSummaryPlaceholder rollup={fixtureRollup()} />);
        expect(html).toContain('data-bos-source="rollup"');
        expect(html).toContain('data-testid="bos-human-authority-note"');
    });

    it("renders empty subsection copy when no warnings", () => {
        const rollup = fixtureRollup();
        const clean = {
            ...rollup,
            operator_review: { ...rollup.operator_review, warnings: [] },
            linkage_summary: {
                any_intake_needs_review: false,
                steps_missing_crm_fk: 0,
                steps: [],
            },
            steps: rollup.steps.map((s) => ({
                ...s,
                intake_meta: { intake_needs_review: false, intake_review_reason: null, intake_resolution_path: null },
            })),
        };
        const html = renderToStaticMarkup(<BosReviewSummaryPlaceholder rollup={clean} />);
        expect(html).toContain("No differences flagged from known records.");
        expect(html).toContain("No linkage or intake flags need action.");
        expect(html).toContain('data-bos-readiness="ready_for_review"');
    });
});
