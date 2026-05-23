import { describe, expect, it } from "vitest";

import { adjacentWorkUnitQueuePillKeys } from "@/lib/adminV2/workUnitQueuePillPrefetch";

describe("adjacentWorkUnitQueuePillKeys", () => {
    const summaries = [
        { key: "needs_attention" },
        { key: "pipeline" },
        { key: "stalled" },
        { key: "all_records" },
    ];

    it("prefers neighbors of the selected pill", () => {
        expect(adjacentWorkUnitQueuePillKeys(summaries, "pipeline", 3)).toEqual([
            "needs_attention",
            "stalled",
            "all_records",
        ]);
    });

    it("caps breadth", () => {
        expect(adjacentWorkUnitQueuePillKeys(summaries, "pipeline", 1)).toEqual(["needs_attention"]);
    });

    it("falls back to first keys when selection is unknown", () => {
        expect(adjacentWorkUnitQueuePillKeys(summaries, "missing", 2)).toEqual([
            "needs_attention",
            "pipeline",
        ]);
    });
});
