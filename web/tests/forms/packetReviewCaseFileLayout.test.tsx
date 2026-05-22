import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PacketReviewRollupView } from "@/components/forms/packets/PacketReviewRollupView";
import { PacketReviewActionsForm } from "@/components/forms/review/PacketReviewActionsForm";
import { CASE_FILE_SECTION_ORDER } from "@/lib/forms/review/formsReviewPresentation";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

function sectionPositions(html: string): number[] {
    return CASE_FILE_SECTION_ORDER.map((id) => html.indexOf(`id="${id}"`)).filter((i) => i >= 0);
}

describe("PacketReviewRollupView UX-D case file", () => {
    it("renders sections in target hierarchy order", () => {
        const rollup = fixtureRollup();
        const html = renderToStaticMarkup(
            <PacketReviewRollupView
                rollup={rollup}
                reviewActionsSlot={
                    <PacketReviewActionsForm
                        rollup={rollup}
                        notes=""
                        saving={false}
                        saveErr={null}
                        canMutate
                        onNotesChange={() => {}}
                        onApplyReview={() => {}}
                    />
                }
            />
        );

        const positions = sectionPositions(html);
        expect(positions.length).toBeGreaterThanOrEqual(7);
        for (let i = 1; i < positions.length; i++) {
            expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
        }
    });

    it("places review actions before technical details", () => {
        const rollup = fixtureRollup();
        const html = renderToStaticMarkup(
            <PacketReviewRollupView
                rollup={rollup}
                technicalDetails={{
                    launch_context: {},
                    crm_snapshot: {},
                    shared_values: {},
                }}
                reviewActionsSlot={
                    <PacketReviewActionsForm
                        rollup={rollup}
                        notes=""
                        saving={false}
                        saveErr={null}
                        canMutate
                        onNotesChange={() => {}}
                        onApplyReview={() => {}}
                    />
                }
            />
        );

        const actions = html.indexOf('id="review-actions"');
        const technical = html.indexOf('data-testid="forms-technical-detail-disclosure"');
        expect(actions).toBeGreaterThan(0);
        expect(technical).toBeGreaterThan(actions);
        expect(html).toContain('data-testid="case-file-review-actions"');
    });

    it("renders case header and what changed with warning badges", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain('data-testid="packet-case-file-header"');
        expect(html).toContain('id="what-changed"');
        expect(html).toContain("Differs from records");
        expect(html).toContain("Name mismatch with CRM");
        expect(html).toContain('data-testid="bos-review-summary-placeholder"');
    });

    it("renders needs attention before submitted forms", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        const attention = html.indexOf('id="needs-attention"');
        const forms = html.indexOf('id="submitted-forms"');
        expect(attention).toBeGreaterThan(0);
        expect(forms).toBeGreaterThan(attention);
    });
});
