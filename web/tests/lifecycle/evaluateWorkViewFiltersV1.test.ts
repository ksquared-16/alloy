import { describe, expect, it } from "vitest";
import {
    evaluateWorkViewFiltersForRow,
    filterQueueRowsByWorkViewFilters,
} from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import type { WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";

describe("evaluateWorkViewFiltersV1", () => {
    const row = {
        id: "opp-1",
        status_key: "new_inquiry",
        _status_display: "New inquiry",
        _location_label: "Main Campus",
    };

    it("passes all rows when filters are empty", () => {
        expect(evaluateWorkViewFiltersForRow(row, []).pass).toBe(true);
        expect(filterQueueRowsByWorkViewFilters([row], undefined)).toEqual([row]);
    });

    it("empty filter Work View evaluates as include-all (All Leads semantics)", () => {
        const rows = [
            { id: "a", status_key: "new_inquiry" },
            { id: "b", status_key: "waitlist" },
            { id: "c", status_key: "enrolled" },
        ];
        // Empty filters — under both AND and OR — must include every base row, not exclude them.
        expect(filterQueueRowsByWorkViewFilters(rows, [])).toHaveLength(3);
        expect(filterQueueRowsByWorkViewFilters(rows, [], "all")).toHaveLength(3);
        expect(filterQueueRowsByWorkViewFilters(rows, [], "any")).toHaveLength(3);
    });

    it("filters by status equals", () => {
        const filters: WorkViewFilterV1[] = [
            { field_key: "status", operator: "equals", value: "new_inquiry" },
        ];
        expect(evaluateWorkViewFiltersForRow(row, filters).pass).toBe(true);
        expect(
            evaluateWorkViewFiltersForRow({ ...row, status_key: "enrolled" }, filters).pass,
        ).toBe(false);
    });

    it("filters by is_any_of", () => {
        const filters: WorkViewFilterV1[] = [
            { field_key: "status", operator: "is_any_of", value: ["new_inquiry", "tour_scheduled"] },
        ];
        expect(filterQueueRowsByWorkViewFilters([row, { ...row, status_key: "lost" }], filters)).toHaveLength(1);
    });

    it("evaluates is_empty and is_not_empty", () => {
        expect(
            evaluateWorkViewFiltersForRow(row, [{ field_key: "location", operator: "is_not_empty", value: null }])
                .pass,
        ).toBe(true);
        expect(
            evaluateWorkViewFiltersForRow(
                { id: "x" },
                [{ field_key: "location", operator: "is_empty", value: null }],
            ).pass,
        ).toBe(true);
    });

    it("fail-safe passes unsupported fields without crashing", () => {
        const filters: WorkViewFilterV1[] = [
            { field_key: "assigned_staff", operator: "equals", value: "user-1" },
        ];
        const result = evaluateWorkViewFiltersForRow(row, filters);
        expect(result.pass).toBe(true);
        expect(result.notes[0]?.supported).toBe(false);
        expect(result.notes[0]?.reason).toBe("unsupported_field");
    });

    it("fail-safe passes unsupported operators without crashing", () => {
        const filters: WorkViewFilterV1[] = [
            { field_key: "status", operator: "date_between", value: ["2026-01-01", "2026-01-31"] },
        ];
        const result = evaluateWorkViewFiltersForRow(row, filters);
        expect(result.pass).toBe(true);
        expect(result.notes[0]?.reason).toBe("unsupported_operator");
    });
});

describe("evaluateWorkViewFiltersV1 — typed V2 condition keys", () => {
    it("opportunity_stage resolves the lifecycle stage key", () => {
        const stageRow = { id: "o1", lifecycle_stage_key: "tour_scheduled", status_key: "open" };
        expect(
            evaluateWorkViewFiltersForRow(stageRow, [
                { field_key: "opportunity_stage", operator: "equals", value: "tour_scheduled" },
            ]).pass,
        ).toBe(true);
        // The V1 bug: "stage equals open" matched the status set. It must NOT match now.
        expect(
            evaluateWorkViewFiltersForRow(stageRow, [
                { field_key: "opportunity_stage", operator: "equals", value: "open" },
            ]).pass,
        ).toBe(false);
    });

    it("opportunity_status resolves the opportunity status key", () => {
        const r = { id: "o1", status_key: "open", lifecycle_stage_key: "tour_scheduled" };
        expect(
            evaluateWorkViewFiltersForRow(r, [
                { field_key: "opportunity_status", operator: "equals", value: "open" },
            ]).pass,
        ).toBe(true);
    });

    it("child_enrollment_status resolves child/candidate disposition keys", () => {
        const r = { id: "c1", candidate_status_key: "waitlisted" };
        expect(
            evaluateWorkViewFiltersForRow(r, [
                { field_key: "child_enrollment_status", operator: "is_any_of", value: ["waitlisted", "enrolled"] },
            ]).pass,
        ).toBe(true);
    });

    it("site and program resolve enrichment/row facts", () => {
        const r = { id: "o1", _location_label: "Main Campus", _requested_program: "Infants" };
        expect(
            evaluateWorkViewFiltersForRow(r, [
                { field_key: "site", operator: "equals", value: "Main Campus" },
            ]).pass,
        ).toBe(true);
        expect(
            evaluateWorkViewFiltersForRow(r, [
                { field_key: "program", operator: "equals", value: "Infants" },
            ]).pass,
        ).toBe(true);
    });

    it("needs_attention resolves the attention flag to a boolean", () => {
        const attn = { id: "o1", _attention_reason: "Missing paperwork" };
        const calm = { id: "o2" };
        expect(
            evaluateWorkViewFiltersForRow(attn, [
                { field_key: "needs_attention", operator: "equals", value: "true" },
            ]).pass,
        ).toBe(true);
        expect(
            evaluateWorkViewFiltersForRow(calm, [
                { field_key: "needs_attention", operator: "equals", value: "true" },
            ]).pass,
        ).toBe(false);
    });

    it("legacy stage/status keys evaluate identically to canonical typed keys", () => {
        const r = { id: "o1", status_key: "open", lifecycle_stage_key: "tour_scheduled" };
        const legacy = evaluateWorkViewFiltersForRow(r, [
            { field_key: "stage", operator: "equals", value: "tour_scheduled" },
        ]);
        const typed = evaluateWorkViewFiltersForRow(r, [
            { field_key: "opportunity_stage", operator: "equals", value: "tour_scheduled" },
        ]);
        expect(legacy.pass).toBe(true);
        expect(typed.pass).toBe(true);
        // The note's field_key is canonicalized even for the legacy input.
        expect(legacy.notes[0]?.field_key).toBe("opportunity_stage");
    });
});

describe("evaluateWorkViewFiltersV1 — V3 predicate model (AND/OR + new fields)", () => {
    const south = { id: "o1", status_key: "open", site_id: "South Campus", room_id: "Toddler 1" };

    it("AND (match=all) requires every condition — default behavior", () => {
        const filters: WorkViewFilterV1[] = [
            { field_key: "site", operator: "equals", value: "South Campus" },
            { field_key: "room", operator: "equals", value: "Toddler 1" },
        ];
        // Both match → pass (default match=all).
        expect(evaluateWorkViewFiltersForRow(south, filters).pass).toBe(true);
        expect(evaluateWorkViewFiltersForRow(south, filters, "all").pass).toBe(true);
        // One fails → AND fails.
        expect(
            evaluateWorkViewFiltersForRow({ ...south, room_id: "Infant 2" }, filters, "all").pass,
        ).toBe(false);
    });

    it("OR (match=any) passes when any condition matches — status is X OR status is Y", () => {
        const filters: WorkViewFilterV1[] = [
            { field_key: "opportunity_status", operator: "equals", value: "waitlist" },
            { field_key: "opportunity_status", operator: "equals", value: "open" },
        ];
        // Second condition matches → OR passes.
        expect(evaluateWorkViewFiltersForRow(south, filters, "any").pass).toBe(true);
        // Neither matches → OR fails.
        expect(
            evaluateWorkViewFiltersForRow({ ...south, status_key: "lost" }, filters, "any").pass,
        ).toBe(false);
        // Same conditions under AND would fail (a status cannot equal both).
        expect(evaluateWorkViewFiltersForRow(south, filters, "all").pass).toBe(false);
    });

    it("filterQueueRowsByWorkViewFilters threads the match combinator", () => {
        const rows = [
            { id: "a", status_key: "open" },
            { id: "b", status_key: "waitlist" },
            { id: "c", status_key: "lost" },
        ];
        const filters: WorkViewFilterV1[] = [
            { field_key: "opportunity_status", operator: "equals", value: "open" },
            { field_key: "opportunity_status", operator: "equals", value: "waitlist" },
        ];
        expect(filterQueueRowsByWorkViewFilters(rows, filters, "any").map((r) => r.id)).toEqual(["a", "b"]);
        // AND yields nothing (no row is both open and waitlist).
        expect(filterQueueRowsByWorkViewFilters(rows, filters, "all")).toHaveLength(0);
    });

    it("resolves the new room / start_date / current_work fields", () => {
        expect(
            evaluateWorkViewFiltersForRow(south, [
                { field_key: "room", operator: "equals", value: "Toddler 1" },
            ]).pass,
        ).toBe(true);

        const startRow = { id: "o2", start_date: "2026-09-01" };
        expect(
            evaluateWorkViewFiltersForRow(startRow, [
                { field_key: "start_date", operator: "date_is", value: "2026-09-01" },
            ]).pass,
        ).toBe(true);

        const working = { id: "o3", has_open_work: true };
        const idle = { id: "o4", open_work_count: 0 };
        expect(
            evaluateWorkViewFiltersForRow(working, [
                { field_key: "current_work", operator: "equals", value: "true" },
            ]).pass,
        ).toBe(true);
        expect(
            evaluateWorkViewFiltersForRow(idle, [
                { field_key: "current_work", operator: "equals", value: "true" },
            ]).pass,
        ).toBe(false);
    });

    it("applies mixed predicates under AND — school AND room", () => {
        // "school is South Campus AND room is Toddler 1"
        const filters: WorkViewFilterV1[] = [
            { field_key: "site", operator: "equals", value: "South Campus" },
            { field_key: "room", operator: "equals", value: "Toddler 1" },
        ];
        expect(evaluateWorkViewFiltersForRow(south, filters, "all").pass).toBe(true);
        expect(
            evaluateWorkViewFiltersForRow({ ...south, site_id: "North Campus" }, filters, "all").pass,
        ).toBe(false);
    });

    it("OR fails open only when no condition is evaluable (all unsupported)", () => {
        const filters: WorkViewFilterV1[] = [
            { field_key: "assigned_staff", operator: "equals", value: "user-1" },
        ];
        // Unsupported-only → fail-safe pass (mirrors AND fail-open).
        expect(evaluateWorkViewFiltersForRow(south, filters, "any").pass).toBe(true);
    });
});
