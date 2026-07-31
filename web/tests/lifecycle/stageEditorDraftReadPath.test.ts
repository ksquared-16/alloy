/**
 * The Stage editor's read contract (Law 4, editor slice 2).
 *
 * Slice 1 made the save write a draft; the editor kept reloading from the published projection, so
 * an operator's saved change appeared to vanish. These tests pin the other half: what the editor
 * reads, in what order, and what it must NOT fall back to.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    createStageSaveStore,
    createStageSaveSupabase,
    projectionWrites,
    type DraftRow,
    type StageSaveStore,
} from "./helpers/stageSaveStore";
import { buildLifecycleStageBootstrap } from "@/lib/lifecycle/buildLifecycleStageBootstrap";
import { saveLifecycleStageRuntimeConfig } from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import {
    loadBusinessProcessEditorState,
    buildBusinessProcessEditorState,
} from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { readDraft } from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";
import { parseLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

const ORG = "org-read-path";
const DEPT = "dept-read-path";
const PROCESS = "proc-enrollment";
const REVISION = "rev-1";

// ── The heavy, unrelated loaders the bootstrap fans out to. None of them is under test here. ──
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(async () => []),
}));
vi.mock("@/lib/admin/forms/formsAdminDb", () => ({
    dbListFormDefinitions: vi.fn(async () => ({ data: [], error: null })),
}));
vi.mock("@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle", () => ({
    loadOrgFieldDefinitionsForLifecycle: vi.fn(async () => []),
}));
vi.mock("@/lib/lifecycle/loadLifecycleBuilderConfiguredActions", () => ({
    loadLifecycleBuilderConfiguredActions: vi.fn(async () => []),
}));
vi.mock("@/lib/lifecycle/filterSaveableLifecycleBaseActions", () => ({
    filterSaveableLifecycleBaseActions: vi.fn(async () => []),
}));
vi.mock("@/lib/admin/entityLabelsResolve", () => ({
    resolveEntityLabelsForOrg: vi.fn(async () => ({ effective: [] })),
}));
vi.mock("@/lib/admin/entityLabelsServer", () => ({
    entityLabelsMapFromEffective: vi.fn(() => ({})),
}));
vi.mock("@/lib/lifecycle/loadQueueMembershipStatusOptions", () => ({
    loadQueueMembershipStatusOptions: vi.fn(async () => []),
}));
vi.mock("@/lib/lifecycle/loadStatusCategoryCatalog", () => ({
    loadBusinessProcessStatusCategoryCatalog: vi.fn(async () => []),
}));
vi.mock("@/lib/lifecycle/persistEnrollmentStageStatusAssignments", () => ({
    persistStageStatusAssignments: vi.fn(async () => ({ changedIds: [] })),
    persistEnrollmentStageStatusAssignments: vi.fn(async () => ({ changedIds: [] })),
}));

function builderPayload(opts?: { tourLabel?: string; withPlan?: boolean }): Record<string, unknown> {
    return {
        version: 1,
        active_process_id: PROCESS,
        unknown_builder_key_v1: { kept: true },
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
                        id: "stage-tour",
                        key: "tour",
                        label: opts?.tourLabel ?? "Tour",
                        sort_order: 0,
                        is_active: true,
                        row_grain_v1: { grain: "child" },
                        ...(opts?.withPlan
                            ? {
                                  stage_operating_plan_v1: {
                                      version: 1,
                                      lifecycle_key: "enrollment",
                                      stage_key: "tour",
                                      journey_segment: "family",
                                      purpose: "from the draft",
                                  },
                              }
                            : {}),
                    },
                    {
                        id: "stage-enrollment",
                        key: "enrollment",
                        label: "Enrolling",
                        sort_order: 1,
                        is_active: true,
                    },
                ],
            },
        ],
    };
}

function makeStore(opts?: {
    drafts?: DraftRow[];
    publishedPayload?: Record<string, unknown> | null;
    publications?: { revision_id: string; revision_number: number }[];
}): StageSaveStore {
    const published = opts?.publishedPayload === undefined ? builderPayload() : opts.publishedPayload;
    return createStageSaveStore({
        department: {
            id: DEPT,
            org_id: ORG,
            metadata: {
                lifecycle_builder_owned_v1: { process_id: PROCESS, builder_owned: true },
                ...(published ? { lifecycle_builder_v1: published } : {}),
            },
        },
        drafts: opts?.drafts ?? [],
        publications: (opts?.publications ?? []).map((p) => ({
            org_id: ORG,
            domain_key: "business_process",
            subject_id: DEPT,
            revision_id: p.revision_id,
            revision_number: p.revision_number,
        })),
    });
}

async function bootstrap(store: StageSaveStore, stageKey = "tour") {
    return buildLifecycleStageBootstrap({
        supabase: createStageSaveSupabase(store),
        orgId: ORG,
        departmentId: DEPT,
        builderStageKey: stageKey,
        actorUserId: "user-1",
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("editor read precedence", () => {
    it("1: initializes the draft from the latest publication", async () => {
        const store = makeStore({
            publications: [{ revision_id: REVISION, revision_number: 3 }],
        });

        const state = await loadBusinessProcessEditorState(createStageSaveSupabase(store), {
            orgId: ORG,
            departmentId: DEPT,
            actorUserId: "user-1",
        });

        expect(state).not.toBeNull();
        // Seeded from what is live, and carrying the conflict token for that publication.
        expect(state!.draft_payload).toEqual(store.publishedBuilderBaseline);
        expect(state!.base_revision_id).toBe(REVISION);
        expect(state!.published_revision_number).toBe(3);
        expect(state!.unpublished_changes).toBe(false);
        expect(state!.status).toBe("published");
    });

    it("2: seeds a brand-new process from the template exactly once", async () => {
        const store = makeStore({ publishedPayload: null });
        const supabase = createStageSaveSupabase(store);
        const templateSeed = parseLifecycleBuilderV1(builderPayload())!;

        const first = await loadBusinessProcessEditorState(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            templateSeed,
        });
        expect(first!.draft_payload.processes).toHaveLength(1);
        expect(store.business_process_drafts).toHaveLength(1);

        // Second open must reuse the draft, not re-seed over the operator's work.
        store.business_process_drafts[0]!.payload = { version: 1, active_process_id: null, processes: [] };
        const second = await loadBusinessProcessEditorState(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            templateSeed,
        });
        expect(second!.draft_payload.processes).toEqual([]);
        expect(store.business_process_drafts).toHaveLength(1);
    });

    it("3+17: reads the draft, not the published projection", async () => {
        // The two disagree on purpose. Only a draft read can produce the draft's answer.
        const store = makeStore({
            drafts: [
                {
                    id: "draft-1",
                    org_id: ORG,
                    department_id: DEPT,
                    payload: builderPayload({ tourLabel: "Tour (draft)", withPlan: true }),
                    base_revision_id: REVISION,
                    draft_revision: 4,
                    draft_status: "draft",
                    validation_errors: [],
                },
            ],
            publications: [{ revision_id: REVISION, revision_number: 1 }],
        });

        const payload = await bootstrap(store);

        expect(payload.stage_operating_plan?.purpose).toBe("from the draft");
        expect(payload.configuration_state?.draft_revision).toBe(4);
        expect(payload.configuration_state?.unpublished_changes).toBe(true);
        expect(payload.configuration_state?.status).toBe("unpublished_changes");
        // The published projection has no plan at all — proving the read did not come from there.
        const publishedStage = (
            (store.publishedBuilderBaseline as { processes: Array<{ stages: Array<Record<string, unknown>> }> })
                .processes[0]!.stages
        ).find((s) => s.key === "tour")!;
        expect(publishedStage.stage_operating_plan_v1).toBeUndefined();
    });

    it("4+5: a saved stage edit survives a reload, and runtime does not move", async () => {
        const store = makeStore({ publications: [{ revision_id: REVISION, revision_number: 1 }] });
        const supabase = createStageSaveSupabase(store);

        // Materialize the draft the way the editor's first load does.
        await bootstrap(store);

        const saved = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "tour",
            selectedStatusKeys: ["tour_scheduled"],
            actorUserId: "user-1",
            stageV2Draft: { purpose: "Show families the school" },
        });
        expect(saved.status).toBe("saved");
        expect(saved.publication_required).toBe(true);

        // The reload. This is the assertion the previous slice could not make.
        const reloaded = await bootstrap(store);
        const stage = (
            reloaded.configuration_state && (await readDraft(supabase, { orgId: ORG, departmentId: DEPT }))
        )?.payload as { processes: Array<{ stages: Array<Record<string, unknown>> }> };
        expect(stage.processes[0]!.stages.find((s) => s.key === "tour")!.purpose).toBe(
            "Show families the school",
        );
        expect(reloaded.configuration_state?.status).toBe("unpublished_changes");
        expect(reloaded.configuration_state?.draft_revision).toBeGreaterThan(1);

        // Runtime is untouched: no write changed the published builder.
        expect(projectionWrites(store)).toHaveLength(0);
        expect(store.departments[0]!.metadata.lifecycle_builder_v1).toEqual(
            store.publishedBuilderBaseline,
        );
    });

    it("6: a stale draft-edit token blocks the save and writes nothing", async () => {
        const store = makeStore({
            drafts: [
                {
                    id: "draft-1",
                    org_id: ORG,
                    department_id: DEPT,
                    payload: builderPayload(),
                    base_revision_id: REVISION,
                    draft_revision: 7,
                    draft_status: "draft",
                    validation_errors: [],
                },
            ],
            publications: [{ revision_id: REVISION, revision_number: 1 }],
        });

        const result = await saveLifecycleStageRuntimeConfig(createStageSaveSupabase(store), {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "tour",
            selectedStatusKeys: ["tour_scheduled"],
            expectedDraftRevision: 6,
            stageV2Draft: { purpose: "Late edit" },
        });

        expect(result.status).toBe("stale_conflict");
        expect(result.conflict).toMatchObject({
            kind: "draft_edit",
            code: "business_process_draft_edit_conflict",
            current_draft_revision: 7,
            attempted_draft_revision: 6,
        });
        expect(store.writes).toHaveLength(0);
    });

    it("13+14: unknown fields survive, and template defaults never reappear", async () => {
        const store = makeStore({ publications: [{ revision_id: REVISION, revision_number: 1 }] });
        const supabase = createStageSaveSupabase(store);
        await bootstrap(store);

        await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
            actorUserId: "user-1",
            stageV2Draft: { purpose: "Complete enrollment" },
        });

        const draft = await readDraft(supabase, { orgId: ORG, departmentId: DEPT });
        const payload = draft!.payload as {
            unknown_builder_key_v1?: unknown;
            processes: Array<{ stages: Array<Record<string, unknown>> }>;
        };
        expect(payload.unknown_builder_key_v1).toEqual({ kept: true });
        expect(payload.processes[0]!.stages.find((s) => s.key === "tour")!.row_grain_v1).toEqual({
            grain: "child",
        });

        // `enrollment` HAS a template membership default and a legacy operating-plan default.
        // Neither the save nor the reload may resurrect them.
        const enrolling = payload.processes[0]!.stages.find((s) => s.key === "enrollment")!;
        expect(enrolling.queue_membership_v1).toBeUndefined();
        expect(enrolling.stage_operating_plan_v1).toBeUndefined();

        const reloaded = await bootstrap(store, "enrollment");
        expect(reloaded.queue_membership).toBeNull();
        expect(reloaded.stage_operating_plan).toBeNull();
    });
});

describe("editor state derivation", () => {
    const draft = (over?: Partial<DraftRow>) => ({
        id: "draft-1",
        departmentId: DEPT,
        payload: builderPayload(),
        baseRevisionId: REVISION,
        draftRevision: 2,
        status: "draft" as const,
        validationErrors: [],
        ...over,
    });

    it("7: a publication newer than the draft's base reads as a conflict", () => {
        const state = buildBusinessProcessEditorState({
            departmentId: DEPT,
            draft: draft(),
            publication: {
                revisionId: "rev-9",
                revisionNumber: 9,
                payloadChecksum: "other",
                publishedAt: "2026-07-31T00:00:00.000Z",
            },
            publishedPayload: builderPayload(),
        });

        expect(state.draft_is_stale).toBe(true);
        expect(state.status).toBe("draft_conflict");
    });

    it("8: blocking issues carry an object-level path", () => {
        const brokenPayload = builderPayload();
        // An outcome naming a transition the stage does not declare — the class that started this
        // sprint, and the one publication must refuse.
        (
            brokenPayload.processes as Array<{ stages: Array<Record<string, unknown>> }>
        )[0]!.stages[0]!.stage_operating_plan_v1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            journey_segment: "family",
            outcome_rules: [
                {
                    rule_key: "tour_done",
                    when_outcome_key: "completed",
                    targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
                },
            ],
        };

        const state = buildBusinessProcessEditorState({
            departmentId: DEPT,
            draft: draft({ payload: brokenPayload } as never),
            publication: {
                revisionId: REVISION,
                revisionNumber: 1,
                payloadChecksum: "published",
                publishedAt: "2026-07-31T00:00:00.000Z",
            },
            publishedPayload: builderPayload(),
        });

        expect(state.status).toBe("publication_blocked");
        expect(state.validation.errors).toHaveLength(1);
        expect(state.validation.errors[0]).toMatchObject({
            code: "dangling_stage_reference",
            stage_key: "tour",
        });
        expect(state.validation.errors[0]!.path).toContain("stages[tour].stage_operating_plan_v1");
        expect(state.validation.errors[0]!.detail?.invalid_target).toBe("lead_to_tour");
    });

    it("12: after publication the editor reads Published, with the new revision", () => {
        const payload = builderPayload();
        const state = buildBusinessProcessEditorState({
            departmentId: DEPT,
            draft: draft({ payload, baseRevisionId: "rev-2" } as never),
            publication: {
                revisionId: "rev-2",
                revisionNumber: 2,
                payloadChecksum: businessProcessPayloadChecksum(payload),
                publishedAt: "2026-07-31T00:00:00.000Z",
            },
            publishedPayload: payload,
        });

        expect(state.status).toBe("published");
        expect(state.unpublished_changes).toBe(false);
        expect(state.publication_required).toBe(false);
        expect(state.published_revision_number).toBe(2);
        expect(state.draft_is_stale).toBe(false);
    });

    it("a pre-publication tenant whose draft matches its live config is not falsely dirty", () => {
        const payload = builderPayload();
        const state = buildBusinessProcessEditorState({
            departmentId: DEPT,
            draft: draft({ payload, baseRevisionId: null } as never),
            publication: null,
            publishedPayload: payload,
        });
        expect(state.unpublished_changes).toBe(false);
        expect(state.status).toBe("published");
    });
});
