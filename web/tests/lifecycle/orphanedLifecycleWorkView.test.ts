/**
 * C2 — the residual `…/lifecycle_qualification` warm GET is emitted because a Work View bound to a
 * DELETED lifecycle stage still resolves its lane (the lane physically survives in the queue
 * definition). The single upstream owner (`savedWorkViewsFromDepartmentMetadata`) must drop such
 * orphaned views so the ghost pill — and every fetch/totals/prefetch path that reads through it —
 * disappears in one place. Active-stage lifecycle views and non-lifecycle views must be preserved.
 */

import { describe, expect, it } from "vitest";
import {
    isOrphanedLifecycleWorkView,
    savedWorkViewsFromDepartmentMetadata,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { primaryQueueKeyForLifecycleStage } from "@/lib/lifecycle/lifecycleStageWorkUnit";

describe("isOrphanedLifecycleWorkView", () => {
    const active = new Set([
        primaryQueueKeyForLifecycleStage("lead"), // lifecycle_lead
        primaryQueueKeyForLifecycleStage("enrolled"), // lifecycle_enrolled
    ]);

    it("flags a lifecycle lane whose stage is not in the active set (the deleted Qualification stage)", () => {
        expect(isOrphanedLifecycleWorkView({ compat_queue_key: "lifecycle_qualification" }, active)).toBe(true);
    });

    it("keeps a lifecycle lane whose stage is still active", () => {
        expect(isOrphanedLifecycleWorkView({ compat_queue_key: "lifecycle_lead" }, active)).toBe(false);
    });

    it("never touches non-lifecycle lanes (predicate-only / all-records / sibling aggregates)", () => {
        expect(isOrphanedLifecycleWorkView({ compat_queue_key: null }, active)).toBe(false);
        expect(isOrphanedLifecycleWorkView({ compat_queue_key: "" }, active)).toBe(false);
        expect(isOrphanedLifecycleWorkView({ compat_queue_key: "all_records" }, active)).toBe(false);
        expect(isOrphanedLifecycleWorkView({ compat_queue_key: "pipeline_total" }, active)).toBe(false);
    });
});

describe("savedWorkViewsFromDepartmentMetadata drops the orphaned Qualification view", () => {
    function metadataWith(stages: Array<{ key: string; is_active: boolean }>, workViews: Array<Record<string, unknown>>) {
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
                        stages: stages.map((s, i) => ({
                            id: `stage-${s.key}`,
                            key: s.key,
                            label: s.key,
                            is_active: s.is_active,
                            sort_order: i,
                        })),
                        work_views_v1: workViews,
                    },
                ],
            },
        };
    }

    // Lifecycle-bound views carry a real filter — a filterless view is a "catch-all" whose
    // compat_queue_key the parser strips (so it would never be an orphan candidate anyway).
    const stageFilter = (v: string) => [{ field_key: "opportunity_stage", operator: "equals", value: v }];
    const views = [
        { id: "v-lead", label: "New Leads", compat_queue_key: "lifecycle_lead", display_order: 1, visible_in_runtime: true, filters_v1: stageFilter("lead") },
        { id: "v-qual", label: "Qualification", compat_queue_key: "lifecycle_qualification", display_order: 2, visible_in_runtime: true, filters_v1: stageFilter("qualification") },
        { id: "v-all", label: "All Leads", compat_queue_key: null, display_order: 3, visible_in_runtime: true, filters_v1: [] },
    ];

    it("removes the view bound to the deleted stage, keeps active + predicate-only views", () => {
        const meta = metadataWith(
            [
                { key: "lead", is_active: true },
                { key: "qualification", is_active: false }, // stage deleted / deactivated
                { key: "enrolled", is_active: true },
            ],
            views,
        );
        const kept = savedWorkViewsFromDepartmentMetadata(meta).map((v) => v.id);
        expect(kept).toEqual(["v-lead", "v-all"]);
        expect(kept).not.toContain("v-qual");
    });

    it("keeps the Qualification view when its stage IS active (no false positive)", () => {
        const meta = metadataWith(
            [
                { key: "lead", is_active: true },
                { key: "qualification", is_active: true },
            ],
            views,
        );
        const kept = savedWorkViewsFromDepartmentMetadata(meta).map((v) => v.id);
        expect(kept).toContain("v-qual");
    });
});
