import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PacketReviewRollupView } from "@/components/forms/packets/PacketReviewRollupView";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

const reviewActionsSlot = (
    <div data-testid="review-actions">
        <h2>Operator review</h2>
        <button type="button">Needs correction</button>
        <button type="button">Reject</button>
        <button type="button">Approve</button>
    </div>
);

describe("PacketReviewRollupView", () => {
    it("renders packet context", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain("Enrollment context");
        expect(html).toContain("Enrollment Packet");
        expect(html).toContain("enrollment");
        expect(html).toContain("CRM opportunity packet link");
        expect(html).toContain("Smith Family");
        expect(html).toContain("2 of 2");
    });

    it("renders answer labels and values from rollup", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain("Submitted answers by step");
        expect(html).toContain("Guardian first name");
        expect(html).toContain("Jamie");
    });

    it("renders submitted_record artifact", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain("Submitted form record");
        expect(html).toContain("no generated PDF for this step");
        expect(html).toContain("View submission");
    });

    it("renders warnings and linkage summary", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain("Linkage summary");
        expect(html).toContain("intake / linkage review");
        expect(html).toContain("missing CRM FK");
        expect(html).toContain("Name mismatch with CRM");
        expect(html).toContain("Fix linkage");
    });

    it("renders review actions slot when provided", () => {
        const html = renderToStaticMarkup(
            <PacketReviewRollupView rollup={fixtureRollup()} reviewActionsSlot={reviewActionsSlot} />
        );
        expect(html).toContain("Operator review");
        expect(html).toContain("Needs correction");
        expect(html).toContain("Reject");
        expect(html).toContain("Approve");
    });
});
