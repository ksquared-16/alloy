/**
 * Tours Business Process runtime integration (mocked).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectBuilderStageTransition } from "@/lib/lifecycle/detectBuilderStageTransition";
import { onStageEntrySpawnWorkIntent } from "@/lib/lifecycle/onStageEntrySpawnWorkIntent";
import { executeStageOperatingOutcome } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { filterResidualOperationalTasks } from "@/lib/lifecycle/filterResidualOperationalTasks";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import { buildBusinessProcessWorkRuntimeFingerprint } from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { enrollmentStatusVocabularyMetadata } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import { legacyGranularProcessStageForStatusKey } from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import { resolveStatusProcessStageAssignment } from "@/lib/businessProcesses/resolveStatusProcessStageAssignment";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { emitDomainLifecycleStatusChangedEvent } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const opportunityId = "55555555-5555-4555-8555-555555555555";

const mockResolveDept = vi.fn();
const mockInstantiate = vi.fn();
const mockUpdateStatus = vi.fn(async (_params?: unknown) => ({ error: null }));
const mockUpdateOcm = vi.fn(async (_params?: unknown) => ({ error: null }));

vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: (...args: unknown[]) => mockResolveDept(...args),
}));

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: (...args: unknown[]) => mockInstantiate(...args),
}));

vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: (params: unknown) => mockUpdateStatus(params),
}));

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: (params: unknown) => mockUpdateOcm(params),
}));

function granularTourDepartmentMetadata(): Record<string, unknown> {
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
                        { id: "s1", key: "tour_scheduled", label: "Tour Scheduled", sort_order: 0, is_active: true },
                        { id: "s2", key: "tour_completed", label: "Tour Completed", sort_order: 1, is_active: true },
                        { id: "s3", key: "decision_pending", label: "Decision Pending", sort_order: 2, is_active: true },
                    ],
                },
            ],
        },
    };
}

// S4: move_to_stage now persists stage_key via supabase.update — chainable no-op stub.
// Targets also READ their prior value before writing, so the transaction has an inverse to
// compensate with; the stub answers that read with a plausible pre-move row.
function makeChainableUpdateSupabase() {
    // The canonical stage-move guard reads department metadata to verify the target stage is
    // configured; `departments` must return the granular process (which contains decision_pending).
    const stagePatches: Array<Record<string, unknown>> = [];
    const from = vi.fn((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.update = (patch: Record<string, unknown>) => {
            if (table === "opportunities") stagePatches.push(patch);
            return chain;
        };
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () =>
            table === "departments"
                ? { data: { metadata: granularTourDepartmentMetadata() }, error: null }
                : { data: { status_key: "tour_completed", close_reason_key: null, stage_key: "tour_completed" }, error: null };
        return chain;
    });
    return { from, stagePatches };
}

function makeSupabaseForStageEntry(statusMetadata: Record<string, unknown> | null = null) {
    const statusMaybeSingle = vi.fn(async () => ({ data: statusMetadata ? { metadata: statusMetadata } : null, error: null }));
    const statusEq4 = vi.fn(() => ({ maybeSingle: statusMaybeSingle }));
    const statusEq3 = vi.fn(() => ({ eq: statusEq4 }));
    const statusEq2 = vi.fn(() => ({ eq: statusEq3 }));
    const statusEq1 = vi.fn(() => ({ eq: statusEq2 }));
    const statusSelect = vi.fn(() => ({ eq: statusEq1 }));

    const deptMaybeSingle = vi.fn(async () => ({
        data: { metadata: granularTourDepartmentMetadata() },
        error: null,
    }));
    const deptEq2 = vi.fn(() => ({ maybeSingle: deptMaybeSingle }));
    const deptEq1 = vi.fn(() => ({ eq: deptEq2 }));
    const deptSelect = vi.fn(() => ({ eq: deptEq1 }));

    const from = vi.fn((table: string) => {
        if (table === "departments") return { select: deptSelect };
        if (table === "status_definitions") return { select: statusSelect };
        throw new Error(`unexpected table ${table}`);
    });

    return { from };
}

describe("tourBpRuntimeIntegration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveDept.mockResolvedValue(departmentId);
    });

    it("no longer emits stage metadata on statuses (S4: stage is a persisted column)", () => {
        // S4 status collapse: enrollmentStatusVocabularyMetadata must NOT emit process_stage_key /
        // stage_key — stage is the persisted stage_key column, not status-derived metadata.
        const scheduled = enrollmentStatusVocabularyMetadata({
            status_key: "tour_scheduled",
            status_label: "Tour Scheduled",
            sort_order: 25,
            stage_key: "tour_scheduled",
            entity_type: "opportunities",
            track_key: "family_track",
        });
        expect(scheduled.process_stage_key).toBeUndefined();
        expect(scheduled.stage_key).toBeUndefined();
        expect(scheduled.seed_source).toBe("enrollment_alignment_status_collapse_v1");
    });

    it("resolves granular legacy stage assignment when coarse tour stage is not configured", () => {
        const configured = ["tour_scheduled", "tour_completed", "decision_pending"];
        expect(legacyGranularProcessStageForStatusKey("tour_scheduled")).toBe("tour_scheduled");
        expect(legacyGranularProcessStageForStatusKey("tour_no_show")).toBe("tour_scheduled");
        expect(
            resolveStatusProcessStageAssignment("tour_completed", null, configured).stage,
        ).toBe("tour_completed");
        expect(
            resolveStatusProcessStageAssignment("decision_pending", null, configured).stage,
        ).toBe("decision_pending");
    });

    it("detects stage change from tour_scheduled to tour_completed", () => {
        const departmentMetadata = granularTourDepartmentMetadata();
        const scheduledMeta = enrollmentStatusVocabularyMetadata({
            status_key: "tour_scheduled",
            status_label: "Tour Scheduled",
            sort_order: 25,
            stage_key: "tour_scheduled",
            entity_type: "opportunities",
            track_key: "family_track",
        });
        const completedMeta = enrollmentStatusVocabularyMetadata({
            status_key: "tour_completed",
            status_label: "Tour Completed",
            sort_order: 30,
            stage_key: "tour_completed",
            entity_type: "opportunities",
            track_key: "family_track",
        });

        const transition = detectBuilderStageTransition({
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
            departmentMetadata,
            previousStatusMetadata: scheduledMeta,
            nextStatusMetadata: completedMeta,
        });

        expect(transition.stageChanged).toBe(true);
        expect(transition.previousBuilderStageKey).toBe("tour_scheduled");
        expect(transition.nextBuilderStageKey).toBe("tour_completed");
    });

    it("does not spawn BP work when tour_no_show keeps builder stage unchanged", async () => {
        const scheduledMeta = enrollmentStatusVocabularyMetadata({
            status_key: "tour_scheduled",
            status_label: "Tour Scheduled",
            sort_order: 25,
            stage_key: "tour_scheduled",
            entity_type: "opportunities",
            track_key: "family_track",
        });
        const noShowMeta = enrollmentStatusVocabularyMetadata({
            status_key: "tour_no_show",
            status_label: "Tour No-Show",
            sort_order: 32,
            stage_key: "tour_scheduled",
            entity_type: "opportunities",
            track_key: "family_track",
        });
        const transition = detectBuilderStageTransition({
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_no_show",
            departmentMetadata: granularTourDepartmentMetadata(),
            previousStatusMetadata: scheduledMeta,
            nextStatusMetadata: noShowMeta,
        });
        expect(transition.stageChanged).toBe(false);

        const supabase = makeSupabaseForStageEntry();
        const result = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_no_show",
        });
        expect(result.action).toBe("skipped");
        expect(result.reason).toBe("stage_unchanged");
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it("does not spawn BP work on tour_scheduled stage entry", async () => {
        const supabase = makeSupabaseForStageEntry();
        const result = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "qualified",
            nextStatusKey: "tour_scheduled",
        });
        expect(result.action).toBe("skipped");
        expect(result.reason).toBe("no_primary_intent");
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it("runs booking complete path: tour_completed status spawns record_tour_outcome work", async () => {
        mockInstantiate.mockResolvedValueOnce({ status: "created", work_id: "work-record-outcome" });

        const supabase = makeSupabaseForStageEntry();
        const spawn = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
        });

        expect(spawn.action).toBe("spawned");
        expect(spawn.work_id).toBe("work-record-outcome");
        expect(mockInstantiate).toHaveBeenCalledWith(
            expect.objectContaining({
                stageKey: "tour_completed",
                template: expect.objectContaining({
                    template_key: "record_tour_outcome_work",
                    primary: true,
                    work_definition_key: "record_tour_outcome",
                }),
            }),
        );
    });

    it("dedupes record_tour_outcome via bp_runtime_fingerprint", async () => {
        const fingerprint = buildBusinessProcessWorkRuntimeFingerprint({
            orgId,
            entityType: "opportunities",
            entityId: opportunityId,
            stageKey: "tour_completed",
            templateKey: "record_tour_outcome_work",
        });
        expect(fingerprint).toBe(
            `bpw:${orgId}:opportunities:${opportunityId}:record_tour_outcome_work`,
        );

        mockInstantiate
            .mockResolvedValueOnce({ status: "created", work_id: "work-record-outcome" })
            .mockResolvedValueOnce({ status: "deduped", work_id: "work-record-outcome", reason: "bp_runtime_fingerprint" });

        const supabase = makeSupabaseForStageEntry();
        const first = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
        });
        const second = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
        });
        expect(first.action).toBe("spawned");
        expect(second.action).toBe("deduped");
    });

    it("projects record_tour_outcome_work as Current Work with BP metadata contract", () => {
        const taskRow = {
            id: "work-record-outcome",
            title: "Record tour outcome",
            due_at: "2026-06-20T12:00:00.000Z",
            status: "open",
            source: "lifecycle_stage_work",
            work_intent_key: "record_tour_outcome_work",
            operating_plan_template_key: "record_tour_outcome_work",
            lifecycle_stage_key: "tour_completed",
            lifecycle_provenance: "stage_operating_plan_v1",
            metadata: {
                work_intent_key: "record_tour_outcome_work",
                operating_plan_template_key: "record_tour_outcome_work",
                lifecycle_stage_key: "tour_completed",
                lifecycle_provenance: "stage_operating_plan_v1",
                bp_runtime_fingerprint: buildBusinessProcessWorkRuntimeFingerprint({
                    orgId,
                    entityType: "opportunities",
                    entityId: opportunityId,
                    stageKey: "tour_completed",
                    templateKey: "record_tour_outcome_work",
                }),
                work_definition_key: "record_tour_outcome",
            },
            updated_at: "2026-06-19T12:00:00.000Z",
        };

        const projection = projectStageWorkRuntimeSync({
            orgId,
            opportunityId,
            departmentId,
            departmentMetadata: granularTourDepartmentMetadata(),
            builderStageKey: "tour_completed",
            openRows: [taskRow],
        });
        expect(projection).not.toBeNull();
        expect(projection!.primary?.template_key).toBe("record_tour_outcome_work");
        expect(projection!.primary?.work_id).toBe("work-record-outcome");
        expect(isOperatingPlanWorkIntentTask(taskRow, "tour_completed", ["record_tour_outcome_work"])).toBe(true);

        const filtered = filterResidualOperationalTasks(
            {
                state: "loaded",
                open_tasks: [
                    {
                        id: taskRow.id,
                        title: taskRow.title,
                        due_at: taskRow.due_at,
                        status: taskRow.status,
                        source: taskRow.source,
                        work_intent_key: taskRow.work_intent_key,
                        operating_plan_template_key: taskRow.operating_plan_template_key,
                        lifecycle_stage_key: taskRow.lifecycle_stage_key,
                        lifecycle_provenance: taskRow.lifecycle_provenance,
                    },
                    {
                        id: "adhoc-1",
                        title: "Call family",
                        due_at: "",
                        status: "open",
                        source: "manual",
                    },
                ],
                open_count: 2,
            },
            projection,
        );
        expect(filtered.open_tasks).toHaveLength(1);
        expect(filtered.open_tasks[0]?.id).toBe("adhoc-1");
    });

    it("applies no_show outcome attention target", async () => {
        const selectChain = {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
                data: { id: opportunityId, metadata: {} },
                error: null,
            })),
        };
        const updateChain = {
            eq: vi.fn().mockReturnThis(),
        };
        updateChain.eq.mockImplementation(function (this: typeof updateChain, col: string) {
            if (col === "org_id") {
                return Promise.resolve({ error: null });
            }
            return updateChain;
        });
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities") {
                    return {
                        select: vi.fn(() => selectChain),
                        update: vi.fn(() => updateChain),
                    };
                }
                throw new Error(`unexpected ${table}`);
            }),
        };

        const plan = defaultStageOperatingPlanForEnrollmentStage("tour_completed")!;
        const result = await executeStageOperatingOutcome({
            supabase: supabase as never,
            orgId,
            userId,
            departmentId,
            plan,
            outcomeKey: "no_show",
            subject: { journey_segment: "family", opportunity_id: opportunityId, work_id: "work-record-outcome" },
        });

        expect(result.errors).toEqual([]);
        expect(result.needs_attention_set).toBe(true);
    });

    it("advances to decision_pending after tour_completed outcome", async () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour_completed")!;
        const supabase = makeChainableUpdateSupabase();
        const result = await executeStageOperatingOutcome({
            supabase: supabase as never,
            orgId,
            userId,
            departmentId,
            plan,
            outcomeKey: "tour_completed",
            subject: { journey_segment: "family", opportunity_id: opportunityId, work_id: "work-record-outcome" },
        });

        expect(result.errors).toEqual([]);
        expect(result.status_updated).toBe(true);
        // The tour_completed rule sets the family case status open and advances the STAGE to
        // decision_pending (which is configured in the granular process — the guard allows it).
        expect(mockUpdateStatus).toHaveBeenCalledWith(expect.objectContaining({ newStatusKey: "open" }));
        expect(supabase.stagePatches).toContainEqual(expect.objectContaining({ stage_key: "decision_pending" }));
    });

    it("domain lifecycle bridge delegates to updateOpportunityStatusWithEvent with domain metadata", async () => {
        await emitDomainLifecycleStatusChangedEvent({
            supabase: {} as never,
            orgId,
            entityType: "opportunities",
            entityId: opportunityId,
            nextStatusKey: "tour_completed",
            domain: "tour_booking",
            domainEntityId: "booking-1",
            actorUserId: userId,
            normalizeContext: "tour_booking:tour_completed",
            eventMetadata: { booking_id: "booking-1" },
        });

        expect(mockUpdateStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityId,
                newStatusKey: "tour_completed",
                actorUserId: userId,
                eventMetadata: expect.objectContaining({
                    source: "domain_lifecycle",
                    domain: "tour_booking",
                    domain_entity_id: "booking-1",
                    booking_id: "booking-1",
                }),
            }),
        );
    });

    it("integration golden path: scheduled → completed → record outcome → decision_pending", async () => {
        const departmentMetadata = granularTourDepartmentMetadata();

        const toCompleted = detectBuilderStageTransition({
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
            departmentMetadata,
        });
        expect(toCompleted.stageChanged).toBe(true);

        mockInstantiate.mockResolvedValueOnce({ status: "created", work_id: "work-record-outcome" });
        const supabase = makeSupabaseForStageEntry();
        const spawn = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_scheduled",
            nextStatusKey: "tour_completed",
        });
        expect(spawn.action).toBe("spawned");

        const tourCompletedPlan = defaultStageOperatingPlanForEnrollmentStage("tour_completed")!;
        const outcome = await executeStageOperatingOutcome({
            supabase: makeChainableUpdateSupabase() as never,
            orgId,
            userId,
            departmentId,
            plan: tourCompletedPlan,
            outcomeKey: "tour_completed",
            subject: { journey_segment: "family", opportunity_id: opportunityId, work_id: "work-record-outcome" },
        });
        expect(outcome.status_updated).toBe(true);

        mockInstantiate.mockResolvedValueOnce({ status: "created", work_id: "work-decision" });
        const toDecision = detectBuilderStageTransition({
            previousStatusKey: "tour_completed",
            nextStatusKey: "decision_pending",
            departmentMetadata,
        });
        expect(toDecision.stageChanged).toBe(true);

        const decisionSpawn = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "tour_completed",
            nextStatusKey: "decision_pending",
        });
        expect(decisionSpawn.action).toBe("spawned");
        expect(mockInstantiate).toHaveBeenLastCalledWith(
            expect.objectContaining({
                stageKey: "decision_pending",
                template: expect.objectContaining({ template_key: "follow_up_decision", primary: true }),
            }),
        );
    });
});
