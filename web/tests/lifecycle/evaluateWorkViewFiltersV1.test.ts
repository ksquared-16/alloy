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
