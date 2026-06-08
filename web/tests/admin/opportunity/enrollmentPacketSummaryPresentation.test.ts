import { describe, expect, it } from "vitest";

import {
    enrollmentPacketHasSummaryContext,
    enrollmentPacketReviewedHeadSession,
    enrollmentPacketSessionsPendingReview,
    enrollmentPacketSubjectLine,
} from "@/lib/admin/opportunity/enrollmentPacketSummaryPresentation";

describe("enrollmentPacketSummaryPresentation", () => {
    it("prefers launch_context.label for subject line", () => {
        expect(
            enrollmentPacketSubjectLine({
                packet_name: "Default",
                launch_context: { label: "Family inquiry — Mitchell / South Campus · Mia Mitchell" },
            })
        ).toBe("Family inquiry — Mitchell / South Campus · Mia Mitchell");
    });

    it("detects pending review sessions", () => {
        const pending = enrollmentPacketSessionsPendingReview([
            { status: "completed", operator_review_status: "needs_review" },
            { status: "draft", operator_review_status: null },
        ]);
        expect(pending).toHaveLength(1);
    });

    it("returns all pending completed sessions (0, 1, 2)", () => {
        expect(enrollmentPacketSessionsPendingReview([])).toHaveLength(0);
        expect(
            enrollmentPacketSessionsPendingReview([
                { status: "completed", operator_review_status: null },
            ])
        ).toHaveLength(1);
        const two = enrollmentPacketSessionsPendingReview([
            { status: "completed", operator_review_status: "needs_review" },
            { status: "completed", operator_review_status: "needs_correction" },
            { status: "completed", operator_review_status: "approved" },
        ]);
        expect(two).toHaveLength(2);
    });

    it("detects reviewed head session for approved display", () => {
        const head = enrollmentPacketReviewedHeadSession([
            {
                status: "completed",
                operator_review_status: "approved",
                launch_context: { label: "Packet A" },
            },
        ]);
        expect(head).not.toBeNull();
        expect(enrollmentPacketHasSummaryContext([head!])).toBe(true);
    });

    it("hasSummaryContext is false when no sessions", () => {
        expect(enrollmentPacketHasSummaryContext([])).toBe(false);
    });
});
