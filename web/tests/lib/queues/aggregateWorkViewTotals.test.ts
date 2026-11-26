/**
 * Grouped Work View totals — PARITY with the legacy per-view path + zero-query batching (Trust
 * Closure §3). The grouped path and the single queue route both filter the SAME base rows with the
 * SAME evaluator, so counts are identical by construction; this pins that on representative fixtures
 * (one view, many views over one lane, explicit zero, unknown, overlapping filters, include-all).
 */

import { describe, it, expect } from "vitest";
import { aggregateWorkViewTotals } from "@/lib/queues/aggregateWorkViewTotals";
import { applyWorkViewFilterToQueueItemsResult } from "@/lib/lifecycle/operationalProjection";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import type { OperationalProjectionRow } from "@/lib/lifecycle/operationalProjection";

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
];

const ROWS: OperationalProjectionRow[] = [
    { id: "a", opportunity_status: "new_inquiry", status_key: "new_inquiry" },
    { id: "b", opportunity_status: "tour_scheduled", status_key: "tour_scheduled" },
    { id: "c", opportunity_status: "waitlist", status_key: "waitlist" },
    { id: "d", opportunity_status: "waitlist", status_key: "waitlist" },
    { id: "e", opportunity_status: "enrolled", status_key: "enrolled" },
];

/** The legacy single-route count for one view: filter the base page, read the true filtered total. */
function legacyCount(view: WorkViewConfigV1Stored): number {
    return (
        applyWorkViewFilterToQueueItemsResult<{ items: unknown[]; total?: number }>({
            result: { items: [...ROWS], total: 0 },
            filters: view.filters_v1 ?? [],
            match: view.match ?? "all",
            omitTotalCount: false,
        }).total ?? 0
    );
}

describe("aggregateWorkViewTotals — parity with the per-view path", () => {
    it("matches the legacy per-view count for EVERY view, from one base page", () => {
        const totals = aggregateWorkViewTotals({
            baseRows: ROWS,
            workViews: VIEWS,
            exactLaneTotal: ROWS.length,
            baseTruncated: false,
        });
        for (const view of VIEWS) {
            // Include-all uses the exact lane total; filtered views use the same evaluator → parity.
            const expected = view.filters_v1?.length ? legacyCount(view) : ROWS.length;
            expect(totals[view.id]?.count, `${view.id} parity`).toBe(expected);
        }
        // Concrete values as a guard: new=1, active(any tour|waitlist)=3, waitlist=2, all=5.
        expect(totals.new_leads.count).toBe(1);
        expect(totals.active_pipeline.count).toBe(3);
        expect(totals.waitlist.count).toBe(2);
        expect(totals.all_leads.count).toBe(5);
    });

    it("explicit zero: a view matching no rows returns count 0 (known), not unknown", () => {
        const totals = aggregateWorkViewTotals({
            baseRows: ROWS,
            workViews: [
                {
                    id: "none",
                    label: "None",
                    display_order: 1,
                    visible_in_runtime: true,
                    filters_v1: [{ field_key: "opportunity_status", operator: "equals", value: "does_not_exist" }],
                },
            ],
            exactLaneTotal: ROWS.length,
            baseTruncated: false,
        });
        expect(totals.none).toEqual({ count: 0, known: true });
    });

    it("truncation: a capped base page marks filtered counts unknown (never a wrong number)", () => {
        const totals = aggregateWorkViewTotals({
            baseRows: ROWS,
            workViews: VIEWS,
            exactLaneTotal: 999, // exact lane count exceeds the fetched page
            baseTruncated: true,
        });
        // Include-all still exact (from the lane count); filtered views are flagged unknown.
        expect(totals.all_leads).toEqual({ count: 999, known: true });
        expect(totals.new_leads.known).toBe(false);
        expect(totals.waitlist.known).toBe(false);
    });

    it("include-all view uses the EXACT lane total, not the (possibly capped) page length", () => {
        const totals = aggregateWorkViewTotals({
            baseRows: ROWS.slice(0, 2),
            workViews: [VIEWS[0]],
            exactLaneTotal: 42,
            baseTruncated: true,
        });
        expect(totals.all_leads).toEqual({ count: 42, known: true });
    });
});
