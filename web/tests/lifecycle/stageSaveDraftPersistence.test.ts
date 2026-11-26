/**
 * Stage Configuration save — draft persistence contract (Law 4, editor slice 1).
 *
 * What these assert is the SHAPE of the write, not just its content: one lifecycle draft write,
 * zero projection writes, companions idempotent and reported, and nothing written at all when
 * validation blocks. Those are the properties that make "no torn stage" true, and they are exactly
 * what the previous 4-6 sequential whole-column writes could not offer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createStageSaveStore,
    createStageSaveSupabase,
    draftWrites,
    projectionWrites,
    type DeptRow,
    type DraftRow,
    type StageSaveStore,
} from "./helpers/stageSaveStore";
import { saveLifecycleStageRuntimeConfig } from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import { buildLifecycleStageQueueDefinition, lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { projectLifecycleStageQueueLaneKeys } from "@/lib/lifecycle/projectLifecycleStageQueueLanes";

const ORG = "org-stage-save";
const DEPT = "dept-stage-save";
const PROCESS = "proc-enrollment";
const REVISION = "rev-1";

const assignStatuses = vi.fn(async () => ({ changedIds: [] as string[] }));

vi.mock("@/lib/lifecycle/persistEnrollmentStageStatusAssignments", () => ({
    persistStageStatusAssignments: (...args: unknown[]) => assignStatuses(...(args as [])),
    persistEnrollmentStageStatusAssignments: (...args: unknown[]) => assignStatuses(...(args as [])),
}));

vi.mock("@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle", () => ({
    loadOrgFieldDefinitionsForLifecycle: vi.fn(async () => []),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(async () => [
        {
            status_key: "tour_scheduled",
            status_label: "Tour scheduled",
            sort_order: 10,
            metadata: null,
            is_active: true,
            is_system: false,
            entity_type: "opportunities",
            org_id: ORG,
        },
        {
            status_key: "offer_pending",
            status_label: "Offer pending",
            sort_order: 11,
            metadata: null,
            is_active: true,
            is_system: false,
            entity_type: "opportunities",
            org_id: ORG,
        },
    ]),
}));

/**
 * A process that is ALREADY defective in a way unrelated to the stage under test: `lead` moves to
 * `qualification`, which is not in the inventory. Decision D3 says that must warn, never block an
 * edit to `tour`.
 */
function builderPayload(): Record<string, unknown> {
    return {
        version: 1,
        active_process_id: PROCESS,
        // Unknown at the builder level — Law 7 residue.
        experimental_builder_flag_v1: { enabled: true },
        processes: [
            {
                id: PROCESS,
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                // Unknown at the process level.
                process_notes_v9: "authored by a newer branch",
                stages: [
                    {
                        id: "stage-lead",
                        key: "lead",
                        label: "Lead",
                        sort_order: 0,
                        is_active: true,
                        stage_operating_plan_v1: {
                            version: 1,
                            lifecycle_key: "enrollment",
                            stage_key: "lead",
                            journey_segment: "family",
                            outcome_rules: [
                                {
                                    rule_key: "lead_advance",
                                    when_outcome_key: "advance",
                                    targets: [{ kind: "move_to_stage", stage_key: "qualification" }],
                                },
                            ],
                        },
                    },
                    {
                        id: "stage-tour",
                        key: "tour",
                        label: "Tour",
                        sort_order: 1,
                        is_active: true,
                        // The field that was wiped four times. It must survive every save.
                        row_grain_v1: { grain: "child" },
                    },
                    {
                        id: "stage-enrollment",
                        key: "enrollment",
                        label: "Enrolling",
                        sort_order: 2,
                        is_active: true,
                    },
                ],
            },
        ],
    };
}

function departmentRow(): DeptRow {
    return {
        id: DEPT,
        org_id: ORG,
        metadata: {
            lifecycle_builder_owned_v1: { process_id: PROCESS, builder_owned: true },
            lifecycle_builder_v1: builderPayload(),
        },
    };
}

function draftRow(overrides?: Partial<DraftRow>): DraftRow {
    return {
        id: "draft-1",
        org_id: ORG,
        department_id: DEPT,
        payload: builderPayload(),
        base_revision_id: REVISION,
        draft_status: "draft",
        validation_errors: [],
        ...overrides,
    };
}

function makeStore(opts?: { withWorkUnit?: boolean; draft?: Partial<DraftRow> }): StageSaveStore {
    return createStageSaveStore({
        department: departmentRow(),
        drafts: [draftRow(opts?.draft)],
        publications: [
            {
                org_id: ORG,
                domain_key: "business_process",
                subject_id: DEPT,
                revision_id: REVISION,
                revision_number: 1,
            },
        ],
        workUnits: opts?.withWorkUnit
            ? [
                  {
                      id: "wu-tour",
                      org_id: ORG,
                      department_id: DEPT,
                      key: lifecycleStageWorkUnitKey("tour"),
                      name: "Tour",
                      sort_order: 1,
                      is_active: true,
                      queue_definition: buildLifecycleStageQueueDefinition({
                          stageKey: "tour",
                          label: "Tour",
                          statusKeys: ["tour_scheduled"],
                      }),
                      metadata: {
                          lifecycle_stage_key: "tour",
                          lifecycle_builder_owned_v1: { builder_owned: true },
                      },
                  },
              ]
            : [],
    });
}

function savedStage(store: StageSaveStore, stageKey: string): Record<string, unknown> {
    const payload = store.business_process_drafts[0]!.payload as {
        processes: Array<{ stages: Array<Record<string, unknown>> }>;
    };
    const stage = payload.processes[0]!.stages.find((s) => s.key === stageKey);
    if (!stage) throw new Error(`stage ${stageKey} missing from saved draft`);
    return stage;
}

const baseInput = {
    orgId: ORG,
    departmentId: DEPT,
    processId: PROCESS,
    stageKey: "tour",
    selectedStatusKeys: ["tour_scheduled"],
    actorUserId: "user-1",
};

const tourPlan: unknown = {
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "tour",
    journey_segment: "family",
    outgoing_transitions: [
        {
            transition_ref: "tour_to_enrollment",
            source_stage_key: "tour",
            target_stage_key: "enrollment",
            label: "Enroll",
        },
    ],
};

const tourPlanToGhostStage: unknown = {
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "tour",
    journey_segment: "family",
    outgoing_transitions: [
        {
            transition_ref: "tour_to_ghost",
            source_stage_key: "tour",
            target_stage_key: "ghost_stage",
            label: "Nowhere",
        },
    ],
};

beforeEach(() => {
    assignStatuses.mockClear();
});

describe("stage save — draft persistence", () => {
    it("1: performs exactly one lifecycle draft write", async () => {
        const store = makeStore();
        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlan,
        });

        expect(result.status).toBe("saved");
        expect(draftWrites(store)).toHaveLength(1);
        expect(result.publication_required).toBe(true);
    });

    it("2: applies every builder mutation to the same in-memory builder", async () => {
        const store = makeStore({ withWorkUnit: true });
        const laneKeys = projectLifecycleStageQueueLaneKeys({
            stageKey: "tour",
            displayName: "Tour",
            statusFilterKeys: ["tour_scheduled"],
            existingQueueDefinition: store.work_units[0]!.queue_definition,
            membership: null,
        });

        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlan,
            queueMembership: {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "tour",
                subject_type: "child",
                count_unit: "enrollment_tracks",
                included_disposition_keys: ["enrolling"],
            },
            statusRollup: {
                version: 1,
                categories: [
                    {
                        category_key: "lead_statuses",
                        entity_type: "opportunities",
                        label: "Lead Statuses",
                        selected_status_keys: ["tour_scheduled"],
                    },
                ],
            },
            perspectivesV1: laneKeys.map((queue_key) => ({ queue_key, label: "Lane" })),
            stageV2Draft: { purpose: "Show families the school" },
        });

        expect(result.status).toBe("saved");
        // One write, every mutation in it.
        expect(draftWrites(store)).toHaveLength(1);
        const stage = savedStage(store, "tour");
        expect(stage.stage_operating_plan_v1).toBeTruthy();
        expect(stage.queue_membership_v1).toBeTruthy();
        expect(stage.status_rollup_v1).toBeTruthy();
        expect(stage.perspectives_v1).toBeTruthy();
        expect(stage.purpose).toBe("Show families the school");
    });

    it("3: a blocking failure before persistence leaves the prior draft untouched", async () => {
        const store = makeStore();
        const before = JSON.stringify(store.business_process_drafts[0]!.payload);

        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlanToGhostStage,
        });

        expect(result.status).toBe("blocked");
        expect(store.writes).toHaveLength(0);
        expect(JSON.stringify(store.business_process_drafts[0]!.payload)).toBe(before);
    });

    it("4: rejects a save whose draft was rebased by a publish", async () => {
        const store = makeStore({ draft: { base_revision_id: "rev-2" } });

        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlan,
            expectedBaseRevisionId: REVISION,
        });

        expect(result.status).toBe("stale_conflict");
        expect(result.conflict).toMatchObject({
            code: "business_process_draft_stale",
            current_base_revision_id: "rev-2",
            attempted_base_revision_id: REVISION,
        });
        expect(store.writes).toHaveLength(0);
    });

    it("5+7: an unrelated legacy defect warns but does not block the save", async () => {
        const store = makeStore();
        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlan,
        });

        expect(result.status).toBe("saved");
        expect(result.errors).toHaveLength(0);
        expect(result.warnings.map((w) => w.stage_key)).toContain("lead");
        expect(result.warnings.some((w) => w.detail?.invalid_target === "qualification")).toBe(true);
    });

    it("6: a dangling reference introduced by this edit blocks it", async () => {
        const store = makeStore();
        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlanToGhostStage,
        });

        expect(result.status).toBe("blocked");
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
            code: "dangling_stage_reference",
            stage_key: "tour",
        });
        expect(result.errors[0]!.detail?.invalid_target).toBe("ghost_stage");
    });

    it("8+15: an ordinary save never changes the published projection", async () => {
        const store = makeStore({ withWorkUnit: true });
        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlan,
            fieldRules: { required_rule_ids: [], recommended_rule_ids: [] },
        });

        expect(result.status).toBe("saved");
        // The field-rules companion DOES write departments.metadata — but carries the identical
        // builder, which is what the database guard's IS NOT DISTINCT FROM check permits.
        expect(store.writes.some((w) => w.table === "departments")).toBe(true);
        expect(projectionWrites(store)).toHaveLength(0);
        expect(store.departments[0]!.metadata.lifecycle_builder_v1).toEqual(
            store.publishedBuilderBaseline,
        );
    });

    it("9: an ordinary save persists no default the operator did not author", async () => {
        const store = makeStore();
        // `enrollment` HAS both a template membership default and a legacy operating-plan default,
        // and both used to be written into the projection by merely saving the stage.
        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
            stageV2Draft: { purpose: "Complete enrollment" },
        });

        expect(result.status).toBe("saved");
        const stage = savedStage(store, "enrollment");
        expect(stage.queue_membership_v1).toBeUndefined();
        expect(stage.stage_operating_plan_v1).toBeUndefined();
        // The process-level command-set stamp is likewise no longer authored by a stage save.
        const process = (
            store.business_process_drafts[0]!.payload as { processes: Array<Record<string, unknown>> }
        ).processes[0]!;
        expect(process.command_set_v1).toBeUndefined();
    });

    it("10+11: unknown fields and row_grain_v1 survive the save", async () => {
        const store = makeStore();
        await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageOperatingPlan: tourPlan,
        });

        const payload = store.business_process_drafts[0]!.payload as Record<string, unknown>;
        expect(payload.experimental_builder_flag_v1).toEqual({ enabled: true });
        const process = (payload.processes as Array<Record<string, unknown>>)[0]!;
        expect(process.process_notes_v9).toBe("authored by a newer branch");
        expect(savedStage(store, "tour").row_grain_v1).toEqual({ grain: "child" });
    });

    it("13: retrying the same save does not duplicate companion effects", async () => {
        const store = makeStore({ withWorkUnit: true });
        const supabase = createStageSaveSupabase(store);
        const input = { ...baseInput, workUnitName: "Tour", stageOperatingPlan: tourPlan };

        const first = await saveLifecycleStageRuntimeConfig(supabase, input);
        const second = await saveLifecycleStageRuntimeConfig(supabase, input);

        expect(first.status).toBe("saved");
        expect(second.status).toBe("saved");
        expect(store.work_units).toHaveLength(1);
        expect(assignStatuses).toHaveBeenCalledTimes(2);
        expect(assignStatuses.mock.calls[0]!.slice(1)).toEqual(assignStatuses.mock.calls[1]!.slice(1));
        // The second save is a genuine no-op on the builder, so it does not rewrite the draft.
        expect(draftWrites(store)).toHaveLength(1);
    });

    it("reports a companion failure honestly instead of failing the whole save", async () => {
        const store = makeStore({ withWorkUnit: true });
        store.failWrites.add("work_units");

        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            workUnitName: "Tour",
            stageOperatingPlan: tourPlan,
        });

        expect(result.status).toBe("saved");
        expect(draftWrites(store)).toHaveLength(1);
        expect(result.companion_writes).toContainEqual(
            expect.objectContaining({ key: "work_unit", status: "failed" }),
        );
    });

    it("still refuses a stage that is not in the configured inventory", async () => {
        const store = makeStore();
        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            ...baseInput,
            stageKey: "qualification",
        });

        expect(result.status).toBe("blocked");
        expect(result.errors[0]!.code).toBe("stage_not_configured");
        expect(store.writes).toHaveLength(0);
    });
});
