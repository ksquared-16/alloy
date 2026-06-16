import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeStageOperatingOutcome } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

const mockInstantiate = vi.fn();

vi.mock("@/lib/admin/operationalWork/instantiateWorkFromDefinition", () => ({
    instantiateWorkFromDefinition: (...args: unknown[]) => mockInstantiate(...args),
}));

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: (...args: unknown[]) => mockInstantiate(...args),
}));

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
    beforeEach(() => {
        vi.clearAllMocks();
    });

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

    it("create_next_work uses shared stage work instantiation with idempotency", async () => {
        mockInstantiate.mockResolvedValue({ status: "created", work_id: "work-1" });
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour")!;
        plan.outcome_rules = [
            {
                rule_key: "spawn_outcome_work",
                when_outcome_key: "tour_completed",
                targets: [{ kind: "create_next_work", template_key: "record_tour_outcome_work" }],
            },
        ];

        const result = await executeStageOperatingOutcome({
            supabase: { from: vi.fn() } as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "tour_completed",
            subject: {
                journey_segment: "family",
                opportunity_id: "opp-1",
            },
        });

        expect(result.errors).toEqual([]);
        expect(mockInstantiate).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: "org-1",
                opportunityId: "opp-1",
                stageKey: "tour",
                departmentId: "dept-1",
                template: expect.objectContaining({
                    template_key: "record_tour_outcome_work",
                    work_definition_key: "record_tour_outcome",
                }),
            }),
        );
    });

    it("create_next_work dedupes repeated outcome execution", async () => {
        mockInstantiate.mockResolvedValue({ status: "deduped", work_id: "work-existing" });
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour")!;
        plan.outcome_rules = [
            {
                rule_key: "spawn_outcome_work",
                when_outcome_key: "tour_completed",
                targets: [{ kind: "create_next_work", template_key: "record_tour_outcome_work" }],
            },
        ];

        const result = await executeStageOperatingOutcome({
            supabase: { from: vi.fn() } as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            plan,
            outcomeKey: "tour_completed",
            subject: {
                journey_segment: "family",
                opportunity_id: "opp-1",
            },
        });

        expect(result.errors).toEqual([]);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
    });
});
