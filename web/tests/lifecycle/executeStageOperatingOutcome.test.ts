import { describe, expect, it, vi } from "vitest";
import { executeStageOperatingOutcome } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: vi.fn(async () => ({
        error: null,
        before: { outcome_status_key: "waitlisted" },
        after: { id: "ocm-1", outcome_status_key: "offer_pending" },
        eventEmitted: true,
    })),
}));

describe("executeStageOperatingOutcome", () => {
    it("updates child enrollment disposition for child journey stage", async () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("waitlist")!;
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                update: vi.fn().mockReturnThis(),
                single: vi.fn(async () => ({ data: {}, error: null })),
            })),
        };

        const { updateOpportunityCustomerMemberLifecycleStatus } = await import(
            "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus"
        );

        const result = await executeStageOperatingOutcome({
            supabase: supabase as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "spot_offered",
            subject: {
                journey_segment: "child",
                opportunity_id: "opp-1",
                opportunity_customer_member_id: "ocm-1",
            },
        });

        expect(result.errors).toEqual([]);
        expect(updateOpportunityCustomerMemberLifecycleStatus).toHaveBeenCalled();
        expect(result.status_updated).toBe(true);
    });
});
