import { describe, expect, it, vi } from "vitest";
import { filterOpportunityActionsForRuntimeGates } from "@/lib/admin/actions/filterOpportunityActionsForRuntimeGates";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";

vi.mock("@/lib/admin/drawer/drawerHeaderAttentionPresentation", () => ({
    opportunityHasReviewableEnrollmentPacket: vi.fn(),
}));

import { opportunityHasReviewableEnrollmentPacket } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";

const mockHasReviewable = vi.mocked(opportunityHasReviewableEnrollmentPacket);

const supabase = {} as Parameters<typeof filterOpportunityActionsForRuntimeGates>[0];

const actionsWithReviewPacket: ResolvedActionsBySlot = {
    overflow: [
        { key: "review_enrollment_packet", label: "Review packet", kind: "ui_intent" } as never,
        { key: "send_email", label: "Email", kind: "ui_intent" } as never,
    ],
};

describe("filterOpportunityActionsForRuntimeGates", () => {
    it("passes through when entity is not opportunity", async () => {
        const result = await filterOpportunityActionsForRuntimeGates(
            supabase,
            "org-1",
            "person",
            "opp-1",
            actionsWithReviewPacket
        );
        expect(result).toBe(actionsWithReviewPacket);
        expect(mockHasReviewable).not.toHaveBeenCalled();
    });

    it("passes through when review packet not in resolved actions", async () => {
        const actions: ResolvedActionsBySlot = {
            overflow: [{ key: "send_email", label: "Email", kind: "ui_intent" } as never],
        };
        const result = await filterOpportunityActionsForRuntimeGates(
            supabase,
            "org-1",
            "opportunity",
            "opp-1",
            actions
        );
        expect(result).toBe(actions);
        expect(mockHasReviewable).not.toHaveBeenCalled();
    });

    it("strips review_enrollment_packet when no reviewable packet exists", async () => {
        mockHasReviewable.mockResolvedValueOnce(false);
        const result = await filterOpportunityActionsForRuntimeGates(
            supabase,
            "org-1",
            "opportunity",
            "opp-1",
            actionsWithReviewPacket
        );
        expect(mockHasReviewable).toHaveBeenCalledWith(supabase, "org-1", "opp-1");
        expect(result.overflow?.map((a) => a.key)).toEqual(["send_email"]);
    });

    it("keeps review_enrollment_packet when reviewable packet exists", async () => {
        mockHasReviewable.mockResolvedValueOnce(true);
        const result = await filterOpportunityActionsForRuntimeGates(
            supabase,
            "org-1",
            "opportunities",
            "opp-1",
            actionsWithReviewPacket
        );
        expect(result.overflow?.map((a) => a.key)).toContain("review_enrollment_packet");
    });
});
