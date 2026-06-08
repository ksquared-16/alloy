import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    LifecycleStageWorkUnitIdentityConflictError,
    lifecycleStageWorkUnitNeedsQueueFilterSync,
    queueFilterKeysFromAssignedStatusKeys,
    resolveLifecycleStageWorkUnitIdentity,
} from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import { buildLifecycleStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { validateLifecycleStageWorkUnitQueueFilter } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";

const repoRoot = join(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(join(repoRoot, rel), "utf8");
}

const activation: LifecycleActivationV1 = {
    version: 1,
    lifecycle_name: "Enrollment",
    primary_entity: "opportunity",
    primary_record_label: "Lead",
    process_id: "proc-a",
    stage_key: "enrolling",
    stage_label: "Enrolling",
    work_unit_id: "wu-enroll",
    work_unit_name: "Enrolling",
    status_keys: ["deposit_paid"],
    status_labels: ["Deposit paid"],
    action_definition_id: null,
    action_placement_ids: [],
    activation_owned: true,
    completed_steps: 4,
    updated_at: "2026-05-01T00:00:00.000Z",
};

const enrollingPayload: EnrollmentStatusStagesPayload = {
    entity_type: "opportunities",
    stage_keys: ["enrolling", "enrolled"],
    unassigned: [],
    stages: {
        enrolling: {
            has_custom_assignments: true,
            statuses: [
                {
                    status_key: "deposit_paid",
                    status_label: "Deposit paid",
                    sort_order: 1,
                    assignment_source: "metadata",
                    has_metadata_override: false,
                },
            ],
        },
        enrolled: { has_custom_assignments: false, statuses: [] },
    },
};

describe("resolveLifecycleStageWorkUnitIdentity", () => {
    const baseInput = {
        orgId: "org-1",
        departmentId: "dept-a",
        stageKey: "enrolling",
        processId: "proc-a",
    };

    it("returns not_created when no rows exist for lifecycle_wu_enrolling", () => {
        const id = resolveLifecycleStageWorkUnitIdentity(baseInput, []);
        expect(id.state).toBe("not_created");
        expect(id.workUnitKey).toBe(lifecycleStageWorkUnitKey("enrolling"));
        expect(id.workUnit).toBeNull();
    });

    it("returns created for single active row with matching key", () => {
        const id = resolveLifecycleStageWorkUnitIdentity(baseInput, [
            {
                id: "wu-1",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                department_id: "dept-a",
                is_active: true,
                queue_definition: {},
                metadata: { lifecycle_stage_key: "enrolling" },
            },
        ]);
        expect(id.state).toBe("created");
        expect(id.workUnit?.id).toBe("wu-1");
    });

    it("updates identity — second active row with same key is conflict", () => {
        const id = resolveLifecycleStageWorkUnitIdentity(baseInput, [
            {
                id: "wu-1",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                department_id: "dept-a",
                is_active: true,
                queue_definition: {},
                metadata: {},
            },
            {
                id: "wu-2",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling copy",
                department_id: "dept-a",
                is_active: true,
                queue_definition: {},
                metadata: {},
            },
        ]);
        expect(id.state).toBe("conflict");
        expect(id.conflictingActiveRows).toHaveLength(2);
    });

    it("same display name in another department does not appear in identity rows", () => {
        const id = resolveLifecycleStageWorkUnitIdentity(baseInput, [
            {
                id: "wu-other",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                department_id: "dept-b",
                is_active: true,
                queue_definition: {},
                metadata: {},
            },
        ]);
        expect(id.state).toBe("not_created");
    });

    it("same display name on different stage key in same department is not a conflict", () => {
        const id = resolveLifecycleStageWorkUnitIdentity(baseInput, [
            {
                id: "wu-enroll",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                department_id: "dept-a",
                is_active: true,
                queue_definition: {},
                metadata: { lifecycle_stage_key: "enrolling" },
            },
            {
                id: "wu-enrolled",
                key: "lifecycle_wu_enrolled",
                name: "Enrolling",
                department_id: "dept-a",
                is_active: true,
                queue_definition: {},
                metadata: { lifecycle_stage_key: "enrolled" },
            },
        ]);
        expect(id.state).toBe("created");
        expect(id.workUnit?.key).toBe("lifecycle_wu_enrolling");
    });

    it("inactive duplicate does not cause conflict", () => {
        const id = resolveLifecycleStageWorkUnitIdentity(baseInput, [
            {
                id: "wu-old",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                department_id: "dept-a",
                is_active: false,
                queue_definition: {},
                metadata: {},
            },
            {
                id: "wu-new",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                department_id: "dept-a",
                is_active: true,
                queue_definition: {},
                metadata: {},
            },
        ]);
        expect(id.state).toBe("created");
        expect(id.workUnit?.id).toBe("wu-new");
    });
});

describe("queue filter alignment", () => {
    it("validation passes when queue_definition uses same filter keys as sync resolver", () => {
        const assigned = ["deposit_paid"];
        const filterKeys = queueFilterKeysFromAssignedStatusKeys("enrolling", assigned);
        const queue_definition = buildLifecycleStageQueueDefinition({
            stageKey: "enrolling",
            label: "Enrolling",
            statusKeys: filterKeys,
        });
        const row = validateLifecycleStageWorkUnitQueueFilter({
            stageKey: "enrolling",
            workUnit: {
                id: "wu-enroll",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                queue_definition,
                metadata: {
                    lifecycle_stage_key: "enrolling",
                    lifecycle_process_id: "proc-a",
                    status_keys: filterKeys,
                },
            },
            statusPayload: enrollingPayload,
            activation,
        });
        expect(row.pass).toBe(true);
    });

    it("needs_sync when filters omit assigned status", () => {
        const assigned = ["deposit_paid"];
        const needs = lifecycleStageWorkUnitNeedsQueueFilterSync({
            stageKey: "enrolling",
            assignedStatusKeys: assigned,
            workUnit: {
                key: "lifecycle_wu_enrolling",
                queue_definition: buildLifecycleStageQueueDefinition({
                    stageKey: "enrolling",
                    label: "Enrolling",
                    statusKeys: [],
                }),
            },
        });
        expect(needs).toBe(true);
    });
});

describe("stage-work-unit route idempotent POST", () => {
    it("POST upserts via resolveLifecycleStageWorkUnitIdentity helper", () => {
        const route = read("app/api/admin/enrollment-process/stage-work-unit/route.ts");
        expect(route).toContain("upsertLifecycleStageWorkUnitForDepartment");
        expect(route).not.toContain("Work Unit Queue already exists for stage");
    });

    it("repair and validation import identity resolver", () => {
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "resolveLifecycleStageWorkUnitIdentityForDepartment"
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "workUnitIdentityState"
        );
    });
});

describe("LifecycleStageWorkUnitIdentityConflictError", () => {
    it("exposes identity on conflict", () => {
        const identity = resolveLifecycleStageWorkUnitIdentity(
            { orgId: "o", departmentId: "d", stageKey: "enrolling" },
            [
                {
                    id: "1",
                    key: "lifecycle_wu_enrolling",
                    name: "A",
                    department_id: "d",
                    is_active: true,
                    queue_definition: {},
                    metadata: {},
                },
                {
                    id: "2",
                    key: "lifecycle_wu_enrolling",
                    name: "B",
                    department_id: "d",
                    is_active: true,
                    queue_definition: {},
                    metadata: {},
                },
            ]
        );
        const err = new LifecycleStageWorkUnitIdentityConflictError(identity);
        expect(err.identity.state).toBe("conflict");
    });
});
