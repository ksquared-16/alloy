import { describe, expect, it } from "vitest";
import {
    ALLOY_HISTORY_DESTINATION_KEY,
    readHistoryDestination,
    stampHistoryDestination,
} from "@/lib/experience/surfaceHost/historyDestination";
import { destinationIdKey, type DestinationId } from "@/lib/runtime/graph/destinationId";

const DEST: DestinationId = {
    workUnitId: "wu-1",
    workViewId: "new_leads",
    subjectId: "subj-9",
    focusMode: null,
};

describe("historyDestination (B2 stamp/restore)", () => {
    it("round-trips a destination through history.state", () => {
        const state = stampHistoryDestination(null, DEST);
        expect(state[ALLOY_HISTORY_DESTINATION_KEY]).toBe(destinationIdKey(DEST));
        expect(readHistoryDestination(state)).toEqual(DEST);
    });

    it("preserves other owners' history.state fields (Next.js router tree)", () => {
        const prev = { __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: [] }, __NA: true };
        const state = stampHistoryDestination(prev, DEST);
        expect(state.__NA).toBe(true);
        expect(state.__PRIVATE_NEXTJS_INTERNALS_TREE).toBe(prev.__PRIVATE_NEXTJS_INTERNALS_TREE);
        expect(readHistoryDestination(state)).toEqual(DEST);
    });

    it("clears a stale stamp when the destination is null (return to Workspace)", () => {
        const stamped = stampHistoryDestination({ keep: 1 }, DEST);
        const cleared = stampHistoryDestination(stamped, null);
        expect(cleared.keep).toBe(1);
        expect(ALLOY_HISTORY_DESTINATION_KEY in cleared).toBe(false);
        expect(readHistoryDestination(cleared)).toBeNull();
    });

    it("reads null from absent, non-object, or malformed state", () => {
        expect(readHistoryDestination(null)).toBeNull();
        expect(readHistoryDestination(undefined)).toBeNull();
        expect(readHistoryDestination("x")).toBeNull();
        expect(readHistoryDestination({ [ALLOY_HISTORY_DESTINATION_KEY]: 42 })).toBeNull();
        expect(readHistoryDestination({ [ALLOY_HISTORY_DESTINATION_KEY]: "not|a|valid|key|extra" })).toBeNull();
    });
});
