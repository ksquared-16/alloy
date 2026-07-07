import { describe, expect, it } from "vitest";
import { resolveOperatorLifecycleWorkQueueNavEntriesForDepartment } from "@/lib/admin/buildOperatorLifecycleLanding";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { workUnitRouteSlugsEquivalent } from "@/lib/admin/workUnitRouteSlug";
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
    // Real-world case: view ids are slugified from the CREATION-time name and survive renames.
    // This view was created as "New work view 2" and later renamed — routing must follow the
    // configured label ("hot-list"), never the fossilized internal id.
    { id: "new_work_view_2", label: "Hot List", display_order: 3 },
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

    it("nav entries render the renamed labels and LABEL-derived slug hrefs", () => {
        expect(navEntries.map((e) => e.label)).toEqual(["Fresh Prospects", "Momentum", "Hot List"]);
        expect(navEntries.map((e) => e.href)).toEqual([
            "/workspace/work-unit/fresh-prospects",
            "/workspace/work-unit/momentum",
            // NOT /workspace/work-unit/new-work-view-2 — the internal id never routes outward.
            "/workspace/work-unit/hot-list",
        ]);
    });

    it("no nav output leaks internal keys, humanized slugs, or underscores", () => {
        for (const entry of navEntries) {
            expectNoInternalLeak(entry.label);
            expectNoInternalLeak(entry.href);
            expect(entry.href).not.toContain("?");
        }
    });

    it("entries carry route_key (label-derived) + the view's canonical count location", () => {
        expect(navEntries.map((e) => e.route_key)).toEqual([
            "fresh_prospects",
            "momentum",
            // Label-derived — NOT the fossil id `new_work_view_2`.
            "hot_list",
        ]);
        expect(navEntries.map((e) => e.work_view_id)).toEqual([
            "fresh_prospects",
            "momentum",
            "new_work_view_2",
        ]);
        // Canonical location: every view counts/renders on the dept pipeline host; the
        // lane-bound view uses its lane, predicate-only views use the all-records lane.
        expect(navEntries.every((e) => e.host_work_unit_id === "wu-pipeline")).toBe(true);
        expect(navEntries.map((e) => e.base_queue_key)).toEqual([
            "new_leads",
            "pipeline_total",
            "pipeline_total",
        ]);
    });

    it("sidebar active-state matches on route_key: the slug in href, not the fossil id", () => {
        for (const entry of navEntries) {
            const hrefSlug = entry.href.split("/").pop()!;
            // The sidebar highlights via workUnitRouteSlugsEquivalent(urlSlug, route_key) —
            // this must hold for every entry (tile, left nav, and URL share one slug).
            expect(workUnitRouteSlugsEquivalent(hrefSlug, entry.route_key ?? "")).toBe(true);
        }
        // The renamed view is exactly why platformKey (view id) must NOT drive the match.
        const renamed = navEntries.find((e) => e.label === "Hot List")!;
        expect(workUnitRouteSlugsEquivalent("hot-list", renamed.platformKey)).toBe(false);
        expect(workUnitRouteSlugsEquivalent("hot-list", renamed.route_key ?? "")).toBe(true);
    });

    it("workspace tile WorkViewLinkModels carry the renamed labels", () => {
        const links = navEntries.map((entry) => workViewLinkFromWorkQueuePreview(entry));
        expect(links.map((l) => l.label)).toEqual(["Fresh Prospects", "Momentum", "Hot List"]);
        for (const link of links) {
            expectNoInternalLeak(link.label);
            if (link.href) expectNoInternalLeak(link.href);
        }
    });

    it("work-unit pill models carry the renamed labels from the same config", () => {
        const views = savedWorkViewsFromDepartmentMetadata(DEPT_METADATA);
        const pills = workViewLinkModelsFromConfiguredViews(views, { activeWorkViewId: "momentum" });
        expect(pills.map((p) => p.label)).toEqual(["Fresh Prospects", "Momentum", "Hot List"]);
        expect(pills.find((p) => p.id === "momentum")?.isActive).toBe(true);
        for (const pill of pills) expectNoInternalLeak(pill.label);
    });

    it("renamed view slugs resolve to the host work unit with the view selected (no code change)", () => {
        for (const [slug, viewId] of [
            ["fresh-prospects", "fresh_prospects"],
            ["momentum", "momentum"],
            // Label slug resolves the renamed view; the fossil id slug still resolves (old links).
            ["hot-list", "new_work_view_2"],
            ["new-work-view-2", "new_work_view_2"],
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
