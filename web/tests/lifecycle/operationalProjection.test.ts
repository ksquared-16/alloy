import { describe, expect, it } from "vitest";
import {
    computeOperationalProjection,
    recordMatchesWorkView,
    resolveFocusPanelScope,
} from "@/lib/lifecycle/operationalProjection";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

// The configured Enrollment Work Views (predicate-only; All Leads = empty filters = include-all).
const VIEWS: WorkViewConfigV1Stored[] = [
    { id: "all_leads", label: "All Leads", display_order: 1, visible_in_runtime: true, filters_v1: [] },
    {
        id: "new_leads",
        label: "New Leads",
        display_order: 2,
        visible_in_runtime: true,
        filters_v1: [{ field_key: "opportunity_status", operator: "equals", value: "new_inquiry" }],
    },
    {
        id: "active_pipeline",
        label: "Active Pipeline",
        display_order: 3,
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
        display_order: 4,
        visible_in_runtime: true,
        filters_v1: [{ field_key: "opportunity_status", operator: "equals", value: "waitlist" }],
    },
    { id: "hidden", label: "Hidden", display_order: 5, visible_in_runtime: false, filters_v1: [] },
];

describe("computeOperationalProjection — one source for counts and rows", () => {
    it("one created lead appears in All Leads count AND rows; total === All Leads count", () => {
        const baseRows = [{ id: "lyons-family", status_key: "new_inquiry" }];
        const p = computeOperationalProjection({ baseRows, workViews: VIEWS });

        expect(p.total).toBe(1);
        const allLeads = p.byViewId.all_leads!;
        expect(allLeads.count).toBe(1);
        expect(allLeads.rows).toHaveLength(1);
        expect(allLeads.count).toBe(allLeads.rows.length); // count === rows
        expect(allLeads.count).toBe(p.total); // process total === All Leads (empty filter)
    });

    it("every view's count equals its row count (count and rows share one resolver)", () => {
        const baseRows = [
            { id: "a", status_key: "new_inquiry" },
            { id: "b", status_key: "tour_scheduled" },
            { id: "c", status_key: "waitlist" },
            { id: "d", status_key: "waitlist" },
            { id: "e", status_key: "enrolled" },
        ];
        const p = computeOperationalProjection({ baseRows, workViews: VIEWS });

        for (const v of p.views) {
            expect(v.count, `${v.id} count===rows`).toBe(v.rows.length);
        }
        // Concrete per-view expectations.
        expect(p.byViewId.all_leads!.count).toBe(5); // empty filter = include-all
        expect(p.byViewId.new_leads!.count).toBe(1); // new_inquiry
        expect(p.byViewId.active_pipeline!.count).toBe(3); // tour OR waitlist (1 + 2)
        expect(p.byViewId.waitlist!.count).toBe(2);
    });

    it("count-only projection still uses the predicate filter (NOT a stale lane summary)", () => {
        const baseRows = [
            { id: "a", status_key: "new_inquiry" },
            { id: "b", status_key: "waitlist" },
        ];
        const countOnly = computeOperationalProjection({ baseRows, workViews: VIEWS, includeRows: false });
        // Rows omitted, but counts are the predicate-filtered counts.
        expect(countOnly.byViewId.new_leads!.rows).toHaveLength(0);
        expect(countOnly.byViewId.new_leads!.count).toBe(1);
        expect(countOnly.byViewId.waitlist!.count).toBe(1);
        expect(countOnly.byViewId.all_leads!.count).toBe(2);
    });

    it("empty-filter Work View includes all base records", () => {
        const baseRows = [{ id: "a" }, { id: "b" }, { id: "c" }];
        const p = computeOperationalProjection({ baseRows, workViews: VIEWS });
        expect(p.byViewId.all_leads!.count).toBe(3);
    });

    it("preserves visibility flag (hidden views still projected, flagged not visible)", () => {
        const p = computeOperationalProjection({ baseRows: [{ id: "a" }], workViews: VIEWS });
        expect(p.byViewId.hidden!.visibleInRuntime).toBe(false);
        expect(p.byViewId.all_leads!.visibleInRuntime).toBe(true);
    });
});

describe("Focus Panel membership against the active Work View", () => {
    it("recordMatchesWorkView uses the same evaluator as counts/rows", () => {
        const newLead = { id: "x", status_key: "new_inquiry" };
        expect(recordMatchesWorkView(newLead, VIEWS[1])).toBe(true); // New Leads
        expect(recordMatchesWorkView(newLead, VIEWS[3])).toBe(false); // Waitlist
        expect(recordMatchesWorkView(newLead, VIEWS[0])).toBe(true); // All Leads (empty filter)
        expect(recordMatchesWorkView(newLead, null)).toBe(true); // no constraint
    });

    it("resolveFocusPanelScope classifies in/out of the active view", () => {
        const newLead = { id: "x", status_key: "new_inquiry" };
        expect(resolveFocusPanelScope({ record: newLead, activeView: VIEWS[1] })).toEqual({ kind: "in_scope" });
        expect(resolveFocusPanelScope({ record: newLead, activeView: VIEWS[3] })).toEqual({
            kind: "out_of_scope",
            activeViewId: "waitlist",
            activeViewLabel: "Waitlist",
        });
        expect(resolveFocusPanelScope({ record: newLead, activeView: null })).toEqual({ kind: "no_active_view" });
        // Record not yet loaded → don't assert out-of-scope.
        expect(resolveFocusPanelScope({ record: null, activeView: VIEWS[3] })).toEqual({ kind: "in_scope" });
    });
});
