/**
 * Queue Row — stacked condensed-row model tests.
 */
import { describe, expect, it } from "vitest";
import {
    MAX_STACKED_ROWS,
    canAddRow,
    clampRowIndex,
    moveItemToRow,
    normalizeRowIndices,
    occupiedRowCount,
    reorderWithinRow,
    stackedRows,
    type StackedItem,
} from "@/lib/adminV2/settings/surfaces/queueRowStackedModel";

function items(...spec: Array<[string, number, boolean]>): StackedItem[] {
    return spec.map(([key, rowIndex, inRow]) => ({ key, rowIndex, inRow }));
}

describe("clampRowIndex", () => {
    it("clamps into [0, MAX-1] and floors", () => {
        expect(clampRowIndex(-3)).toBe(0);
        expect(clampRowIndex(0)).toBe(0);
        expect(clampRowIndex(2.7)).toBe(2);
        expect(clampRowIndex(99)).toBe(MAX_STACKED_ROWS - 1);
        expect(clampRowIndex(NaN)).toBe(0);
    });
});

describe("stackedRows — grouping + order", () => {
    it("groups placed items into ascending rows, preserving horizontal order", () => {
        const rows = stackedRows(items(
            ["household", 0, true],
            ["status", 0, true],
            ["children", 1, true],
            ["attention", 1, true],
            ["actions", 2, true],
        ));
        expect(rows.map((r) => r.rowIndex)).toEqual([0, 1, 2]);
        expect(rows[0]!.items.map((i) => i.key)).toEqual(["household", "status"]);
        expect(rows[1]!.items.map((i) => i.key)).toEqual(["children", "attention"]);
        expect(rows[2]!.items.map((i) => i.key)).toEqual(["actions"]);
    });

    it("ignores items not in the row (library)", () => {
        const rows = stackedRows(items(["a", 0, true], ["b", 0, false]));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.items.map((i) => i.key)).toEqual(["a"]);
    });

    it("legacy flat layout (all rowIndex 0) yields a single row", () => {
        const rows = stackedRows(items(["a", 0, true], ["b", 0, true], ["c", 0, true]));
        expect(rows).toHaveLength(1);
        expect(occupiedRowCount(items(["a", 0, true], ["b", 0, true]))).toBe(1);
    });
});

describe("moveItemToRow", () => {
    it("moves an item to a new row and marks it in-row, immutably", () => {
        const before = items(["household", 0, true], ["children", 0, true]);
        const after = moveItemToRow(before, "children", 1);
        expect(after.find((i) => i.key === "children")!.rowIndex).toBe(1);
        expect(after.find((i) => i.key === "children")!.inRow).toBe(true);
        // original untouched
        expect(before.find((i) => i.key === "children")!.rowIndex).toBe(0);
    });

    it("clamps an out-of-range target", () => {
        const after = moveItemToRow(items(["a", 0, true]), "a", 99);
        expect(after[0]!.rowIndex).toBe(MAX_STACKED_ROWS - 1);
    });

    it("placing a library item into a row marks it in-row", () => {
        const after = moveItemToRow(items(["a", 0, false]), "a", 1);
        expect(after[0]!.inRow).toBe(true);
        expect(after[0]!.rowIndex).toBe(1);
    });
});

describe("reorderWithinRow", () => {
    it("moves an item before another within the same row", () => {
        const before = items(["a", 0, true], ["b", 0, true], ["c", 0, true]);
        const after = reorderWithinRow(before, "c", "b");
        expect(after.map((i) => i.key)).toEqual(["a", "c", "b"]);
    });

    it("moves an item to the end of its row when beforeKey is null", () => {
        const before = items(["a", 0, true], ["b", 0, true], ["c", 0, true]);
        const after = reorderWithinRow(before, "a", null);
        expect(after.map((i) => i.key)).toEqual(["b", "c", "a"]);
    });
});

describe("normalizeRowIndices — collapse gaps", () => {
    it("remaps rows 0 and 2 to contiguous 0 and 1", () => {
        const before = items(["a", 0, true], ["b", 2, true]);
        const after = normalizeRowIndices(before);
        expect(after.find((i) => i.key === "a")!.rowIndex).toBe(0);
        expect(after.find((i) => i.key === "b")!.rowIndex).toBe(1);
    });

    it("is a no-op when rows are already contiguous", () => {
        const before = items(["a", 0, true], ["b", 1, true]);
        const after = normalizeRowIndices(before);
        expect(after.map((i) => i.rowIndex)).toEqual([0, 1]);
    });
});

describe("canAddRow", () => {
    it("allows adding rows up to the max, then stops", () => {
        expect(canAddRow(items(["a", 0, true]))).toBe(true);
        expect(canAddRow(items(["a", 0, true], ["b", 1, true]))).toBe(true);
        expect(canAddRow(items(["a", 0, true], ["b", 1, true], ["c", 2, true]))).toBe(false);
    });
});
