/**
 * Authoritative Business Process runtime golden path (mocked integration).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectBuilderStageTransition } from "@/lib/lifecycle/detectBuilderStageTransition";
import { onStageEntrySpawnWorkIntent } from "@/lib/lifecycle/onStageEntrySpawnWorkIntent";
import { executeStageOperatingOutcome } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import { filterResidualOperationalTasks } from "@/lib/lifecycle/filterResidualOperationalTasks";
import { buildQueueCurrentWorkSummary } from "@/lib/workUnits/buildQueueCurrentWorkSummary";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const opportunityId = "55555555-5555-4555-8555-555555555555";

const mockResolveDept = vi.fn();
const mockInstantiate = vi.fn();
const mockUpdateStatus = vi.fn(async (_params?: unknown) => ({ error: null }));

vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: (...args: unknown[]) => mockResolveDept(...args),
}));

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: (...args: unknown[]) => mockInstantiate(...args),
}));

vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: (params: unknown) => mockUpdateStatus(params),
}));

function enrollmentDepartmentMetadata(): Record<string, unknown> {
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
                    // Real department metadata declares a grain per stage; these fixtures
                    // did not, so the grain guard correctly refused to validate a move onto a
                    // stage that says nothing about which journey it belongs to.
                    stages: [
                        { id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true, grain: "family" },
                        { id: "s2", key: "qualification", label: "Qualification", sort_order: 1, is_active: true, grain: "family" },
                        { id: "s3", key: "tour_scheduled", label: "Tour Scheduled", sort_order: 2, is_active: true, grain: "family" },
                        { id: "s4", key: "tour_completed", label: "Tour Completed", sort_order: 3, is_active: true, grain: "family" },
                        { id: "s5", key: "decision_pending", label: "Decision Pending", sort_order: 4, is_active: true, grain: "family" },
                    ],
                },
            ],
        },
    };
}

function makeSupabaseForStageEntry() {
    const deptMaybeSingle = vi.fn(async () => ({
        data: { metadata: enrollmentDepartmentMetadata() },
        error: null,
    }));
    const deptEq2 = vi.fn(() => ({ maybeSingle: deptMaybeSingle }));
    const deptEq1 = vi.fn(() => ({ eq: deptEq2 }));
    const deptSelect = vi.fn(() => ({ eq: deptEq1 }));

    const statusMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const statusEq4 = vi.fn(() => ({ maybeSingle: statusMaybeSingle }));
    const statusEq3 = vi.fn(() => ({ eq: statusEq4 }));
    const statusEq2 = vi.fn(() => ({ eq: statusEq3 }));
    const statusEq1 = vi.fn(() => ({ eq: statusEq2 }));
    const statusSelect = vi.fn(() => ({ eq: statusEq1 }));

    const from = vi.fn((table: string) => {
        if (table === "departments") return { select: deptSelect };
        if (table === "status_definitions") return { select: statusSelect };
        throw new Error(`unexpected table ${table}`);
    });

    return { from };
}

describe("businessProcessRuntimeGoldenPath", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveDept.mockResolvedValue(departmentId);
    });

    it("runs lead → tour → decision with synchronized Current Work and outcome automation", async () => {
        const departmentMetadata = enrollmentDepartmentMetadata();
        const leadToQualTransition = detectBuilderStageTransition({
            previousStatusKey: "new_inquiry",
            nextStatusKey: "contacted",
            departmentMetadata,
        });
        const tourTransition = detectBuilderStageTransition({
            previousStatusKey: "contacted",
            nextStatusKey: "tour_scheduled",
            departmentMetadata,
        });
        expect(leadToQualTransition.stageChanged).toBe(true);
        expect(tourTransition.stageChanged).toBe(true);
        expect(tourTransition.nextBuilderStageKey).toBe("tour_scheduled");

        mockInstantiate
            .mockResolvedValueOnce({ status: "created", work_id: "work-record-outcome" })
            .mockResolvedValueOnce({ status: "deduped", work_id: "work-record-outcome", reason: "bp_runtime_fingerprint" })
            .mockResolvedValueOnce({ status: "created", work_id: "work-next" });

        const supabase = makeSupabaseForStageEntry();

        // Part 9: qualification folded into Lead — a legacy-configured qualification stage
        // no longer carries a default operating plan, so entering it spawns no work.
        const qualSpawn = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "new_inquiry",
            nextStatusKey: "contacted",
        });
        expect(qualSpawn.action).toBe("skipped");

        const tourScheduledSpawn = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "contacted",
            nextStatusKey: "tour_scheduled",
        });
        expect(tourScheduledSpawn.action).toBe("skipped");

        const tourCompletedSpawn = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
        });
        expect(tourCompletedSpawn.action).toBe("spawned");

        const duplicateTourSpawn = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
        });
        expect(duplicateTourSpawn.action).toBe("deduped");

        const tourPlan = defaultStageOperatingPlanForEnrollmentStage("tour_completed")!;

        // S4: move_to_stage now persists stage_key via supabase.update — provide a chainable stub.
        // Targets read their prior value first so the transaction has an inverse; answer it.
        // The canonical stage-move guard reads department metadata to verify the target stage is
        // configured, so `departments` must return the process that contains decision_pending.
        const chainableUpdate = (table: string) => {
            const chain: Record<string, unknown> = {};
            chain.update = () => chain;
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.maybeSingle = async () =>
                table === "departments"
                    ? { data: { metadata: enrollmentDepartmentMetadata() }, error: null }
                    : { data: { status_key: "tour_completed", close_reason_key: null, stage_key: "tour_completed" }, error: null };
            return chain;
        };
        const outcomeResult = await executeStageOperatingOutcome({
            supabase: { from: vi.fn((table: string) => chainableUpdate(table)) } as never,
            orgId,
            userId,
            departmentId,
            plan: tourPlan,
            outcomeKey: "tour_completed",
            subject: { journey_segment: "family", opportunity_id: opportunityId, work_id: "work-record-outcome" },
        });

        expect(outcomeResult.errors).toEqual([]);
        expect(outcomeResult.status_updated).toBe(true);
        expect(mockUpdateStatus).toHaveBeenCalled();

        const bpTask = {
            id: "work-record-outcome",
            title: "Record tour outcome",
            due_at: "2026-06-20T12:00:00.000Z",
            status: "open",
            source: "lifecycle_stage_work",
            work_intent_key: "record_tour_outcome_work",
            operating_plan_template_key: "record_tour_outcome_work",
            lifecycle_stage_key: "tour_completed",
            lifecycle_provenance: "stage_operating_plan_v1",
        };
        const manualTask = {
            id: "manual-1",
            title: "Call family",
            due_at: "",
            status: "open",
            source: "manual",
        };

        expect(isOperatingPlanWorkIntentTask(bpTask, "tour_completed", ["record_tour_outcome_work"])).toBe(true);
        expect(isOperatingPlanWorkIntentTask(manualTask, "tour_completed", ["record_tour_outcome_work"])).toBe(false);

        const stageRuntime = projectStageWorkRuntimeSync({
            orgId,
            opportunityId,
            departmentId,
            departmentMetadata,
            builderStageKey: "tour_completed",
            openRows: [
                {
                    id: bpTask.id,
                    title: bpTask.title,
                    due_at: "2026-06-20T12:00:00.000Z",
                    status: "open",
                    source: "lifecycle_stage_work",
                    metadata: {
                        work_intent_key: bpTask.work_intent_key,
                        operating_plan_template_key: bpTask.operating_plan_template_key,
                        lifecycle_stage_key: bpTask.lifecycle_stage_key,
                        lifecycle_provenance: bpTask.lifecycle_provenance,
                    },
                    updated_at: "2026-06-19T12:00:00.000Z",
                },
            ],
        });
        expect(stageRuntime?.primary?.work_id).toBe("work-record-outcome");

        const followUps = filterResidualOperationalTasks(
            { state: "loaded", open_tasks: [bpTask, manualTask], open_count: 2 },
            stageRuntime,
        );
        expect(followUps.open_tasks.map((t) => t.id)).toEqual(["manual-1"]);

        const queueSummary = buildQueueCurrentWorkSummary({
            _stage_work_runtime: stageRuntime,
        });
        expect(queueSummary?.label).toBeTruthy();
    });
});
