/**
 * Stage save — queue_membership_v1.
 *
 * This file previously asserted the opposite of what it asserts now: that saving a stage with no
 * membership configured WRITES the enrollment template default into the builder. That was the
 * hidden authoring decision D1 forbids — opening and saving a stage mutated published
 * configuration the operator never chose. What must still hold is the runtime half: the work-unit
 * queue keeps receiving a resolved membership, because that is an executable projection, not
 * configuration.
 */
import { describe, expect, it, vi } from "vitest";
import {
    createStageSaveStore,
    createStageSaveSupabase,
    type DraftRow,
    type StageSaveStore,
} from "./helpers/stageSaveStore";
import { saveLifecycleStageRuntimeConfig } from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import { buildLifecycleStageQueueDefinition, lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

const ORG = "org-membership-save";
const DEPT = "dept-membership-save";
const PROCESS = "proc-enroll";

vi.mock("@/lib/lifecycle/persistEnrollmentStageStatusAssignments", () => ({
    persistStageStatusAssignments: vi.fn(async () => ({ changedIds: [] })),
    persistEnrollmentStageStatusAssignments: vi.fn(async () => ({ changedIds: [] })),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(async () => [
        {
            status_key: "offer_pending",
            status_label: "Offer pending",
            sort_order: 10,
            metadata: null,
            is_active: true,
            is_system: false,
            entity_type: "opportunities",
            org_id: ORG,
        },
        {
            status_key: "tour_scheduled",
            status_label: "Tour scheduled",
            sort_order: 11,
            metadata: null,
            is_active: true,
            is_system: false,
            entity_type: "opportunities",
            org_id: ORG,
        },
    ]),
}));

function builderPayload(stageKey: string, stageMembership?: QueueMembershipV1) {
    return {
        version: 1,
        active_process_id: PROCESS,
        processes: [
            {
                id: PROCESS,
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [
                    {
                        id: "stage-enrollment",
                        key: stageKey,
                        label: "Enrolling",
                        sort_order: 3,
                        is_active: true,
                        ...(stageMembership ? { queue_membership_v1: stageMembership } : {}),
                    },
                ],
            },
        ],
    };
}

function makeStore(
    stageKey: string,
    opts?: { stageMembership?: QueueMembershipV1; withWorkUnit?: boolean },
): StageSaveStore {
    const payload = builderPayload(stageKey, opts?.stageMembership);
    const draft: DraftRow = {
        id: "draft-1",
        org_id: ORG,
        department_id: DEPT,
        payload: structuredClone(payload),
        base_revision_id: null,
        draft_status: "draft",
        validation_errors: [],
    };
    return createStageSaveStore({
        department: {
            id: DEPT,
            org_id: ORG,
            metadata: {
                lifecycle_builder_owned_v1: { process_id: PROCESS, builder_owned: true },
                lifecycle_builder_v1: structuredClone(payload),
            },
        },
        drafts: [draft],
        workUnits: opts?.withWorkUnit
            ? [
                  {
                      id: "wu-existing",
                      org_id: ORG,
                      department_id: DEPT,
                      key: lifecycleStageWorkUnitKey(stageKey),
                      name: "Enrolling",
                      sort_order: 3,
                      is_active: true,
                      queue_definition: buildLifecycleStageQueueDefinition({
                          stageKey,
                          label: "Enrolling",
                          statusKeys: ["offer_pending"],
                      }),
                      metadata: {
                          lifecycle_stage_key: stageKey,
                          lifecycle_builder_owned_v1: { builder_owned: true },
                      },
                  },
              ]
            : [],
    });
}

function draftStage(store: StageSaveStore): Record<string, unknown> {
    const payload = store.business_process_drafts[0]!.payload as {
        processes: Array<{ stages: Array<Record<string, unknown>> }>;
    };
    return payload.processes[0]!.stages[0]!;
}

describe("saveLifecycleStageRuntimeConfig queue_membership_v1", () => {
    it("does NOT author the template default into configuration", async () => {
        const store = makeStore("enrollment");

        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
            workUnitName: "Enrolling",
        });

        expect(result.status).toBe("saved");
        expect(draftStage(store)[QUEUE_MEMBERSHIP_METADATA_KEY]).toBeUndefined();
    });

    it("still denormalizes a resolved membership onto the executable queue", async () => {
        const store = makeStore("enrollment");

        await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
            workUnitName: "Enrolling",
        });

        const wu = store.work_units[0]!;
        expect(wu.metadata[QUEUE_MEMBERSHIP_METADATA_KEY]).toBeTruthy();
        expect((wu.metadata[QUEUE_MEMBERSHIP_METADATA_KEY] as QueueMembershipV1).stage_key).toBe(
            "enrollment",
        );
        expect((wu.queue_definition as { metadata?: { subject_type?: string } }).metadata?.subject_type).toBe(
            "child",
        );
    });

    it("preserves explicit stage membership on save", async () => {
        const explicit: QueueMembershipV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "enrollment",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: ["custom_disposition"],
        };
        const store = makeStore("enrollment", { stageMembership: explicit });

        await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
            workUnitName: "Enrolling",
        });

        expect(
            (draftStage(store)[QUEUE_MEMBERSHIP_METADATA_KEY] as QueueMembershipV1)
                .included_disposition_keys,
        ).toEqual(["custom_disposition"]);
    });

    it("writes an explicitly submitted membership to the draft", async () => {
        const store = makeStore("enrollment");

        await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
            queueMembership: {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "enrollment",
                subject_type: "child",
                count_unit: "enrollment_tracks",
                included_disposition_keys: ["operator_chose_this"],
            },
        });

        expect(
            (draftStage(store)[QUEUE_MEMBERSHIP_METADATA_KEY] as QueueMembershipV1)
                .included_disposition_keys,
        ).toEqual(["operator_chose_this"]);
    });

    it("denormalizes membership to an existing work unit without a name change", async () => {
        const store = makeStore("enrollment", { withWorkUnit: true });

        await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
        });

        expect(store.work_units).toHaveLength(1);
        expect(store.work_units[0]!.metadata[QUEUE_MEMBERSHIP_METADATA_KEY]).toBeTruthy();
        expect(store.work_units[0]!.name).toBe("Enrolling");
    });
});
