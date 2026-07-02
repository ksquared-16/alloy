import { describe, expect, it } from "vitest";
import { resolveOperatorLifecycleWorkQueueNavEntriesForDepartment } from "@/lib/admin/buildOperatorLifecycleLanding";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import type { QueueItemsResult } from "@/lib/queues/types";
import {
    queueTotalCountFromQueueItemsResult,
    workViewLinkFromWorkQueuePreview,
    workViewLinkModelsFromConfiguredViews,
} from "@/lib/presentation/runtime/types";

/**
 * RENAMED-LABEL FIXTURE (product-owner requirement): a department whose Work Views were
 * renamed in config ("Fresh Prospects", "Momentum"). Everything operator-facing — nav entry
 * labels, hrefs, pill labels — must come purely from this config with no code change, and no
 * output may leak internal keys ("Enrollment", "Pipeline", humanized slugs, underscores).
 */
const RENAMED_WORK_VIEWS = [
    { id: "fresh_prospects", label: "Fresh Prospects", compat_queue_key: "new_leads", display_order: 1 },
    { id: "momentum", label: "Momentum", display_order: 2 },
];

const DEPT_ID = "dept-1";

const DEPT_METADATA = {
    lifecycle_builder_v1: {
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: "family_onboarding",
                name: "Family Onboarding",
                is_active: true,
                stages: [],
                work_views_v1: RENAMED_WORK_VIEWS,
            },
        ],
    },
};

// Host work unit keeps its INTERNAL structure name/key — none of it may surface in outputs.
const HOST_WORK_UNIT = {
    id: "wu-pipeline",
    department_id: DEPT_ID,
    key: "enrollment_pipeline",
    name: "Enrollment Pipeline",
    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
};

function expectNoInternalLeak(text: string) {
    expect(text).not.toContain("Enrollment");
    expect(text).not.toContain("Pipeline");
    expect(text).not.toContain("_");
}

describe("renamed Work View labels flow purely from config", () => {
    const navEntries = resolveOperatorLifecycleWorkQueueNavEntriesForDepartment({
        departmentId: DEPT_ID,
        departmentMetadata: DEPT_METADATA,
        workUnits: [HOST_WORK_UNIT],
    });

    it("nav entries render the renamed labels and view-slug hrefs", () => {
        expect(navEntries.map((e) => e.label)).toEqual(["Fresh Prospects", "Momentum"]);
        expect(navEntries.map((e) => e.href)).toEqual([
            "/workspace/work-unit/fresh-prospects",
            "/workspace/work-unit/momentum",
        ]);
    });

    it("no nav output leaks internal keys, humanized slugs, or underscores", () => {
        for (const entry of navEntries) {
            expectNoInternalLeak(entry.label);
            expectNoInternalLeak(entry.href);
            expect(entry.href).not.toContain("?");
        }
    });

    it("workspace tile WorkViewLinkModels carry the renamed labels", () => {
        const links = navEntries.map(workViewLinkFromWorkQueuePreview);
        expect(links.map((l) => l.label)).toEqual(["Fresh Prospects", "Momentum"]);
        for (const link of links) {
            expectNoInternalLeak(link.label);
            if (link.href) expectNoInternalLeak(link.href);
        }
    });

    it("work-unit pill models carry the renamed labels from the same config", () => {
        const views = savedWorkViewsFromDepartmentMetadata(DEPT_METADATA);
        const pills = workViewLinkModelsFromConfiguredViews(views, { activeWorkViewId: "momentum" });
        expect(pills.map((p) => p.label)).toEqual(["Fresh Prospects", "Momentum"]);
        expect(pills.find((p) => p.id === "momentum")?.isActive).toBe(true);
        for (const pill of pills) expectNoInternalLeak(pill.label);
    });

    it("renamed view slugs resolve to the host work unit with the view selected (no code change)", () => {
        for (const [slug, viewId] of [
            ["fresh-prospects", "fresh_prospects"],
            ["momentum", "momentum"],
        ] as const) {
            const result = resolveWorkUnitByRouteSlug({
                slug,
                workUnits: [HOST_WORK_UNIT],
                departments: [{ id: DEPT_ID, key: "onboarding", name: "Onboarding", metadata: DEPT_METADATA }],
            });
            expect(result.status).toBe("resolved");
            if (result.status === "resolved") {
                expect(result.match.kind).toBe("work_view");
                expect(result.match.workUnitId).toBe("wu-pipeline");
                expect(result.match.initialWorkViewId).toBe(viewId);
            }
        }
    });

    it("a view without a configured label is omitted — never rendered as its raw id", () => {
        const views: WorkViewConfigV1Stored[] = [
            { id: "fresh_prospects", label: "Fresh Prospects" },
            { id: "mystery_view", label: "  " },
        ];
        const pills = workViewLinkModelsFromConfiguredViews(views, { activeWorkViewId: null });
        expect(pills.map((p) => p.id)).toEqual(["fresh_prospects"]);
        expect(pills.some((p) => p.label.includes("mystery") || p.label.includes("_"))).toBe(false);
    });
});

describe("queue count single source (QueueItemsResult.total)", () => {
    it("active view count derives from the SAME rows response total (count_mode=exact)", () => {
        const result = { total: 3 } as QueueItemsResult;
        expect(queueTotalCountFromQueueItemsResult(result)).toBe(3);

        // The model invariant: active pill count === queue.totalCount === rows-response total.
        const views: WorkViewConfigV1Stored[] = [
            { id: "fresh_prospects", label: "Fresh Prospects" },
            { id: "momentum", label: "Momentum" },
        ];
        const totalCount = queueTotalCountFromQueueItemsResult(result);
        const pills = workViewLinkModelsFromConfiguredViews(views, {
            activeWorkViewId: "fresh_prospects",
            countForView: (view) => (view.id === "fresh_prospects" ? totalCount : null),
        });
        expect(pills.find((p) => p.isActive)?.count).toBe(totalCount);
        expect(pills.find((p) => p.isActive)?.count).toBe(3);
    });

    it("omitted/missing totals resolve to null — no badge beats a wrong badge", () => {
        expect(queueTotalCountFromQueueItemsResult(null)).toBeNull();
        expect(queueTotalCountFromQueueItemsResult(undefined)).toBeNull();
        expect(queueTotalCountFromQueueItemsResult({ total: 5, total_omitted: true } as QueueItemsResult)).toBeNull();
        expect(
            queueTotalCountFromQueueItemsResult({ total: Number.NaN } as QueueItemsResult),
        ).toBeNull();
    });
});
