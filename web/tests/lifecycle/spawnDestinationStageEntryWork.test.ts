import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { STAGE_OPERATING_PLAN_METADATA_KEY } from "@/lib/lifecycle/stageOperatingPlanV1";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    resolveDestinationStageEntryTemplates,
    spawnDestinationStageEntryWork,
} from "@/lib/lifecycle/spawnDestinationStageEntryWork";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const opportunityId = "55555555-5555-4555-8555-555555555555";
const workId = "66666666-6666-4666-8666-666666666666";

const mockInstantiate = vi.fn();

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: (...args: unknown[]) => mockInstantiate(...args),
}));

function metadataWithPlans(stageKeys: string[]): Record<string, unknown> {
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
                    stages: stageKeys.map((key, index) => {
                        const plan = defaultStageOperatingPlanForEnrollmentStage(key);
                        return {
                            id: `s-${key}`,
                            key,
                            label: key,
                            sort_order: index,
                            is_active: true,
                            ...(plan ? { [STAGE_OPERATING_PLAN_METADATA_KEY]: plan } : {}),
                        };
                    }),
                },
            ],
        },
    };
}

describe("spawnDestinationStageEntryWork", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInstantiate.mockResolvedValue({ status: "created", work_id: workId });
    });

    it("resolves Send Enrollment Packet for Enrolling destination", () => {
        const resolved = resolveDestinationStageEntryTemplates({
            departmentMetadata: metadataWithPlans(["decision", "enrolling", "closed"]),
            destinationStageKey: "enrolling",
        });
        expect(resolved.templates[0]?.template_key).toBe("send_enrollment_packet");
    });

    it("skips terminal / workless stages", () => {
        const resolved = resolveDestinationStageEntryTemplates({
            departmentMetadata: metadataWithPlans(["closed"]),
            destinationStageKey: "closed",
        });
        expect(resolved.templates).toEqual([]);
        expect(resolved.reason).toBe("terminal_or_workless_stage");
    });

    it("spawns destination stage-entry work after Decision → Enrolling", async () => {
        const result = await spawnDestinationStageEntryWork({
            supabase: {} as never,
            orgId,
            userId,
            opportunityId,
            departmentId,
            destinationStageKey: "enrolling",
            departmentMetadata: metadataWithPlans(["decision", "enrolling"]),
        });
        expect(result.action).toBe("spawned");
        expect(result.template_key).toBe("send_enrollment_packet");
        expect(mockInstantiate).toHaveBeenCalledWith(
            expect.objectContaining({
                stageKey: "enrolling",
                template: expect.objectContaining({ template_key: "send_enrollment_packet" }),
            }),
        );
    });

    it("is idempotent — deduped spawn does not create a second work id", async () => {
        mockInstantiate.mockResolvedValue({
            status: "deduped",
            work_id: workId,
            reason: "open_work_exists",
        });
        const result = await spawnDestinationStageEntryWork({
            supabase: {} as never,
            orgId,
            userId,
            opportunityId,
            departmentId,
            destinationStageKey: "enrolling",
            departmentMetadata: metadataWithPlans(["enrolling"]),
        });
        expect(result.action).toBe("deduped");
        expect(result.work_id).toBe(workId);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
    });
});
