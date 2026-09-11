/**
 * Thread 8, Slice A — every surface that asks "which rooms belong to this site?"
 * must answer by ANCESTRY.
 *
 * Nine call sites had each grown their own `parent_location_id === site.id`
 * test. That is correct only while every room hangs directly off the site, and
 * it stopped being correct when a physical space could contain operational
 * groups. The failure is silent in both directions: a nested classroom simply
 * vanishes from a list, and nothing throws.
 *
 * These cover the three shapes the product must support at once — a flat legacy
 * site, a nested site, and shared spaces — because the flat case is the one that
 * kept every old filter looking correct.
 */

import { describe, expect, it } from "vitest";
import {
    rowBelongsToSite,
    rowsBelongingToSite,
    type LocationAncestryRow,
} from "@/lib/location/canonicalRoomProvider";

const SITE = "site-a";
const OTHER_SITE = "site-b";

/** Shape 1 — flat legacy: every room directly under the site. */
const LEGACY_ROOM = { id: "legacy", parent_location_id: SITE };

/** Shape 2 — nested: site -> physical space -> operational group. */
const ROOM1 = { id: "room1", parent_location_id: SITE }; // physical_space
const TOD1 = { id: "tod1", parent_location_id: "room1" }; // operational_group, NESTED

/** Shape 3 — shared space, hanging directly off the site. */
const PLAYGROUND = { id: "playground", parent_location_id: SITE };

/** A room at a different campus entirely. */
const FOREIGN = { id: "foreign", parent_location_id: OTHER_SITE };

const ALL: LocationAncestryRow[] = [LEGACY_ROOM, ROOM1, TOD1, PLAYGROUND, FOREIGN];

describe("rowsBelongingToSite — the three shapes, together", () => {
    it("keeps a flat legacy room", () => {
        expect(rowsBelongingToSite(ALL, SITE).map((r) => r.id)).toContain("legacy");
    });

    it("keeps a group NESTED inside a physical space — the whole point", () => {
        // The direct-parent filter this replaces returned false here, silently.
        expect(rowsBelongingToSite(ALL, SITE).map((r) => r.id)).toContain("tod1");
    });

    it("keeps the physical space itself and a shared space", () => {
        const ids = rowsBelongingToSite(ALL, SITE).map((r) => r.id);
        expect(ids).toContain("room1");
        expect(ids).toContain("playground");
    });

    it("never leaks a room from another campus", () => {
        expect(rowsBelongingToSite(ALL, SITE).map((r) => r.id)).not.toContain("foreign");
        expect(rowsBelongingToSite(ALL, OTHER_SITE).map((r) => r.id)).toEqual(["foreign"]);
    });

    it("resolves the whole site in one call", () => {
        expect(rowsBelongingToSite(ALL, SITE).map((r) => r.id).sort()).toEqual([
            "legacy",
            "playground",
            "room1",
            "tod1",
        ]);
    });
});

describe("rowBelongsToSite — refuses rather than guesses", () => {
    const byId = new Map(ALL.map((r) => [r.id, r]));

    it("answers false for an orphan, not a guess", () => {
        expect(rowBelongsToSite({ id: "orphan", parent_location_id: null }, SITE, byId)).toBe(false);
    });

    it("answers false when an ancestor is missing from the set", () => {
        // A caller holding a partial row set must not get a confident wrong answer.
        const partial = new Map([[TOD1.id, TOD1]]);
        expect(rowBelongsToSite(TOD1, SITE, partial)).toBe(false);
    });

    it("answers false for an empty site id rather than matching everything", () => {
        expect(rowBelongsToSite(LEGACY_ROOM, "", byId)).toBe(false);
    });

    it("terminates on a cycle instead of hanging", () => {
        const a = { id: "a", parent_location_id: "b" };
        const b = { id: "b", parent_location_id: "a" };
        const cyc = new Map([
            ["a", a],
            ["b", b],
        ]);
        expect(rowBelongsToSite(a, SITE, cyc)).toBe(false);
    });

    it("stops at the depth bound rather than walking an arbitrary chain", () => {
        const chain: LocationAncestryRow[] = [];
        for (let i = 0; i < 12; i += 1) {
            chain.push({ id: `n${i}`, parent_location_id: i === 11 ? SITE : `n${i + 1}` });
        }
        const deep = new Map(chain.map((r) => [r.id, r]));
        // The DB caps the tree at site -> physical_space -> group; a 12-deep chain
        // is not a topology the product supports, and the walk refuses it.
        expect(rowBelongsToSite(chain[0], SITE, deep)).toBe(false);
    });
});
