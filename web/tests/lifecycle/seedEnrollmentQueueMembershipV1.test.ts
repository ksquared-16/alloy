import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    parseLifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import {
    applyEnrollmentQueueMembershipSeedToDepartmentMetadata,
    applyEnrollmentQueueMembershipSeedToWorkUnitMetadata,
    planEnrollmentQueueMembershipSeed,
    QUEUE_MEMBERSHIP_METADATA_KEY,
} from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";

const DEPT_ID = "dept-enrollment-1";
const PROCESS_ID = "process-enrollment-1";

function stageRecord(key: string, label: string, extra?: Record<string, unknown>) {
    return {
        id: randomUUID(),
        key,
        label,
        sort_order: 0,
        is_active: true,
        ...extra,
    };
}

function enrollmentBuilderMetadata(stages: ReturnType<typeof stageRecord>[]) {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: PROCESS_ID,
            processes: [
                {
                    id: PROCESS_ID,
                    key: ENROLLMENT_PROCESS_KEY,
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages,
                },
            ],
        },
    };
}

function workUnitRow(stageKey: string, metadata: unknown = {}) {
    const key = lifecycleStageWorkUnitKey(stageKey);
    return {
        id: `wu-${stageKey}`,
        key,
        metadata,
        queue_definition: { version: 2, entity_type: "opportunity", queues: [{ key: "lane", filters: [] }] },
        department_id: DEPT_ID,
    };
}

describe("planEnrollmentQueueMembershipSeed", () => {
    it("applies defaults when queue_membership_v1 is missing", () => {
        const stages = [
            stageRecord("lead", "Lead"),
            stageRecord("qualification", "Qualification"),
            stageRecord("tour", "Tour"),
            stageRecord("waitlist", "Waitlist"),
            stageRecord("enrollment", "Enrolling"),
            stageRecord("enrolled", "Enrolled"),
        ];
        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: DEPT_ID,
            departmentMetadata: enrollmentBuilderMetadata(stages),
            workUnits: stages.map((s) => workUnitRow(s.key)),
        });

        expect(plan).not.toBeNull();
        expect(plan!.stage_actions.every((a) => a.action === "seeded")).toBe(true);
        expect(plan!.stage_actions.map((a) => a.stage_key)).toEqual([
            "lead",
            "qualification",
            "tour",
            "waitlist",
            "enrollment",
            "enrolled",
        ]);

        const tour = plan!.stage_actions.find((a) => a.stage_key === "tour");
        expect(tour?.membership_after).toEqual(defaultEnrollmentQueueMembershipForStage("tour"));

        const enrolling = plan!.stage_actions.find((a) => a.stage_key === "enrollment");
        expect(enrolling?.membership_after?.included_disposition_keys).toEqual([
            "offer_pending",
            "registration_pending",
            "paperwork_pending",
            "start_date_scheduled",
        ]);
    });

    it("copies stage explicit membership to work unit when WU metadata is missing", () => {
        const explicit = {
            version: 1 as const,
            lifecycle_key: ENROLLMENT_PROCESS_KEY,
            stage_key: "tour",
            subject_type: "candidate" as const,
            count_unit: "candidates" as const,
            included_disposition_keys: ["custom_disposition"],
        };
        const stages = [stageRecord("tour", "Tour", { [QUEUE_MEMBERSHIP_METADATA_KEY]: explicit })];
        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: DEPT_ID,
            departmentMetadata: enrollmentBuilderMetadata(stages),
            workUnits: [workUnitRow("tour")],
        });

        expect(plan!.work_unit_actions[0].action).toBe("seeded");
        expect(plan!.work_unit_actions[0].membership_after).toEqual(explicit);
    });

    it("preserves explicit valid existing config on builder stage", () => {
        const explicit = {
            version: 1 as const,
            lifecycle_key: ENROLLMENT_PROCESS_KEY,
            stage_key: "tour",
            subject_type: "candidate" as const,
            count_unit: "candidates" as const,
            included_disposition_keys: ["custom_disposition"],
        };
        const stages = [stageRecord("tour", "Tour", { [QUEUE_MEMBERSHIP_METADATA_KEY]: explicit })];
        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: DEPT_ID,
            departmentMetadata: enrollmentBuilderMetadata(stages),
            workUnits: [workUnitRow("tour")],
        });

        const tour = plan!.stage_actions.find((a) => a.stage_key === "tour");
        expect(tour?.action).toBe("skipped_has_explicit");
        expect(tour?.membership_after).toEqual(explicit);
    });

    it("seeds known enrollment stages and skips stages without defaults", () => {
        const stages = [stageRecord("enrolling", "Enrolling"), stageRecord("onboarding", "Onboarding")];
        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: DEPT_ID,
            departmentMetadata: enrollmentBuilderMetadata(stages),
            workUnits: [],
        });

        expect(plan!.stage_actions.map((a) => a.action)).toEqual(["seeded", "skipped_no_default"]);
    });

    it("denormalizes matching membership to work unit metadata", () => {
        const stages = [stageRecord("enrolled", "Enrolled")];
        const wu = workUnitRow("enrolled");
        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: DEPT_ID,
            departmentMetadata: enrollmentBuilderMetadata(stages),
            workUnits: [wu],
        });

        const wuAction = plan!.work_unit_actions[0];
        expect(wuAction.action).toBe("seeded");
        expect(wuAction.work_unit_id).toBe(wu.id);
        expect(wuAction.membership_after).toEqual(defaultEnrollmentQueueMembershipForStage("enrolled"));
    });

    it("preserves explicit work unit queue_membership_v1", () => {
        const explicit = {
            version: 1 as const,
            lifecycle_key: ENROLLMENT_PROCESS_KEY,
            stage_key: "enrolled",
            subject_type: "child" as const,
            count_unit: "enrollment_tracks" as const,
            included_disposition_keys: ["enrolled", "custom"],
        };
        const stages = [stageRecord("enrolled", "Enrolled")];
        const wu = workUnitRow("enrolled", { [QUEUE_MEMBERSHIP_METADATA_KEY]: explicit });
        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: DEPT_ID,
            departmentMetadata: enrollmentBuilderMetadata(stages),
            workUnits: [wu],
        });

        expect(plan!.work_unit_actions[0].action).toBe("skipped_has_explicit");
        expect(plan!.work_unit_ids_to_update).toHaveLength(0);
    });
});

describe("applyEnrollmentQueueMembershipSeed", () => {
    it("writes builder metadata without altering unrelated fields", () => {
        const stages = [stageRecord("lead", "Lead")];
        const metadata = {
            ...enrollmentBuilderMetadata(stages),
            other_flag: true,
        };
        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: DEPT_ID,
            departmentMetadata: metadata,
            workUnits: [],
        })!;

        const applied = applyEnrollmentQueueMembershipSeedToDepartmentMetadata(metadata, plan);
        expect(applied.other_flag).toBe(true);

        const builder = applied[LIFECYCLE_BUILDER_METADATA_KEY] as {
            processes: { stages: Record<string, unknown>[] }[];
        };
        const stage = builder.processes[0].stages[0];
        expect(stage[QUEUE_MEMBERSHIP_METADATA_KEY]).toEqual(
            defaultEnrollmentQueueMembershipForStage("lead"),
        );

        const parsed = parseLifecycleBuilderV1(applied[LIFECYCLE_BUILDER_METADATA_KEY]);
        expect(parsed?.processes[0]?.stages[0]?.queue_membership_v1).toEqual(
            defaultEnrollmentQueueMembershipForStage("lead"),
        );
    });

    it("does not change queue_definition when updating work unit metadata", () => {
        const queueDefinition = {
            version: 2,
            entity_type: "opportunity",
            queues: [{ key: "lane", grain: "case", filters: [{ type: "status", values: ["new_inquiry"] }] }],
        };
        const membership = defaultEnrollmentQueueMembershipForStage("waitlist")!;
        const before = workUnitRow("waitlist", {});
        before.queue_definition = queueDefinition as unknown as typeof before.queue_definition;

        const nextMetadata = applyEnrollmentQueueMembershipSeedToWorkUnitMetadata(
            before.metadata,
            membership,
        );
        expect(nextMetadata[QUEUE_MEMBERSHIP_METADATA_KEY]).toEqual(membership);
        expect(before.queue_definition).toEqual(queueDefinition);
    });
});
