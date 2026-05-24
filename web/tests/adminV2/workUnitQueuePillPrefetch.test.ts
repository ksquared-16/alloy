import { describe, expect, it } from "vitest";

import {
    adjacentWorkUnitQueuePillKeys,
    flattenWorkUnitVisibleQueuePillKeys,
    workUnitQueuePillPrefetchTargets,
} from "@/lib/adminV2/workUnitQueuePillPrefetch";
import { queueRowLogicalCacheKey } from "@/lib/workspace/queueRowClientCache";

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

    it("flattenWorkUnitVisibleQueuePillKeys preserves expanded NA bucket pills", () => {
        const keys = flattenWorkUnitVisibleQueuePillKeys([
            {
                queues: [
                    { key: "enrolled" },
                    { key: "__attention_bucket:follow_up_due" },
                    { key: "__attention_bucket:stale_quote" },
                ],
            },
        ]);
        expect(keys).toEqual([
            "enrolled",
            "__attention_bucket:follow_up_due",
            "__attention_bucket:stale_quote",
        ]);
    });

    it("workUnitQueuePillPrefetchTargets warms neighbors including NA buckets", () => {
        const visible = [
            "enrolled",
            "__attention_bucket:follow_up_due",
            "tour_scheduled",
            "__attention_bucket:stale_quote",
        ];
        expect(workUnitQueuePillPrefetchTargets(visible, "enrolled", 3)).toEqual([
            "__attention_bucket:follow_up_due",
            "tour_scheduled",
            "__attention_bucket:stale_quote",
        ]);
    });

    it("cache key includes queue and attention bucket for needs_attention", () => {
        const fp = "scope:test";
        expect(queueRowLogicalCacheKey(fp, "wu-1", "needs_attention", false, "follow_up_due")).toBe(
            `${fp}:wu-1:needs_attention:all:attn:follow_up_due`
        );
        expect(queueRowLogicalCacheKey(fp, "wu-1", "enrolled", false, "follow_up_due")).toBe(
            `${fp}:wu-1:enrolled:all`
        );
    });
});
