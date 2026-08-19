import { describe, expect, it } from "vitest";

import { compareByAttentionThenName } from "@/components/adminV2/scheduling/rosterOrdering";

/**
 * ROOM ATTENTION ORDER — AND THE TWO KINDS OF EMPTY.
 *
 * The ordering rule already separated the two kinds of `unknown`: a room with children expected and
 * no resolvable ratio is a problem, an empty room in a closed wing is nothing. `idle` needed the same
 * split once the Day surface began ordering by the ACTUAL verdict, because "nobody has arrived yet"
 * and "nobody was expected" are both idle and only one of them is still waiting on somebody.
 *
 * Pinned here rather than left to the browser gate: this is a pure comparison rule, and a cert spec
 * would only catch the specific fixture's ordering rather than the rule itself.
 */

type Room = { verdict: "short" | "sufficient" | "unknown" | "idle"; operating: boolean; name: string };

const order = (rooms: Room[]) =>
    [...rooms].sort(compareByAttentionThenName((r) => r)).map((r) => r.name);

describe("compareByAttentionThenName", () => {
    it("puts short rooms first, whatever their name", () => {
        expect(
            order([
                { verdict: "sufficient", operating: true, name: "Aardvark" },
                { verdict: "short", operating: true, name: "Zebra" },
            ]),
        ).toEqual(["Zebra", "Aardvark"]);
    });

    it("ranks an operating idle room above a room nobody was expected in", () => {
        /*
         * The load-bearing case. Both are `idle`; only the first one has anybody expected, and it is
         * the one an operator has a reason to look at — its day has not started. Ranking them
         * together sank the only populated room beneath a closed wing, which is the same failure
         * alphabetical ordering had.
         */
        expect(
            order([
                { verdict: "idle", operating: false, name: "Closed Wing" },
                { verdict: "idle", operating: true, name: "Waiting Room" },
            ]),
        ).toEqual(["Waiting Room", "Closed Wing"]);
    });

    it("keeps an operating idle room above empty unconfigured rooms", () => {
        // A non-operating `unknown` is rank 4 — the empty-and-unconfigured case. An operating idle
        // room must still beat it, or the Day surface leads with rooms that hold nobody at all.
        expect(
            order([
                { verdict: "unknown", operating: false, name: "Empty A" },
                { verdict: "unknown", operating: false, name: "Empty B" },
                { verdict: "idle", operating: true, name: "Toddler Room" },
            ]),
        ).toEqual(["Toddler Room", "Empty A", "Empty B"]);
    });

    it("still ranks a real problem above a room that is merely waiting", () => {
        expect(
            order([
                { verdict: "idle", operating: true, name: "Waiting Room" },
                { verdict: "unknown", operating: true, name: "No Rule Room" },
                { verdict: "short", operating: true, name: "Short Room" },
            ]),
        ).toEqual(["Short Room", "No Rule Room", "Waiting Room"]);
    });

    it("falls back to name only within a rank", () => {
        expect(
            order([
                { verdict: "short", operating: true, name: "Beta" },
                { verdict: "short", operating: true, name: "Alpha" },
            ]),
        ).toEqual(["Alpha", "Beta"]);
    });
});
