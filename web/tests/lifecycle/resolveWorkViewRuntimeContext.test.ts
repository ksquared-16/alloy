import { describe, expect, it } from "vitest";
import {
    findWorkViewByCompatQueueKey,
    findWorkViewById,
    firstVisibleWorkView,
    resolveActiveWorkViewRuntimeContext,
    resolveWorkViewBaseQueueKey,
    workViewRuntimeUrlParamsFromQueueKey,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

const VIEWS: WorkViewConfigV1Stored[] = [
    {
        id: "new_families_today",
        label: "New Families Today",
        compat_queue_key: "new_inquiry",
        display_order: 1,
        visible_in_runtime: true,
        queue_layout_id: "layout-queue-1",
        focus_panel_layout_id: "layout-focus-1",
        filters_v1: [{ field_key: "status", operator: "equals", value: "new_inquiry" }],
    },
    {
        id: "tours_today",
        label: "Tours Today",
        compat_queue_key: "tours",
        display_order: 2,
        visible_in_runtime: true,
        queue_layout_id: "layout-queue-2",
        focus_panel_layout_id: "layout-focus-2",
    },
];

const deptMetadata = {
    lifecycle_builder_v1: {
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
                stages: [],
                work_views_v1: VIEWS,
            },
        ],
    },
};

describe("resolveActiveWorkViewRuntimeContext", () => {
    it("prefers work_view id over queue key for identity", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: deptMetadata,
            workViewId: "tours_today",
            queueKey: "new_inquiry",
        });
        expect(ctx.workViewId).toBe("tours_today");
        expect(ctx.queueKey).toBe("tours");
        expect(ctx.queueLayoutId).toBe("layout-queue-2");
        expect(ctx.focusPanelLayoutId).toBe("layout-focus-2");
    });

    it("resolves work view from compat queue key when id absent", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: deptMetadata,
            queueKey: "new_inquiry",
        });
        expect(ctx.workViewId).toBe("new_families_today");
        expect(ctx.queueLayoutId).toBe("layout-queue-1");
    });

    it("URL layout ids override stored work view layout ids", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: deptMetadata,
            workViewId: "new_families_today",
            queueLayoutId: "url-queue-layout",
            focusLayoutId: "url-focus-layout",
        });
        expect(ctx.queueLayoutId).toBe("url-queue-layout");
        expect(ctx.focusPanelLayoutId).toBe("url-focus-layout");
    });

    it("falls back to first visible work view when no match", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: deptMetadata,
            queueKey: "unknown_lane",
        });
        expect(ctx.workViewId).toBe("new_families_today");
    });

    it("returns empty context when no work views configured", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: {},
            workViewId: "missing",
            queueKey: "new_inquiry",
        });
        expect(ctx.workView).toBeNull();
        expect(ctx.queueKey).toBe("new_inquiry");
    });
});

describe("work view lookup helpers", () => {
    it("findWorkViewById and findWorkViewByCompatQueueKey", () => {
        expect(findWorkViewById(VIEWS, "tours_today")?.label).toBe("Tours Today");
        expect(findWorkViewByCompatQueueKey(VIEWS, "tours")?.id).toBe("tours_today");
        expect(firstVisibleWorkView(VIEWS)?.id).toBe("new_families_today");
    });
});

describe("workViewRuntimeUrlParamsFromQueueKey", () => {
    it("derives lane URL sync params from queue pill", () => {
        expect(workViewRuntimeUrlParamsFromQueueKey(deptMetadata, "tours")).toEqual({
            workViewId: "tours_today",
            queueLayoutId: "layout-queue-2",
            focusLayoutId: "layout-focus-2",
        });
    });
});

// Work View runtime materialization — each Work View (selected via ?work_view=<id>) must resolve and
// evaluate ITS OWN predicates, even without a bound compat_queue_key, so counts differ per view.
describe("per-Work-View predicate resolution + count (materialization)", () => {
    const PREDICATE_VIEWS: WorkViewConfigV1Stored[] = [
        {
            id: "active_pipeline",
            label: "Active Pipeline",
            display_order: 1,
            visible_in_runtime: true,
            match: "any",
            filters_v1: [
                { field_key: "opportunity_status", operator: "equals", value: "tour_scheduled" },
                { field_key: "opportunity_status", operator: "equals", value: "waitlist" },
            ],
        },
        {
            id: "waitlist",
            label: "Waitlist",
            display_order: 2,
            visible_in_runtime: true,
            filters_v1: [{ field_key: "opportunity_status", operator: "equals", value: "waitlist" }],
        },
    ];
    const predicateDeptMetadata = {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    stages: [],
                    work_views_v1: PREDICATE_VIEWS,
                },
            ],
        },
    };

    it("resolves each Work View by id → its own filters + match (no compat_queue_key needed)", () => {
        const active = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: predicateDeptMetadata,
            workViewId: "active_pipeline",
        });
        expect(active.workViewId).toBe("active_pipeline");
        expect(active.match).toBe("any");
        expect(active.filters).toHaveLength(2);

        const waitlist = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: predicateDeptMetadata,
            workViewId: "waitlist",
        });
        expect(waitlist.workViewId).toBe("waitlist");
        expect(waitlist.match).toBe("all");
        expect(waitlist.filters).toHaveLength(1);
    });

    it("counts differ when predicates differ — each view filters the same rows by its own predicate", async () => {
        const { filterQueueRowsByWorkViewFilters } = await import(
            "@/lib/lifecycle/evaluateWorkViewFiltersV1"
        );
        const rows = [
            { id: "o1", status_key: "tour_scheduled" },
            { id: "o2", status_key: "waitlist" },
            { id: "o3", status_key: "waitlist" },
            { id: "o4", status_key: "lost" },
        ];
        const active = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: predicateDeptMetadata,
            workViewId: "active_pipeline",
        });
        const waitlist = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: predicateDeptMetadata,
            workViewId: "waitlist",
        });
        // Active Pipeline (tour OR waitlist) → 3 rows; Waitlist → 2 rows. Counts differ.
        expect(filterQueueRowsByWorkViewFilters(rows, active.filters, active.match)).toHaveLength(3);
        expect(filterQueueRowsByWorkViewFilters(rows, waitlist.filters, waitlist.match)).toHaveLength(2);
    });
});

// Count/membership consistency — a predicate-only Work View (no compat_queue_key) must resolve the work
// unit's all-records base queue, not null (which made every such view fetch 0 rows / 0 count).
describe("resolveWorkViewBaseQueueKey (all-records base for predicate-only views)", () => {
    it("uses the bound lane when compat_queue_key is set", () => {
        expect(
            resolveWorkViewBaseQueueKey({ compat_queue_key: "new_leads" }, null, RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2),
        ).toBe("new_leads");
    });

    it("uses an explicit URL queue when present and no compat", () => {
        expect(
            resolveWorkViewBaseQueueKey({ compat_queue_key: undefined }, "waitlist", RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2),
        ).toBe("waitlist");
    });

    it("falls back to the all-records queue (pipeline_total) for a predicate-only view", () => {
        expect(
            resolveWorkViewBaseQueueKey({ compat_queue_key: undefined }, null, RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2),
        ).toBe("pipeline_total");
    });

    it("returns null only when there is no lane and no queue definition", () => {
        expect(resolveWorkViewBaseQueueKey({ compat_queue_key: undefined }, null, null)).toBeNull();
    });
});

describe("resolveActiveWorkViewRuntimeContext resolves an all-records base for predicate-only views", () => {
    const allLeadsMetadata = {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    stages: [],
                    work_views_v1: [
                        // "All Leads" — predicate-only (no compat_queue_key), empty filters = include-all.
                        { id: "all_leads", label: "All Leads", display_order: 1, visible_in_runtime: true },
                    ],
                },
            ],
        },
    };

    it("predicate-only `all_leads` resolves queueKey = pipeline_total (not null) when given the queue def", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: allLeadsMetadata,
            workViewId: "all_leads",
            queueDefinition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
        });
        expect(ctx.workViewId).toBe("all_leads");
        expect(ctx.queueKey).toBe("pipeline_total");
        // Empty filters → include-all.
        expect(ctx.filters ?? []).toHaveLength(0);
    });

    it("without the queue def, a predicate-only view still resolves null (back-compat — caller must pass it)", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: allLeadsMetadata,
            workViewId: "all_leads",
        });
        expect(ctx.queueKey).toBeNull();
    });
});

// The count and the rows must come from the SAME predicate resolver over the SAME base rows.
describe("Work View count and rows share one predicate resolver", () => {
    it("one created lead appears in All Leads (empty filter = include-all); count equals rows", async () => {
        const { filterQueueRowsByWorkViewFilters } = await import(
            "@/lib/lifecycle/evaluateWorkViewFiltersV1"
        );
        // Base = all-records queue rows (e.g. pipeline_total) containing the one created lead.
        const baseRows = [{ id: "lyons-family", status_key: "new_inquiry" }];

        // All Leads — empty filters → include-all.
        const allLeadsRows = filterQueueRowsByWorkViewFilters(baseRows, [], "all");
        expect(allLeadsRows).toHaveLength(1);
        expect(allLeadsRows.length).toBe(baseRows.length); // count == rows, same resolver

        // New Leads — its own predicate over the SAME base; count == rows for that predicate.
        const newLeadsFilters = [{ field_key: "opportunity_status", operator: "equals" as const, value: "new_inquiry" }];
        const newLeadsRows = filterQueueRowsByWorkViewFilters(baseRows, newLeadsFilters, "all");
        expect(newLeadsRows).toHaveLength(1);

        // A non-matching predicate yields 0 — counts differ when predicates differ.
        const enrolledRows = filterQueueRowsByWorkViewFilters(
            baseRows,
            [{ field_key: "opportunity_status", operator: "equals" as const, value: "enrolled" }],
            "all",
        );
        expect(enrolledRows).toHaveLength(0);
    });
});

describe("focus panel route is independent of the active Work View", () => {
    it("parses the record id from /workspace/work-unit/:slug/:recordId even with ?work_view=", async () => {
        const { parseOperatorWorkUnitPath } = await import("@/lib/admin/canonicalOperatorRoutes");
        // Query string is not part of the pathname; record-id deep-link parsing is unaffected.
        expect(parseOperatorWorkUnitPath("/workspace/work-unit/enrollment-pipeline/opp-123")).toEqual({
            workUnitSlug: "enrollment-pipeline",
            recordId: "opp-123",
        });
        expect(parseOperatorWorkUnitPath("/workspace/work-unit/enrollment-pipeline")).toEqual({
            workUnitSlug: "enrollment-pipeline",
            recordId: null,
        });
    });
});
