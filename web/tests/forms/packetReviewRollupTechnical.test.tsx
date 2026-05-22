import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PacketReviewRollupView } from "@/components/forms/packets/PacketReviewRollupView";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

describe("PacketReviewRollupView UX-E technical disclosure", () => {
    it("renders operator warnings and hides JSON until technical disclosure", () => {
        const rollup = fixtureRollup();
        const html = renderToStaticMarkup(
            <PacketReviewRollupView
                rollup={rollup}
                technicalDetails={{
                    launch_context: { surface: "crm_opportunity" },
                    crm_snapshot: { customer_label: "Smith" },
                    shared_values: { child_first: "Ada" },
                    identifiers: {
                        packet_session_id: rollup.packet_session_id,
                        opportunity_id: rollup.enrollment_context.opportunity_id,
                    },
                }}
            />
        );

        expect(html).toContain("Needs attention");
        expect(html).toContain("What changed");
        expect(html).toContain("Documents &amp; records");
        expect(html).toContain('data-testid="forms-technical-detail-disclosure"');
        expect(html).not.toMatch(/\bopen\b/);
        expect(html).toContain("Launch context");
        expect(html).toContain("Packet session id");
        expect(html).toContain(rollup.packet_session_id);
        expect(html).toContain("Smith Family");
        const intakeEnd = html.indexOf('id="bos-review-summary"');
        expect(intakeEnd).toBeGreaterThan(0);
        expect(html.slice(0, intakeEnd)).not.toContain("22222222-2222-4222-8222-222222222222");
    });

    it("dedupes step provenance — points to documents section", () => {
        const html = renderToStaticMarkup(<PacketReviewRollupView rollup={fixtureRollup()} />);
        expect(html).toContain("Provenance and artifact types are listed under Documents");
    });
});
