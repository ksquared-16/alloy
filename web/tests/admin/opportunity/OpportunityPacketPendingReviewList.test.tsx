import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpportunityPacketPendingReviewList } from "@/components/admin/opportunity/OpportunityPacketPendingReviewList";

const base = (id: string, label: string) => ({
    id,
    status: "completed" as const,
    operator_review_status: "needs_review" as const,
    packet_name: "Enrollment Packet",
    launch_context: { label },
    admin_packet_review_path: `/adminV2/forms/packets/${id}`,
    created_at: "2026-05-01T09:00:00.000Z",
    completed_at: "2026-05-01T10:00:00.000Z",
    submitted_step_count: 2,
    step_count: 2,
    operator_review_warnings: [{ message: "Hint" }],
    warning_count: 1,
});

describe("OpportunityPacketPendingReviewList", () => {
    it("renders all pending sessions with Review buttons", () => {
        const html = renderToStaticMarkup(
            <OpportunityPacketPendingReviewList
                sessions={[base("sess-a", "Child A packet"), base("sess-b", "Child B packet")]}
                onReview={vi.fn()}
            />
        );
        expect(html).toContain("2 packets need review");
        expect(html).toContain("Child A packet");
        expect(html).toContain("Child B packet");
        expect(html.match(/Review/g)?.length).toBe(2);
    });
});
