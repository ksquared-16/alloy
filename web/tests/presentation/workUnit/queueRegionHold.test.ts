import { describe, expect, it } from "vitest";

import { queueRegionRenderState } from "@/components/presentation/workUnit/QueueRegion";

/**
 * Queue-lane hold: a Work View switch on the same host work unit (or a live refresh) must swap
 * rows IN PLACE, not flash the row skeleton. The runtime keeps the prior rows while the next
 * fetch is in flight, so `queueRegionRenderState` must render `"rows"` (held) whenever rows are
 * present — even while `loading` — reserving the skeleton for the cold first load only.
 */
describe("queueRegionRenderState — queue-lane hold on refetch", () => {
    const rows = [{ id: "a" }, { id: "b" }];

    it("cold first load (loading, no rows) → skeleton", () => {
        expect(queueRegionRenderState({ rows: [], loading: true, error: null })).toBe("cold-loading");
    });

    it("REFETCH with prior rows present (loading + rows) → holds rows, no skeleton", () => {
        expect(queueRegionRenderState({ rows, loading: true, error: null })).toBe("rows");
    });

    it("settled with rows → rows", () => {
        expect(queueRegionRenderState({ rows, loading: false, error: null })).toBe("rows");
    });

    it("settled empty (no rows, not loading) → empty", () => {
        expect(queueRegionRenderState({ rows: [], loading: false, error: null })).toBe("empty");
    });

    it("a real error surfaces even over stale rows (never hidden)", () => {
        expect(queueRegionRenderState({ rows, loading: false, error: "boom" })).toBe("error");
        expect(queueRegionRenderState({ rows, loading: true, error: "boom" })).toBe("error");
    });
});
