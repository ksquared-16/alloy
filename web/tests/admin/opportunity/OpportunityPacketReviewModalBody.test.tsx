import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpportunityPacketReviewModalBody } from "@/components/admin/opportunity/OpportunityPacketReviewModal";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

const session = {
    id: "33333333-3333-4333-8333-333333333333",
    status: "completed",
    operator_review_status: "needs_review",
    packet_name: "Enrollment Packet",
    launch_context: { label: "Smith Family" },
    admin_packet_review_path: "/adminV2/forms/packets/33333333-3333-4333-8333-333333333333",
};

describe("OpportunityPacketReviewModalBody", () => {
    it("renders loading state safely", () => {
        const html = renderToStaticMarkup(
            <OpportunityPacketReviewModalBody
                session={session}
                rollupPhase="loading"
                rollup={null}
                rollupError={null}
                notes=""
                saving={false}
                saveErr={null}
                canMutate
                onNotesChange={vi.fn()}
                onRetryRollup={vi.fn()}
                onClose={vi.fn()}
                onApplyReview={vi.fn()}
            />
        );
        expect(html).toContain("Loading review case file");
        expect(html).not.toContain("Submitted answers by step");
    });

    it("renders error state with retry", () => {
        const html = renderToStaticMarkup(
            <OpportunityPacketReviewModalBody
                session={session}
                rollupPhase="error"
                rollup={null}
                rollupError="Network failed"
                notes=""
                saving={false}
                saveErr={null}
                canMutate
                onNotesChange={vi.fn()}
                onRetryRollup={vi.fn()}
                onClose={vi.fn()}
                onApplyReview={vi.fn()}
            />
        );
        expect(html).toContain("Network failed");
        expect(html).toContain("Retry");
    });

    it("renders rollup case file including submitted_record via PacketReviewRollupView", () => {
        const html = renderToStaticMarkup(
            <OpportunityPacketReviewModalBody
                session={session}
                rollupPhase="ready"
                rollup={fixtureRollup()}
                rollupError={null}
                notes=""
                saving={false}
                saveErr={null}
                canMutate
                onNotesChange={vi.fn()}
                onRetryRollup={vi.fn()}
                onClose={vi.fn()}
                onApplyReview={vi.fn()}
            />
        );
        expect(html).toContain("Enrollment context");
        expect(html).toContain("Submitted form record");
        expect(html).toContain("Guardian first name");
    });

    it("renders review action buttons for pending decision", () => {
        const html = renderToStaticMarkup(
            <OpportunityPacketReviewModalBody
                session={session}
                rollupPhase="ready"
                rollup={fixtureRollup()}
                rollupError={null}
                notes=""
                saving={false}
                saveErr={null}
                canMutate
                onNotesChange={vi.fn()}
                onRetryRollup={vi.fn()}
                onClose={vi.fn()}
                onApplyReview={vi.fn()}
            />
        );
        expect(html).toContain("Needs correction");
        expect(html).toContain("Reject");
        expect(html).toContain("Approve");
    });
});
