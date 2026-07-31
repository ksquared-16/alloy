/**
 * Pure stage draft transforms — determinism, purity, losslessness, and no hidden authoring.
 *
 * These are the properties that let the stage save apply five edits to one in-memory builder and
 * persist it once. If a transform reached for Supabase, mutated its input, or seeded a default,
 * the single-write guarantee would be a fiction.
 */

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
    createStageSaveStore,
    createStageSaveSupabase,
} from "./helpers/stageSaveStore";
import {
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    applyQueueMembershipDraft,
    applyStageOperatingPlanDraft,
    applyStagePerspectivesDraft,
    applyStageV2DraftFields,
    applyStatusRollupDraft,
} from "@/lib/lifecycle/stageDraftTransforms";
import {
    projectLifecycleStageQueueDefinition,
} from "@/lib/lifecycle/projectLifecycleStageQueueLanes";
import { buildLifecycleStageQueueDefinition, lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { upsertLifecycleStageWorkUnitForDepartment } from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";

const RAW_BUILDER = {
    version: 1,
    active_process_id: "proc-1",
    unknown_builder_key_v1: ["kept"],
    processes: [
        {
            id: "proc-1",
            key: "enrollment",
            name: "Enrollment",
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            unknown_process_key_v1: { a: 1 },
            stages: [
                {
                    id: "stage-tour",
                    key: "tour",
                    label: "Tour",
                    sort_order: 0,
                    is_active: true,
                    row_grain_v1: { grain: "child" },
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

function builder(): LifecycleBuilderV1 {
    const parsed = parseLifecycleBuilderV1(structuredClone(RAW_BUILDER));
    if (!parsed) throw new Error("fixture did not parse");
    return parsed;
}

const MEMBERSHIP = parseQueueMembershipV1({
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "tour",
    subject_type: "case",
    count_unit: "cases",
    included_disposition_keys: [],
});

const PLAN = parseStageOperatingPlanV1({
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
});

const ROLLUP = parseStatusRollupV1({
    version: 1,
    categories: [
        {
            category_key: "lead_statuses",
            entity_type: "opportunities",
            label: "Lead Statuses",
            selected_status_keys: ["tour_scheduled"],
        },
    ],
});

function stageOf(config: LifecycleBuilderV1, key: string) {
    return config.processes[0]!.stages.find((s) => s.key === key)!;
}

describe("stage draft transforms", () => {
    it("12: are deterministic — same input, byte-identical serialized output", () => {
        const a = applyStageOperatingPlanDraft(builder(), { stageKey: "tour", plan: PLAN });
        const b = applyStageOperatingPlanDraft(builder(), { stageKey: "tour", plan: PLAN });
        expect(JSON.stringify(serializeLifecycleBuilderV1(a.nextBuilder))).toBe(
            JSON.stringify(serializeLifecycleBuilderV1(b.nextBuilder)),
        );
    });

    it("12: are idempotent — re-applying the same edit changes nothing further", () => {
        const once = applyStageOperatingPlanDraft(builder(), { stageKey: "tour", plan: PLAN });
        const twice = applyStageOperatingPlanDraft(once.nextBuilder, { stageKey: "tour", plan: PLAN });
        expect(serializeLifecycleBuilderV1(twice.nextBuilder)).toEqual(
            serializeLifecycleBuilderV1(once.nextBuilder),
        );
    });

    it("do not mutate the builder they were given", () => {
        const original = builder();
        const before = JSON.stringify(serializeLifecycleBuilderV1(original));
        applyStatusRollupDraft(original, { stageKey: "tour", rollup: ROLLUP });
        applyQueueMembershipDraft(original, { stageKey: "tour", membership: MEMBERSHIP });
        applyStageV2DraftFields(original, { stageKey: "tour", draft: { purpose: "changed" } });
        expect(JSON.stringify(serializeLifecycleBuilderV1(original))).toBe(before);
    });

    it("compose onto one builder regardless of order", () => {
        const forward = applyQueueMembershipDraft(
            applyStatusRollupDraft(builder(), { stageKey: "tour", rollup: ROLLUP }).nextBuilder,
            { stageKey: "tour", membership: MEMBERSHIP },
        ).nextBuilder;
        const reverse = applyStatusRollupDraft(
            applyQueueMembershipDraft(builder(), { stageKey: "tour", membership: MEMBERSHIP })
                .nextBuilder,
            { stageKey: "tour", rollup: ROLLUP },
        ).nextBuilder;
        expect(serializeLifecycleBuilderV1(forward)).toEqual(serializeLifecycleBuilderV1(reverse));
    });

    it("10+11: preserve unknown fields at every level, including row_grain_v1", () => {
        const next = applyStageV2DraftFields(builder(), {
            stageKey: "tour",
            draft: { purpose: "Show families the school" },
        }).nextBuilder;
        const serialized = serializeLifecycleBuilderV1(next);
        expect(serialized.unknown_builder_key_v1).toEqual(["kept"]);
        const process = (serialized.processes as Array<Record<string, unknown>>)[0]!;
        expect(process.unknown_process_key_v1).toEqual({ a: 1 });
        const stage = (process.stages as Array<Record<string, unknown>>).find((s) => s.key === "tour")!;
        expect(stage.row_grain_v1).toEqual({ grain: "child" });
        expect(stage.purpose).toBe("Show families the school");
    });

    it("9: never seed — a null payload is a no-op, not a template default", () => {
        const membership = applyQueueMembershipDraft(builder(), {
            stageKey: "enrollment",
            membership: null,
        });
        const plan = applyStageOperatingPlanDraft(membership.nextBuilder, {
            stageKey: "enrollment",
            plan: null,
        });
        const stage = stageOf(plan.nextBuilder, "enrollment");
        expect(stage.queue_membership_v1).toBeUndefined();
        expect(stage.stage_operating_plan_v1).toBeUndefined();
        expect(plan.errors).toHaveLength(0);
    });

    it("clearing perspectives removes the key rather than storing an empty array", () => {
        const withRows = applyStagePerspectivesDraft(builder(), {
            stageKey: "tour",
            perspectives: [{ queue_key: "lifecycle_tour", label: "Lane" }],
            laneKeys: ["lifecycle_tour"],
        }).nextBuilder;
        expect(stageOf(withRows, "tour").perspectives_v1).toHaveLength(1);

        const cleared = applyStagePerspectivesDraft(withRows, {
            stageKey: "tour",
            perspectives: [],
            laneKeys: ["lifecycle_tour"],
        }).nextBuilder;
        const serialized = serializeLifecycleBuilderV1(cleared);
        const stage = (
            (serialized.processes as Array<Record<string, unknown>>)[0]!.stages as Array<
                Record<string, unknown>
            >
        ).find((s) => s.key === "tour")!;
        expect("perspectives_v1" in stage).toBe(false);
        // Residue still rides along after a key deletion.
        expect(stage.row_grain_v1).toEqual({ grain: "child" });
    });

    it("report an unconfigured stage as an error and change nothing", () => {
        const before = builder();
        const result = applyStatusRollupDraft(before, { stageKey: "ghost", rollup: ROLLUP });
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.code).toBe("stage_not_configured");
        expect(result.nextBuilder).toBe(before);
    });
});

describe("queue lane projection", () => {
    it("matches the queue_definition the work-unit upsert actually stores", async () => {
        const existing = buildLifecycleStageQueueDefinition({
            stageKey: "tour",
            label: "Tour",
            statusKeys: ["tour_scheduled"],
        });
        const store = createStageSaveStore({
            department: {
                id: "dept-1",
                org_id: "org-1",
                metadata: { lifecycle_builder_v1: structuredClone(RAW_BUILDER) },
            },
            workUnits: [
                {
                    id: "wu-1",
                    org_id: "org-1",
                    department_id: "dept-1",
                    key: lifecycleStageWorkUnitKey("tour"),
                    name: "Tour",
                    sort_order: 0,
                    is_active: true,
                    queue_definition: existing,
                    metadata: { lifecycle_stage_key: "tour" },
                },
            ],
        });

        const projected = projectLifecycleStageQueueDefinition({
            stageKey: "tour",
            displayName: "Tour",
            statusFilterKeys: ["tour_scheduled", "tour_completed"],
            existingQueueDefinition: existing,
            membership: MEMBERSHIP,
        });

        const { identity } = await upsertLifecycleStageWorkUnitForDepartment(
            createStageSaveSupabase(store),
            "org-1",
            "dept-1",
            "tour",
            {
                name: "Tour",
                processId: "proc-1",
                sortOrder: 0,
                stageLabel: "Tour",
                statusKeys: ["tour_scheduled", "tour_completed"],
                stageMembership: MEMBERSHIP,
            },
        );

        expect(identity.workUnit?.queue_definition).toEqual(projected);
    });
});

describe("14: no lifecycle helper writes the published projection", () => {
    const libDir = resolve(__dirname, "../../lib/lifecycle");

    it("no stage-save helper issues a departments update", () => {
        const offenders = readdirSync(libDir)
            .filter((f) => f.endsWith(".ts"))
            .filter((f) => {
                const source = readFileSync(resolve(libDir, f), "utf8");
                return source.includes('from("departments")') && /\.update\(/.test(source);
            });

        // The stage-save graph must be absent from this list. Files still on it are the editors
        // this sprint has not migrated yet — they are the remaining worklist, not a pass.
        expect(offenders).not.toContain("saveLifecycleStageRuntimeConfig.ts");
        expect(offenders).not.toContain("persistStatusRollupV1.ts");
        expect(offenders).not.toContain("persistQueueMembershipV1.ts");
        expect(offenders).not.toContain("persistStageOperatingPlanV1.ts");
        expect(offenders).not.toContain("persistStageV2DraftFields.ts");
        expect(offenders).not.toContain("stageDraftTransforms.ts");
    });

    it("the pure transforms import nothing that can write", () => {
        const source = readFileSync(resolve(libDir, "stageDraftTransforms.ts"), "utf8");
        expect(source).not.toContain("@supabase/supabase-js");
        expect(source).not.toContain("from(");
    });
});
