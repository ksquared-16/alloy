/**
 * End-to-end contract: enrolling stage status → work unit → validation.
 * Exercises saveLifecycleStageRuntimeConfig (not helper-only assertions).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    createStageSaveStore,
    createStageSaveSupabase,
    type StageSaveStore,
} from "./helpers/stageSaveStore";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    saveLifecycleStageRuntimeConfig,
    validateLifecycleStageRuntimeConfigSnapshot,
} from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import { summarizeBuilderOwnedQueueFilterValidation } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { executableStatusKeysFromLifecycleQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { parseProcessStageKeyFromStatusMetadata } from "@/lib/businessProcesses/processStageMetadata";

const ORG = "org-contract";
const DEPT = "dept-contract";
const PROCESS = "proc-enroll";

function builderPayload() {
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
                        id: "stage-enrolling",
                        key: "enrolling",
                        label: "Enrolling",
                        sort_order: 3,
                        is_active: true,
                    },
                ],
            },
        ],
    };
}

/**
 * The department carries the PUBLISHED projection; the draft carries what the editor mutates.
 * The save must move the draft and leave the projection alone, so both are seeded here.
 */
function createContractStore(): StageSaveStore {
    return createStageSaveStore({
        department: {
            id: DEPT,
            org_id: ORG,
            metadata: {
                lifecycle_builder_owned_v1: { process_id: PROCESS, builder_owned: true },
                lifecycle_builder_v1: builderPayload(),
            },
        },
        drafts: [
            {
                id: "draft-contract",
                org_id: ORG,
                department_id: DEPT,
                payload: builderPayload(),
                base_revision_id: null,
                draft_status: "draft",
                validation_errors: [],
            },
        ],
        // `enrolling` is a CHILD-track stage, so its statuses are assigned on
        // opportunity_customer_members, not opportunities. Both rows are seeded so the assertion
        // is about which one the save actually reconciles.
        statusDefinitions: [
            {
                id: "sd-enrolling-case",
                org_id: ORG,
                entity_type: "opportunities",
                status_key: "enrolling",
                status_label: "Enrolling",
                sort_order: 10,
                metadata: null,
                is_active: true,
            },
            {
                id: "sd-enrolling-child",
                org_id: ORG,
                entity_type: "opportunity_customer_members",
                status_key: "enrolling",
                status_label: "Enrolling",
                sort_order: 10,
                metadata: null,
                is_active: true,
            },
        ],
    });
}

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(),
}));

vi.mock("@/lib/lifecycle/ensureOrgOpportunityStatus", () => ({
    ensureOrgOpportunityStatusRow: vi.fn(
        async (
            _supabase: SupabaseClient,
            orgId: string,
            statusKey: string,
            eff: { status_label: string; sort_order: number; is_active: boolean }
        ) => ({
            id: `sd-${statusKey}`,
            metadata: { status_label: eff.status_label },
        })
    ),
}));

import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

describe("Lifecycle Builder — enrolling stage runtime config contract", () => {
    let store: StageSaveStore;
    let supabase: SupabaseClient;

    beforeEach(() => {
        store = createContractStore();
        supabase = createStageSaveSupabase(store);
        vi.mocked(fetchEffectiveStatusDefinitions).mockImplementation(async () => ([
            {
                id: "sd-enrolling",
                industry_key: null,
                status_key: "enrolling",
                status_label: "Enrolling",
                sort_order: 10,
                metadata: store.status_definitions[0]!.metadata,
                is_active: true,
                is_system: false,
                entity_type: "opportunities",
                org_id: ORG,
            },
        ]) as import("@/lib/admin/statusDefinitionsResolve").StatusDefinitionRow[]);
    });

    const activation: LifecycleActivationV1 = {
        version: 1,
        lifecycle_name: "Enrollment",
        primary_entity: "opportunity",
        primary_record_label: "Lead",
        process_id: PROCESS,
        stage_key: "enrolling",
        stage_label: "Enrolling",
        work_unit_id: null,
        work_unit_name: "Enrolling",
        status_keys: ["enrolling"],
        status_labels: ["Enrolling"],
        action_definition_id: null,
        action_placement_ids: [],
        activation_owned: true,
        completed_steps: 4,
        updated_at: "2026-06-01T00:00:00.000Z",
    };

    it("1–6: save statuses + work unit writes enrolling filters and metadata", async () => {
        const saved = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        expect(saved.status).toBe("saved");
        expect(saved.publication_required).toBe(true);
        const first = saved.snapshot!;
        expect(first.stageKey).toBe("enrolling");
        expect(first.selectedStatusKeys).toEqual(["enrolling"]);
        expect(first.workUnitKey).toBe(lifecycleStageWorkUnitKey("enrolling"));
        expect(first.workUnitId).toBeTruthy();
        expect(first.synced).toBe(true);
        expect(first.queueFilterKeys).toContain("enrolling");
        expect(first.metadataStatusKeys).toContain("enrolling");

        const childRow = store.status_definitions.find((r) => r.id === "sd-enrolling-child")!;
        expect(parseProcessStageKeyFromStatusMetadata(childRow.metadata as Record<string, unknown>)).toBe(
            "enrolling",
        );

        const wu = store.work_units.find((w) => w.key === lifecycleStageWorkUnitKey("enrolling"));
        expect(wu).toBeTruthy();
        expect(wu!.name).toBe("Enrolling");
        const filterKeys = executableStatusKeysFromLifecycleQueueDefinition(
            { key: wu!.key, queue_definition: wu!.queue_definition },
            "enrolling"
        );
        expect(filterKeys).toContain("enrolling");
        expect((wu!.metadata as { status_keys?: string[] }).status_keys).toContain("enrolling");

        const payload = buildEnrollmentStatusStagesPayload(
            store.status_definitions.map((r) => ({
                status_key: r.status_key,
                status_label: r.status_label,
                sort_order: r.sort_order,
                metadata: r.metadata,
            })),
            ["enrolling"]
        );
        expect(payload.stages.enrolling?.statuses.map((s) => s.status_key)).toContain("enrolling");
    });

    it("7–8: runtime validation passes queue filters connected for contract snapshot", async () => {
        const savedForValidation = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        const row = validateLifecycleStageRuntimeConfigSnapshot(savedForValidation.snapshot!, activation);
        expect(row.pass).toBe(true);
        const summary = summarizeBuilderOwnedQueueFilterValidation([row]);
        expect(summary.pass).toBe(true);
    });

    it("9–10: repeat save is idempotent — no missing-status error, still synced", async () => {
        await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        const second = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        expect(second.snapshot!.synced).toBe(true);
        expect(second.snapshot!.selectedStatusKeys).toEqual(["enrolling"]);
        expect(store.work_units.filter((w) => w.key === lifecycleStageWorkUnitKey("enrolling"))).toHaveLength(
            1
        );
    });

    it("never falls back to a match-all queue when selectedStatusKeys is empty", async () => {
        // `enrolling` is platform-managed, so an empty selection resolves to that stage's managed
        // vocabulary rather than to "everything". A stage with no managed vocabulary still throws
        // (requireLifecycleStageQueueStatusKeys), which is the case the guard exists for.
        const saved = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            stageKey: "enrolling",
            selectedStatusKeys: [],
            workUnitName: "Enrolling",
        });

        expect(saved.snapshot!.selectedStatusKeys.length).toBeGreaterThan(0);
        expect(saved.snapshot!.queueFilterKeys.length).toBeGreaterThan(0);

        await expect(
            saveLifecycleStageRuntimeConfig(supabase, {
                orgId: ORG,
                departmentId: DEPT,
                stageKey: "enrolling",
                selectedStatusKeys: ["   "],
                workUnitName: "Enrolling",
            }),
        ).resolves.toMatchObject({ status: "saved" });
    });
});
