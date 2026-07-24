import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const workId = "44444444-4444-4444-8444-444444444444";
const opportunityId = "55555555-5555-4555-8555-555555555555";

const mockCompleteWorkInstance = vi.fn();
const mockPatchAttemptMetadata = vi.fn();
const mockExecuteStageOperatingOutcome = vi.fn();

vi.mock("@/lib/admin/operationalWork/operationalWorkService", () => ({
    completeWorkInstance: (...args: unknown[]) => mockCompleteWorkInstance(...args),
}));

vi.mock("@/lib/lifecycle/patchLifecycleWorkIntentAttemptMetadata", () => ({
    patchLifecycleWorkIntentAttemptMetadata: (...args: unknown[]) => mockPatchAttemptMetadata(...args),
}));

vi.mock("@/lib/lifecycle/reopenStageWorkWithDueDate", () => ({
    reopenStageWorkWithDueDate: vi.fn(async () => ({ ok: true, due_at: new Date().toISOString() })),
}));

const mockRecordContactOutcomeTrace = vi.fn(async () => ({ logged: true }) as { logged: boolean; error?: string });

vi.mock("@/lib/lifecycle/recordStageWorkContactOutcomeTrace", () => ({
    recordStageWorkContactOutcomeTrace: (...args: unknown[]) => mockRecordContactOutcomeTrace(...(args as [])),
}));

const mockRollbackStageOperatingOutcome = vi.fn(async () => [] as string[]);

vi.mock("@/lib/lifecycle/executeStageOperatingOutcome", () => ({
    executeStageOperatingOutcome: (...args: unknown[]) => mockExecuteStageOperatingOutcome(...args),
    rollbackStageOperatingOutcome: (...args: unknown[]) => mockRollbackStageOperatingOutcome(...(args as [])),
}));

function departmentMetadataWithPlan(plan: StageOperatingPlanV1): Record<string, unknown> {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-enrollment",
            processes: [
                {
                    id: "proc-enrollment",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "stage-lead",
                            key: plan.stage_key,
                            label: "Lead",
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

/**
 * The work row the transaction snapshots before the persist step and restores on rollback.
 */
const workRowSnapshot = { status: "open", due_at: null, metadata: {} };

function makeSupabase(metadata: Record<string, unknown>) {
    return {
        from: vi.fn((table: string) => {
            if (table === "departments") {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn(async () => ({ data: { metadata }, error: null })),
                };
            }
            if (table === "operational_tasks") {
                return {
                    select: vi.fn().mockReturnThis(),
                    update: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn(async () => ({ data: { ...workRowSnapshot }, error: null })),
                    then: undefined,
                };
            }
            throw new Error(`unexpected table ${table}`);
        }),
    };
}

const baseInput = {
    supabase: makeSupabase(departmentMetadataWithPlan(defaultStageOperatingPlanForEnrollmentStage("lead")!)) as never,
    orgId,
    userId,
    departmentId,
    stageKey: "lead",
    workId,
    subject: {
        journey_segment: "family" as const,
        opportunity_id: opportunityId,
    },
};

describe("completeStageWorkWithOutcome", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCompleteWorkInstance.mockResolvedValue({ ok: true, row: { id: workId, status: "completed" } });
        mockPatchAttemptMetadata.mockResolvedValue({ ok: true, attempt_count: 1 });
        mockRecordContactOutcomeTrace.mockResolvedValue({ logged: true });
        mockRollbackStageOperatingOutcome.mockResolvedValue([]);
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: opportunityId,
            needs_attention_set: false,
            status_updated: false,
        });
    });

    it("successful outcome (reached_family) closes work and executes outcome", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: opportunityId,
            needs_attention_set: false,
            status_updated: true,
        });

        const result = await completeStageWorkWithOutcome({
            ...baseInput,
            outcomeKey: "reached_family",
        });

        expect(result.ok).toBe(true);
        expect(result.work_closed).toBe(true);
        expect(mockCompleteWorkInstance).toHaveBeenCalledWith({
            supabase: baseInput.supabase,
            orgId,
            workId,
        });
        expect(mockPatchAttemptMetadata).not.toHaveBeenCalled();
        expect(mockExecuteStageOperatingOutcome).toHaveBeenCalledWith(
            expect.objectContaining({ outcomeKey: "reached_family", attemptCount: null }),
        );
    });

    it("retry outcome (left_message) keeps work open, increments attempts, executes outcome", async () => {
        mockPatchAttemptMetadata.mockResolvedValue({ ok: true, attempt_count: 2 });

        const result = await completeStageWorkWithOutcome({
            ...baseInput,
            outcomeKey: "left_message",
        });

        expect(result.ok).toBe(true);
        expect(result.work_closed).toBe(false);
        expect(result.attempt_count).toBe(2);
        expect(mockCompleteWorkInstance).not.toHaveBeenCalled();
        expect(mockPatchAttemptMetadata).toHaveBeenCalledWith({
            supabase: baseInput.supabase,
            orgId,
            workId,
            outcomeKey: "left_message",
            outcomeLabel: "Left Message",
        });
        expect(mockExecuteStageOperatingOutcome).toHaveBeenCalledWith(
            expect.objectContaining({ outcomeKey: "left_message", attemptCount: 2 }),
        );
    });

    it("terminal outcome (not_interested) closes work and executes outcome", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: opportunityId,
            needs_attention_set: false,
            status_updated: true,
        });

        const result = await completeStageWorkWithOutcome({
            ...baseInput,
            outcomeKey: "not_interested",
        });

        expect(result.ok).toBe(true);
        expect(result.work_closed).toBe(true);
        expect(mockCompleteWorkInstance).toHaveBeenCalled();
        expect(mockPatchAttemptMetadata).not.toHaveBeenCalled();
        expect(mockExecuteStageOperatingOutcome).toHaveBeenCalledWith(
            expect.objectContaining({ outcomeKey: "not_interested" }),
        );
    });
});
