import { describe, expect, it } from "vitest";
import {
    findWorkViewByCompatQueueKey,
    findWorkViewById,
    firstVisibleWorkView,
    resolveActiveWorkViewRuntimeContext,
    workViewRuntimeUrlParamsFromQueueKey,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

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
