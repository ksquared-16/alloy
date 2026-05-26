import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PacketReviewRollupView } from "@/components/forms/packets/PacketReviewRollupView";
import { CaseFileSection } from "@/components/forms/review/CaseFileSection";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

describe("PX-2 packet review surfaces", () => {
    it("renders case-file canvas with region separators", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain('data-testid="intake-case-file-layout"');
        expect(html).toContain('data-case-file-canvas="page"');
        expect(html).toContain("bg-alloy-stone/30");
        expect(html).toContain('data-case-file-region="bos-summary"');
    });

    it("groups submitted forms in a single list surface", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain('data-testid="submitted-forms-list"');
        expect(html).toContain('data-testid="submitted-forms-region"');
        expect(html).not.toContain("border-admin-border/80 bg-white px-3 py-3");
    });

    it("groups what-changed warnings without per-row card borders", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain('data-testid="what-changed-list"');
        expect(html).not.toContain("border-admin-border/60 bg-white px-2.5 py-2");
    });

    it("groups needs-attention items in one surface", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain('data-testid="needs-attention-list"');
        expect(html).not.toContain("rounded-md border border-alloy-ember/25 bg-white");
    });

    it("CaseFileSection defaults to band layout without card border", () => {
        const html = renderToStaticMarkup(
            <CaseFileSection title="Test region" variant="context">
                <p>Body</p>
            </CaseFileSection>
        );
        expect(html).toContain('data-case-file-layout="band"');
        expect(html).toContain("ring-alloy-blue/12");
        expect(html).not.toMatch(/rounded-lg border px-4 py-3/);
    });

    it("BOS assist uses intelligence band treatment", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain("border-l-alloy-blue/40");
        expect(html).toContain("from-white");
    });
});
