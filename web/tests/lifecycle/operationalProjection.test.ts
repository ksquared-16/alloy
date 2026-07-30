import { describe, expect, it } from "vitest";
import {
    computeOperationalProjection,
    computeWorkViewOperationalSignals,
    diagnoseRecordWorkViewPlacement,
    enrichRowsWithDerivedStage,
    filterQueueRowsForWorkView,
    applyWorkViewFilterToQueueItemsResult,
    firstMatchingVisibleWorkView,
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

// Data-proven regression: the Lyons Family lead (status_key=new_inquiry, lifecycle_stage_key=null,
// needs_attention) showed under Registration, not New Leads. Reproduced with the ACTUAL configured
// Work Views (stage is derived from status; opportunities never store lifecycle_stage_key).
describe("New Leads vs Registration placement (stage derived from status)", () => {
    const ENROLLMENT_VIEWS: WorkViewConfigV1Stored[] = [
        // New Leads — Stage predicate (process-stage bucket "lead").
        {
            id: "new_leads",
            label: "New Leads",
            display_order: 1,
            match: "all",
            filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "lead" }],
        },
        // Registration — match=any incl. `needs_attention equals true` (catches an uncontacted new lead).
        {
            id: "registration",
            label: "Registration",
            display_order: 3,
            match: "any",
            filters_v1: [
                { field_key: "child_enrollment_status", operator: "equals", value: "registration_pending" },
                { field_key: "needs_attention", operator: "equals", value: "true" },
            ],
        },
        { id: "all_leads", label: "All Leads", display_order: 6, match: "all", filters_v1: [] },
    ];
    // status_definitions: new_inquiry → stage "lead".
    const STATUS_STAGE = { new_inquiry: "lead", tour_scheduled: "tour_scheduled" };
    const lyons = { id: "lyons", status_key: "new_inquiry", lifecycle_stage_key: null, _needs_attention: true };

    it("WITHOUT stage derivation: New Leads is false (null stage), Registration true (needs_attention)", () => {
        expect(recordMatchesWorkView(lyons, ENROLLMENT_VIEWS[0])).toBe(false); // New Leads — stage null
        expect(recordMatchesWorkView(lyons, ENROLLMENT_VIEWS[1])).toBe(true); // Registration — needs_attention OR
    });

    it("WITH stage derived from status: New Leads correctly includes the new lead", () => {
        const [enriched] = enrichRowsWithDerivedStage([lyons], STATUS_STAGE);
        expect(enriched.lifecycle_stage_key).toBe("lead");
        expect(recordMatchesWorkView(enriched, ENROLLMENT_VIEWS[0])).toBe(true); // New Leads now matches
    });

    it("filterQueueRowsForWorkView passes opportunity_stage=lead when row only has stage_key=lead", () => {
        const queueRow = { id: "opp-1", status_key: "open", stage_key: "lead" };
        const stageFilters = [{ field_key: "opportunity_stage" as const, operator: "equals" as const, value: "lead" }];
        const matched = filterQueueRowsForWorkView([queueRow], stageFilters, "all");
        expect(matched).toHaveLength(1);
        expect((matched[0] as { lifecycle_stage_key?: string }).lifecycle_stage_key).toBe("lead");
    });

    it("filterQueueRowsForWorkView excludes non-matching stage after enrichment", () => {
        const rows = [
            { id: "a", stage_key: "lead" },
            { id: "b", stage_key: "waitlist" },
        ];
        const stageFilters = [{ field_key: "opportunity_stage" as const, operator: "equals" as const, value: "lead" }];
        expect(filterQueueRowsForWorkView(rows, stageFilters, "all").map((r) => r.id)).toEqual(["a"]);
    });

    it("applyWorkViewFilterToQueueItemsResult returns true filtered total with paginated items", () => {
        const stageFilters = [{ field_key: "opportunity_stage" as const, operator: "equals" as const, value: "lead" }];
        const page = applyWorkViewFilterToQueueItemsResult({
            result: {
                queue: { key: "lifecycle_lead" },
                items: [
                    { id: "a", stage_key: "lead" },
                    { id: "b", stage_key: "lead" },
                    { id: "c", stage_key: "waitlist" },
                ],
                total: 3,
                limit: 500,
                offset: 0,
                total_omitted: true,
            },
            filters: stageFilters,
            pageLimit: 1,
            pageOffset: 0,
        });
        expect(page.total).toBe(2);
        expect(page.items.map((r) => r.id)).toEqual(["a"]);
        expect(page.total_omitted).toBeUndefined();
    });

    it("firstMatchingVisibleWorkView prefers predicate-scoped views over include-all", () => {
        const views: WorkViewConfigV1Stored[] = [
            { id: "all", label: "All", display_order: 1, visible_in_runtime: true, filters_v1: [] },
            {
                id: "scoped",
                label: "Scoped",
                display_order: 2,
                visible_in_runtime: true,
                filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "lead" }],
            },
        ];
        const match = firstMatchingVisibleWorkView({ id: "r1", stage_key: "lead" }, views);
        expect(match?.id).toBe("scoped");
    });

    it("projection with statusStageMap: New Leads = 1, All Leads = 1 (counts agree)", () => {
        const p = computeOperationalProjection({
            baseRows: [lyons],
            workViews: ENROLLMENT_VIEWS,
            statusStageMap: STATUS_STAGE,
        });
        expect(p.total).toBe(1);
        expect(p.byViewId.new_leads!.count).toBe(1);
        expect(p.byViewId.new_leads!.rows).toHaveLength(1); // count === rows
        expect(p.byViewId.all_leads!.count).toBe(1);
        // Registration still also matches via needs_attention (config OR-branch) — that's the config's intent.
        expect(p.byViewId.registration!.count).toBe(1);
    });

    it("diagnostic explains placement per Work View (record id, status, stage, pass/reason)", () => {
        const diag = diagnoseRecordWorkViewPlacement({
            record: lyons,
            workViews: ENROLLMENT_VIEWS,
            statusStageMap: STATUS_STAGE,
        });
        expect(diag.status_key).toBe("new_inquiry");
        expect(diag.stage_key).toBe("lead"); // derived
        const byId = Object.fromEntries(diag.views.map((v) => [v.id, v.pass]));
        expect(byId.new_leads).toBe(true);
        expect(byId.all_leads).toBe(true);
        expect(byId.registration).toBe(true); // needs_attention
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
        expect(resolveFocusPanelScope({ record: newLead, activeView: VIEWS[3], workViews: VIEWS })).toEqual({
            kind: "out_of_scope",
            activeViewId: "waitlist",
            activeViewLabel: "Waitlist",
            destinationViewId: "new_leads",
            destinationViewLabel: "New Leads",
        });
        expect(resolveFocusPanelScope({ record: newLead, activeView: null })).toEqual({ kind: "no_active_view" });
        // Record not yet loaded → don't assert out-of-scope.
        expect(resolveFocusPanelScope({ record: null, activeView: VIEWS[3] })).toEqual({ kind: "in_scope" });
    });
});

describe("computeWorkViewOperationalSignals — per-view attention/overdue from base rows", () => {
    // Base rows carry the generic `_queue_row_context` the queue attaches to every opportunity row.
    const row = (
        id: string,
        status: string,
        opts: { attention?: boolean; overdue?: boolean } = {},
    ) => ({
        id,
        status_key: status,
        _queue_row_context: {
            attention_summary: { needs_attention: opts.attention === true, primary_reason_label: null },
            current_work_summary: opts.overdue
                ? {
                      label: "Review",
                      state: "open",
                      due_label: "Overdue",
                      progress_hint: null,
                      blocker_hint: null,
                  }
                : {
                      label: "Review",
                      state: "open",
                      due_label: "Upcoming",
                      progress_hint: null,
                      blocker_hint: null,
                  },
        },
    });

    it("counts attention/overdue per view using the SAME predicates as the counts", () => {
        const baseRows = [
            row("a", "new_inquiry", { attention: true }),
            row("b", "new_inquiry", { overdue: true }),
            row("c", "waitlist", { attention: true, overdue: true }),
            row("d", "tour_scheduled"),
        ];
        const signals = computeWorkViewOperationalSignals({ baseRows, workViews: VIEWS });

        // All Leads (include-all): 2 attention (a, c), 2 overdue (b, c).
        expect(signals.all_leads).toMatchObject({ attentionCount: 2, overdueCount: 2 });
        // New Leads (status=new_inquiry): rows a, b → 1 attention, 1 overdue.
        expect(signals.new_leads).toMatchObject({ attentionCount: 1, overdueCount: 1 });
        // Waitlist (status=waitlist): row c → 1 attention, 1 overdue.
        expect(signals.waitlist).toMatchObject({ attentionCount: 1, overdueCount: 1 });
    });

    it("rows without `_queue_row_context` contribute no signal (never a fabricated one)", () => {
        const baseRows = [{ id: "x", status_key: "new_inquiry" }];
        const signals = computeWorkViewOperationalSignals({ baseRows, workViews: VIEWS });
        expect(signals.new_leads).toMatchObject({ attentionCount: 0, overdueCount: 0 });
    });
});
