import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    applyConfiguredStageRulesForDomainSignal,
    applyConfiguredStageRulesForStatusEntry,
} from "@/lib/lifecycle/applyConfiguredStageAutomationRules";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const opportunityId = "55555555-5555-4555-8555-555555555555";

const mockResolveDept = vi.fn();
const mockApplyTarget = vi.fn();

vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: (...args: unknown[]) => mockResolveDept(...args),
}));

vi.mock("@/lib/lifecycle/stageOutcomeRuleTargetExecutor", () => ({
    applyStageOutcomeRuleTarget: (...args: unknown[]) => mockApplyTarget(...args),
}));

function tourScheduledDepartmentMetadata(): Record<string, unknown> {
    const plan = defaultStageOperatingPlanForEnrollmentStage("tour_scheduled")!;
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "s1",
                            key: "tour_scheduled",
                            label: "Tour Scheduled",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: plan,
                        },
                    ],
                },
            ],
        },
    };
}

function makeSupabase() {
    const deptMaybeSingle = vi.fn(async () => ({
        data: { metadata: tourScheduledDepartmentMetadata() },
        error: null,
    }));
    const deptEq2 = vi.fn(() => ({ maybeSingle: deptMaybeSingle }));
    const deptEq1 = vi.fn(() => ({ eq: deptEq2 }));
    const deptSelect = vi.fn(() => ({ eq: deptEq1 }));
    return {
        from: vi.fn((table: string) => {
            if (table === "departments") return { select: deptSelect };
            throw new Error(`unexpected table ${table}`);
        }),
    };
}

describe("applyConfiguredStageAutomationRules", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveDept.mockResolvedValue(departmentId);
        mockApplyTarget.mockResolvedValue({ needs_attention: true });
    });

    it("creates no-show attention from configured when_enter_status_key rule", async () => {
        const supabase = makeSupabase();
        const result = await applyConfiguredStageRulesForStatusEntry({
            supabase: supabase as never,
            orgId,
            opportunityId,
            nextStatusKey: "tour_no_show",
            actorUserId: userId,
        });

        expect(result.needs_attention_set).toBe(true);
        expect(result.applied_rule_keys).toContain("status_tour_no_show_attention");
        expect(mockApplyTarget).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({
                target: expect.objectContaining({
                    kind: "create_needs_attention",
                    attention_reason: "Tour no-show — follow up required",
                }),
            }),
        );
    });

    it("creates cancel attention from configured when_domain_signal rule", async () => {
        const supabase = makeSupabase();
        const result = await applyConfiguredStageRulesForDomainSignal({
            supabase: supabase as never,
            orgId,
            opportunityId,
            domain: "tour_booking",
            signal: "canceled",
            actorUserId: userId,
        });

        expect(result.needs_attention_set).toBe(true);
        expect(result.applied_rule_keys).toContain("domain_tour_booking_canceled_attention");
        expect(mockApplyTarget).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({
                target: expect.objectContaining({
                    kind: "create_needs_attention",
                    attention_reason: "Tour canceled — follow up required",
                }),
            }),
        );
    });

    it("does not match unrelated status keys", async () => {
        const supabase = makeSupabase();
        const result = await applyConfiguredStageRulesForStatusEntry({
            supabase: supabase as never,
            orgId,
            opportunityId,
            nextStatusKey: "tour_completed",
            actorUserId: userId,
        });

        expect(result.applied_rule_keys).toEqual([]);
        expect(mockApplyTarget).not.toHaveBeenCalled();
    });
});
