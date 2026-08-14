/**
 * The organization → school → room shape, built from canonical relationships.
 *
 * The defect being closed: schools and rooms rendered as one flat peer list, so
 * "Bears" sat beside "South Campus" as though they were the same kind of thing.
 *
 * The two failure modes these tests pin are the ones the live tenant actually
 * exhibits — a duplicated room label across campuses, and a `location_type_id`
 * that joins nothing. Both would be invisible in a fixture invented from scratch.
 */

import { describe, expect, it } from "vitest";

import { buildLocationHierarchy, type LocationRow } from "@/lib/communications/locationHierarchy";

/** Shaped after the real tenant: three campuses, rooms nested beneath. */
const LIVE_SHAPE: LocationRow[] = [
    { id: "north", label: "North Campus", location_type: "site", parent_location_id: null },
    { id: "south", label: "South Campus", location_type: "site", parent_location_id: null },
    { id: "n-infant-a", label: "Infant A", location_type: "unit", parent_location_id: "north" },
    { id: "n-toddler", label: "Toddler 1", location_type: "unit", parent_location_id: "north" },
    { id: "s-bears", label: "Bears", location_type: "unit", parent_location_id: "south" },
    { id: "s-giraffe", label: "Giraffe", location_type: "unit", parent_location_id: "south" },
];

describe("schools and rooms are different kinds of thing", () => {
    it("nests rooms under their school instead of listing them as peers", () => {
        const { sites } = buildLocationHierarchy(LIVE_SHAPE);
        expect(sites.map((s) => s.label)).toEqual(["North Campus", "South Campus"]);
        expect(sites.find((s) => s.id === "south")!.rooms.map((r) => r.label)).toEqual(["Bears", "Giraffe"]);
    });

    it("puts no room at the top level", () => {
        const { sites } = buildLocationHierarchy(LIVE_SHAPE);
        expect(sites.some((s) => s.label === "Bears")).toBe(false);
    });
});

describe("hierarchy comes from the parent link, never from names", () => {
    /**
     * The live tenant has "Infant A" under BOTH North and West Campus. Matching on
     * label would merge them into one room — and then a conversation belonging to
     * one campus would be filed under the other.
     */
    it("keeps identically-named rooms in different schools apart", () => {
        const { sites } = buildLocationHierarchy([
            { id: "north", label: "North Campus", location_type: "site", parent_location_id: null },
            { id: "west", label: "West Campus", location_type: "site", parent_location_id: null },
            { id: "n-infant", label: "Infant A", location_type: "unit", parent_location_id: "north" },
            { id: "w-infant", label: "Infant A", location_type: "unit", parent_location_id: "west" },
        ]);
        expect(sites.find((s) => s.id === "north")!.rooms).toEqual([{ id: "n-infant", label: "Infant A" }]);
        expect(sites.find((s) => s.id === "west")!.rooms).toEqual([{ id: "w-infant", label: "Infant A" }]);
    });

    it("does not group a room under a school just because the labels look related", () => {
        const { sites, unparented } = buildLocationHierarchy([
            { id: "north", label: "North Campus", location_type: "site", parent_location_id: null },
            // Label mentions the campus; the parent link says otherwise (absent).
            { id: "orphan", label: "North Campus — Bears", location_type: "unit", parent_location_id: null },
        ]);
        expect(sites.find((s) => s.id === "north")!.rooms).toEqual([]);
        expect(unparented.map((r) => r.id)).toEqual(["orphan"]);
    });
});

describe("nothing is silently dropped", () => {
    it("surfaces a room whose parent is missing or inactive rather than hiding it", () => {
        const { sites, unparented } = buildLocationHierarchy([
            { id: "south", label: "South Campus", location_type: "site", parent_location_id: null },
            // Parent is not among the active rows — e.g. the school was deactivated.
            { id: "stray", label: "Zebras", location_type: "unit", parent_location_id: "retired-campus" },
        ]);
        expect(sites).toHaveLength(1);
        expect(unparented).toEqual([{ id: "stray", label: "Zebras" }]);
    });

    it("every input row lands in exactly one place", () => {
        const rows: LocationRow[] = [
            ...LIVE_SHAPE,
            { id: "odd", label: "Family address", location_type: "address", parent_location_id: null },
        ];
        const { sites, unparented } = buildLocationHierarchy(rows);
        const placed = sites.length + sites.reduce((n, s) => n + s.rooms.length, 0) + unparented.length;
        expect(placed).toBe(rows.length);
    });

    it("a row with an unrecognised type is surfaced, not discarded", () => {
        const { unparented } = buildLocationHierarchy([
            { id: "odd", label: "Family address", location_type: "address", parent_location_id: null },
        ]);
        expect(unparented.map((r) => r.label)).toEqual(["Family address"]);
    });
});

describe("reads the text type column, which is the one the data actually uses", () => {
    /**
     * On the live tenant every location carries a text `location_type` while
     * `location_type_id` matches no `location_types` row — and the lookup table
     * itself holds duplicates for the same key. Requiring the id would produce an
     * empty page.
     */
    it("classifies from `location_type` with no type id present at all", () => {
        const { sites } = buildLocationHierarchy([
            { id: "s", label: "South Campus", location_type: "site", parent_location_id: null },
            { id: "r", label: "Bears", location_type: "unit", parent_location_id: "s" },
        ]);
        expect(sites).toHaveLength(1);
        expect(sites[0]!.rooms).toHaveLength(1);
    });

    it("is case- and whitespace-tolerant about the type value", () => {
        const { sites } = buildLocationHierarchy([
            { id: "s", label: "South Campus", location_type: " Site ", parent_location_id: null },
        ]);
        expect(sites.map((s) => s.id)).toEqual(["s"]);
    });
});

describe("ordering is stable for an operator scanning the page", () => {
    it("sorts schools and their rooms alphabetically", () => {
        const { sites } = buildLocationHierarchy([
            { id: "s", label: "South Campus", location_type: "site", parent_location_id: null },
            { id: "n", label: "North Campus", location_type: "site", parent_location_id: null },
            { id: "z", label: "Zebras", location_type: "unit", parent_location_id: "s" },
            { id: "b", label: "Bears", location_type: "unit", parent_location_id: "s" },
        ]);
        expect(sites.map((s) => s.label)).toEqual(["North Campus", "South Campus"]);
        expect(sites[1]!.rooms.map((r) => r.label)).toEqual(["Bears", "Zebras"]);
    });
});
