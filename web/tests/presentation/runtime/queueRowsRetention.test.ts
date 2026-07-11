import { describe, expect, it } from "vitest";
import {
    queuePopulationIdentityKey,
    queueRowsForListDuringHold,
    shouldClearQueueResultOnFetchError,
} from "@/lib/presentation/runtime/queueRowsRetention";
import { queueRegionRenderState } from "@/components/presentation/workUnit/QueueRegion";

const ROWS = [{ id: "a" }, { id: "b" }];

describe("queueRowsRetention — Step D queue continuity", () => {
    it("population identity changes when work view id changes", () => {
        const base = {
            selectedSiteId: null,
            workUnitId: "wu-lead",
            baseQueueKey: "lifecycle_lead",
        };
        expect(queuePopulationIdentityKey({ ...base, workViewId: "new_leads" })).not.toBe(
            queuePopulationIdentityKey({ ...base, workViewId: "all_leads" }),
        );
    });

    it("prior rows remain during same-host destination fetch (render state)", () => {
        expect(queueRegionRenderState({ rows: ROWS, loading: true, error: null })).toBe("rows");
    });

    it("no skeleton after rows previously settled", () => {
        expect(queueRegionRenderState({ rows: ROWS, loading: true, error: null })).not.toBe(
            "cold-loading",
        );
    });

    it("no false empty while fetch pending", () => {
        expect(queueRegionRenderState({ rows: ROWS, loading: true, error: null })).not.toBe("empty");
    });

    it("true empty only appears after destination settles", () => {
        expect(queueRegionRenderState({ rows: [], loading: false, error: null })).toBe("empty");
        expect(queueRegionRenderState({ rows: [], loading: true, error: null })).toBe("cold-loading");
    });

    it("fetch failure with prior rows holds rows and surfaces error inline", () => {
        expect(queueRegionRenderState({ rows: ROWS, loading: false, error: "boom" })).toBe("rows");
        expect(queueRegionRenderState({ rows: ROWS, loading: true, error: "boom" })).toBe("rows");
    });

    it("fetch failure without prior rows is a hard error", () => {
        expect(queueRegionRenderState({ rows: [], loading: false, error: "boom" })).toBe("error");
    });

    it("shouldClearQueueResultOnFetchError retains when rows exist", () => {
        expect(shouldClearQueueResultOnFetchError(true)).toBe(false);
        expect(shouldClearQueueResultOnFetchError(false)).toBe(true);
    });

    it("client filters do not hide held rows during fetch", () => {
        const held = queueRowsForListDuringHold({
            queueRows: ROWS,
            visibleRows: [],
            loading: true,
            filterActive: true,
        });
        expect(held).toEqual(ROWS);
    });

    it("client filters apply when not holding", () => {
        const filtered = queueRowsForListDuringHold({
            queueRows: ROWS,
            visibleRows: [ROWS[0]],
            loading: false,
            filterActive: true,
        });
        expect(filtered).toEqual([ROWS[0]]);
    });
});
