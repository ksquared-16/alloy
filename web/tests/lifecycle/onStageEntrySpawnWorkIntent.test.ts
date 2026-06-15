import { beforeEach, describe, expect, it, vi } from "vitest";
import { onStageEntrySpawnWorkIntent } from "@/lib/lifecycle/onStageEntrySpawnWorkIntent";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { STAGE_OPERATING_PLAN_METADATA_KEY } from "@/lib/lifecycle/stageOperatingPlanV1";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const opportunityId = "55555555-5555-4555-8555-555555555555";
const workId = "66666666-6666-4666-8666-666666666666";

const mockResolveDept = vi.fn();
const mockInstantiate = vi.fn();

vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: (...args: unknown[]) => mockResolveDept(...args),
}));

vi.mock("@/lib/admin/operationalWork/instantiateWorkFromDefinition", () => ({
    instantiateWorkFromDefinition: (...args: unknown[]) => mockInstantiate(...args),
}));

function enrollmentDepartmentMetadata(stagePlanByKey?: Record<string, Record<string, unknown>>): Record<string, unknown> {
    const stagePlan = (key: string) => stagePlanByKey?.[key] ?? {};
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
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            ...stagePlan("lead"),
                        },
                        {
                            id: "s2",
                            key: "qualification",
                            label: "Qualification",
                            sort_order: 1,
                            is_active: true,
                            ...stagePlan("qualification"),
                        },
                        { id: "s3", key: "tour", label: "Tour", sort_order: 2, is_active: true },
                        { id: "s4", key: "enrolling", label: "Enrolling", sort_order: 3, is_active: true },
                        { id: "s5", key: "enrolled", label: "Enrolled", sort_order: 4, is_active: true },
                    ],
                },
            ],
        },
    };
}

function makeSupabase(stagePlanByKey?: Record<string, Record<string, unknown>>) {
    const statusMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const statusEq4 = vi.fn(() => ({ maybeSingle: statusMaybeSingle }));
    const statusEq3 = vi.fn(() => ({ eq: statusEq4 }));
    const statusEq2 = vi.fn(() => ({ eq: statusEq3 }));
    const statusEq1 = vi.fn(() => ({ eq: statusEq2 }));
    const statusSelect = vi.fn(() => ({ eq: statusEq1 }));

    const deptMaybeSingle = vi.fn(async () => ({
        data: { metadata: enrollmentDepartmentMetadata(stagePlanByKey) },
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

    return { from, mockInstantiate: mockInstantiate };
}

describe("onStageEntrySpawnWorkIntent", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveDept.mockResolvedValue(departmentId);
        mockInstantiate.mockResolvedValue({
            status: "created",
            work: { id: workId },
            dedupeKey: "dedupe-1",
        });
    });

    it("spawns one Make Contact work on new lead (null → new_inquiry)", async () => {
        const supabase = makeSupabase();
        const result = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: null,
            nextStatusKey: "new_inquiry",
            now: new Date("2026-06-10T12:00:00.000Z"),
        });

        expect(result.action).toBe("spawned");
        expect(result.work_id).toBe(workId);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
        expect(mockInstantiate).toHaveBeenCalledWith(
            expect.objectContaining({
                workDefinitionKey: "contact_family",
                titleOverride: "Make Contact",
                idempotencyKey: `lifecycle_intent:${orgId}:${opportunityId}:lead:make_contact`,
                metadata: expect.objectContaining({
                    work_intent_key: "make_contact",
                    lifecycle_stage_key: "lead",
                    attempt_count: 0,
                    department_id: departmentId,
                    operating_plan_template: false,
                }),
                contextSnapshot: { lifecycle_stage_key: "lead" },
            }),
        );
    });

    it("skips spawn on same-stage status update within lead", async () => {
        const supabase = makeSupabase();
        const result = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "new_inquiry",
            nextStatusKey: "open",
        });

        expect(result).toEqual({ action: "skipped", reason: "stage_unchanged" });
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it("dedupes on re-entry to the same stage", async () => {
        mockInstantiate.mockResolvedValue({
            status: "deduped",
            existingWork: { id: workId },
            dedupeKey: "dedupe-1",
            reason: "idempotency_key_match",
        });

        const supabase = makeSupabase();
        const result = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "enrolled",
            nextStatusKey: "new_inquiry",
        });

        expect(result.action).toBe("deduped");
        expect(result.work_id).toBe(workId);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
    });

    it("spawns Gather Enrollment Information on qualification transition", async () => {
        const supabase = makeSupabase();
        const result = await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: "new_inquiry",
            nextStatusKey: "contacted",
        });

        expect(result.action).toBe("spawned");
        expect(mockInstantiate).toHaveBeenCalledWith(
            expect.objectContaining({
                workDefinitionKey: "collect_missing_information",
                titleOverride: "Gather Enrollment Information",
                idempotencyKey: `lifecycle_intent:${orgId}:${opportunityId}:qualification:gather_enrollment_information`,
            }),
        );
    });

    it("never spawns legacy contact_attempt templates without explicit plan (single instantiate only)", async () => {
        const supabase = makeSupabase();
        await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: null,
            nextStatusKey: "new_inquiry",
        });

        expect(mockInstantiate).toHaveBeenCalledTimes(1);
        const call = mockInstantiate.mock.calls[0]![0] as { titleOverride?: string };
        expect(call.titleOverride).toBe("Make Contact");
        expect(call.titleOverride).not.toMatch(/Contact attempt/i);
    });

    it("spawns configured primary work template when stage has explicit operating plan", async () => {
        const supabase = makeSupabase({
            lead: {
                [STAGE_OPERATING_PLAN_METADATA_KEY]: {
                    version: 1,
                    lifecycle_key: "enrollment",
                    stage_key: "lead",
                    journey_segment: "family",
                    work_templates: [
                        {
                            template_key: "contact_family_lead",
                            label: "Contact Family",
                            description: "Call or text the family",
                            required: true,
                            primary: true,
                            due_policy: { kind: "offset_days", days: 2 },
                            owner_strategy: "record_owner",
                            work_definition_key: "contact_family",
                        },
                    ],
                    outcomes: [],
                    outcome_rules: [],
                    attention_rules: [],
                },
            },
        });
        await onStageEntrySpawnWorkIntent({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            previousStatusKey: null,
            nextStatusKey: "new_inquiry",
            now: new Date("2026-06-10T12:00:00.000Z"),
        });

        expect(mockInstantiate).toHaveBeenCalledWith(
            expect.objectContaining({
                workDefinitionKey: "contact_family",
                titleOverride: "Contact Family",
                description: "Call or text the family",
                idempotencyKey: `lifecycle_intent:${orgId}:${opportunityId}:lead:contact_family_lead`,
                metadata: expect.objectContaining({
                    work_intent_key: "contact_family_lead",
                    template_key: "contact_family_lead",
                    operating_plan_template: true,
                    lifecycle_stage_key: "lead",
                }),
            }),
        );
    });
});
