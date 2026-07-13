import { describe, expect, it } from "vitest";

import {
    chunkNestedSurfaceFieldsForHalfRowLayout,
    nestedSurfaceRowHasCapacity,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { resolveIdentityFieldRows } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows";

describe("identity third-width field layout", () => {
    it("places three third-width fields on one row", () => {
        const keys = ["a", "b", "c"];
        const layout = (key: string) => "third" as const;
        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([["a", "b", "c"]]);
    });

    it("places two half-width fields on one row", () => {
        const keys = ["a", "b"];
        const layout = () => "half" as const;
        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([["a", "b"]]);
    });

    it("normalizes invalid row overflow into a new row", () => {
        expect(nestedSurfaceRowHasCapacity(2, "half")).toBe(false);
        const keys = ["a", "b", "c"];
        const widths: Record<string, "half" | "full"> = { a: "half", b: "half", c: "half" };
        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, (k) => widths[k] ?? "full")).toEqual([
            ["a", "b"],
            ["c"],
        ]);
    });

    it("builds one row VM with three cells", () => {
        const rows = resolveIdentityFieldRows([
            {
                placement: { fieldRef: "a", tier: "summary", row: 1, column: 1, width: "third" },
                label: "A",
                value: "1",
                policy: "read-only",
                editable: false,
            },
            {
                placement: { fieldRef: "b", tier: "summary", row: 1, column: 2, width: "third" },
                label: "B",
                value: "2",
                policy: "read-only",
                editable: false,
            },
            {
                placement: { fieldRef: "c", tier: "summary", row: 1, column: 3, width: "third" },
                label: "C",
                value: "3",
                policy: "read-only",
                editable: false,
            },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.cells).toHaveLength(3);
    });
});
