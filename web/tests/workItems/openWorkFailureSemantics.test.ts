/**
 * A FAILED LISTING IS NOT AN EMPTY LISTING.
 *
 * `countOpenWork` returns 0 for a non-array, which is right for a counter and wrong for a network
 * result. Feeding an unavailable listing into it converts UNKNOWN into KNOWN_ZERO, and the operator
 * reads an authoritative "no work" for a record whose work nobody could read. That is not a missing
 * number; it is a wrong one, and it looks exactly like the right one.
 *
 * These gates hold the four states apart:
 *
 *   UNKNOWN / UNAVAILABLE   the listing did not answer      -> null
 *   KNOWN_ZERO              the listing answered, nothing   -> 0
 *   KNOWN_NONZERO           the listing answered, n open    -> n
 *
 * The transport failures were already covered. The one that was not is a SUCCESSFUL response whose
 * body carried no task array: `readJson` swallows a parse failure and returns `{}`, so an
 * unparseable 200 reached the counter as `undefined` and scored zero.
 */
import { describe, expect, it } from "vitest";

import {
    countOpenWork,
    openWorkCountFromListing,
} from "@/lib/adminV2/runtime/focusPanel/useRecordAttentionCounts";

const open = (n: number) => Array.from({ length: n }, () => ({ status: "open" }));

describe("the counter itself still counts", () => {
    it("counts only open rows", () => {
        expect(countOpenWork([{ status: "open" }, { status: "completed" }, { status: "open" }])).toBe(2);
    });

    /*
     * This is the hazard, asserted rather than assumed — the gate below exists BECAUSE this is
     * true. If someone "fixes" countOpenWork to return null, this fails loudly and the boundary
     * rule can be revisited deliberately instead of silently becoming redundant.
     */
    it("returns 0 for a non-array — which is exactly why it must not be fed a failed read", () => {
        expect(countOpenWork(null)).toBe(0);
        expect(countOpenWork(undefined)).toBe(0);
    });
});

describe("a listing that did not answer is UNKNOWN, never zero", () => {
    it("a refused or errored response is null", () => {
        expect(openWorkCountFromListing(false, { tasks: [] })).toBeNull();
        expect(openWorkCountFromListing(false, null)).toBeNull();
        // Even when a failure body happens to carry rows, a non-OK read is not an answer.
        expect(openWorkCountFromListing(false, { tasks: open(3) })).toBeNull();
    });

    it("a SUCCESSFUL response with no task array is null — the parse-failure path", () => {
        // `readJson` returns {} when the body cannot be parsed, so this is a real 200.
        expect(openWorkCountFromListing(true, {})).toBeNull();
        expect(openWorkCountFromListing(true, null)).toBeNull();
        expect(openWorkCountFromListing(true, undefined)).toBeNull();
    });

    it("a task field of the wrong shape is null, not coerced", () => {
        for (const bad of [{ tasks: null }, { tasks: "3" }, { tasks: 3 }, { tasks: {} }]) {
            expect(openWorkCountFromListing(true, bad as never)).toBeNull();
        }
    });

    it("NEVER returns 0 for anything that did not answer", () => {
        const didNotAnswer = [
            openWorkCountFromListing(false, { tasks: [] }),
            openWorkCountFromListing(true, {}),
            openWorkCountFromListing(true, null),
            openWorkCountFromListing(true, { tasks: null } as never),
        ];
        for (const v of didNotAnswer) expect(v).not.toBe(0);
    });
});

describe("a listing that answered is trusted, including when it answers none", () => {
    it("an empty array is KNOWN_ZERO — a real answer, distinct from unknown", () => {
        const zero = openWorkCountFromListing(true, { tasks: [] });
        expect(zero).toBe(0);
        expect(zero).not.toBeNull();
    });

    it("a populated array is KNOWN_NONZERO", () => {
        expect(openWorkCountFromListing(true, { tasks: open(4) })).toBe(4);
    });

    it("status semantics are the canonical ones, not a second predicate", () => {
        const mixed = [{ status: "open" }, { status: "completed" }, { status: "canceled" }, { status: " open " }];
        expect(openWorkCountFromListing(true, { tasks: mixed })).toBe(countOpenWork(mixed));
    });
});
