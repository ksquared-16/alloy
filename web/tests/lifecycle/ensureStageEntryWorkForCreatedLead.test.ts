import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureStageEntryWorkForCreatedLead } from "@/lib/lifecycle/ensureStageEntryWorkForCreatedLead";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const opportunityId = "55555555-5555-4555-8555-555555555555";
const workId = "66666666-6666-4666-8666-666666666666";

const mockResolveDept = vi.fn();
const mockSpawn = vi.fn();

vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: (...args: unknown[]) => mockResolveDept(...args),
}));

vi.mock("@/lib/lifecycle/spawnDestinationStageEntryWork", async () => {
    const actual = await vi.importActual<typeof import("@/lib/lifecycle/spawnDestinationStageEntryWork")>(
        "@/lib/lifecycle/spawnDestinationStageEntryWork",
    );
    return {
        ...actual,
        spawnDestinationStageEntryWork: (...args: unknown[]) => mockSpawn(...args),
    };
});

function enrollmentDepartmentMetadataWithContactFamily(): Record<string, unknown> {
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
                            stage_operating_plan_v1: {
                                version: 1,
                                purpose: "Review inbound lead",
                                work_templates: [
                                    {
                                        template_key: "contact_family",
                                        label: "Contact Family",
                                        required: true,
                                        primary: true,
                                        due_policy: { kind: "offset_days", days: 1 },
                                        owner_strategy: "record_owner",
                                        work_definition_key: "contact_family",
                                        execution_mode: "direct_action",
                                        primary_action: {
                                            action_ref: "quick_message",
                                            override_label: "Contact Family",
                                        },
                                    },
                                ],
                                outcomes: [],
                                outcome_rules: [],
                            },
                        },
                    ],
                },
            ],
        },
    };
}

function makeSupabase(metadata: Record<string, unknown>) {
    const deptMaybeSingle = vi.fn(async () => ({
        data: { metadata },
        error: null,
    }));
    const deptEq2 = vi.fn(() => ({ maybeSingle: deptMaybeSingle }));
    const deptEq1 = vi.fn(() => ({ eq: deptEq2 }));
    const deptSelect = vi.fn(() => ({ eq: deptEq1 }));
    const from = vi.fn((table: string) => {
        if (table === "departments") return { select: deptSelect };
        throw new Error(`unexpected table ${table}`);
    });
    return { from };
}

describe("ensureStageEntryWorkForCreatedLead", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveDept.mockResolvedValue(departmentId);
        mockSpawn.mockResolvedValue({
            action: "spawned",
            work_id: workId,
            stage_key: "lead",
            template_key: "contact_family",
        });
    });

    it("spawns Contact Family via the destination stage-entry seam for a new Lead", async () => {
        const supabase = makeSupabase(enrollmentDepartmentMetadataWithContactFamily());
        const result = await ensureStageEntryWorkForCreatedLead({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            stageKey: "lead",
            now: new Date("2026-08-07T12:00:00.000Z"),
        });

        expect(result.action).toBe("spawned");
        expect(result.work_id).toBe(workId);
        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(mockSpawn).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityId,
                destinationStageKey: "lead",
                departmentId,
            }),
        );
    });

    it("is idempotent when spawn reports deduped", async () => {
        mockSpawn.mockResolvedValueOnce({
            action: "deduped",
            work_id: workId,
            stage_key: "lead",
            template_key: "contact_family",
        });
        const supabase = makeSupabase(enrollmentDepartmentMetadataWithContactFamily());
        const result = await ensureStageEntryWorkForCreatedLead({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            stageKey: "lead",
        });
        expect(result.action).toBe("deduped");
        expect(result.work_id).toBe(workId);
    });

    it("does not fabricate work when the Lead stage has no entry template", async () => {
        mockSpawn.mockResolvedValueOnce({
            action: "skipped",
            reason: "no_entry_work_template",
            stage_key: "lead",
        });
        const supabase = makeSupabase({
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
                        stages: [{ id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true }],
                    },
                ],
            },
        });
        const result = await ensureStageEntryWorkForCreatedLead({
            supabase: supabase as never,
            orgId,
            userId,
            opportunityId,
            stageKey: "lead",
        });
        expect(result.action).toBe("skipped");
        expect(result.reason).toBe("no_entry_work_template");
    });
});
