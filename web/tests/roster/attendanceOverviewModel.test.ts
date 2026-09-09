/**
 * The overview's two room counts must not be confused with each other.
 *
 * Roster presence answers "did my class come in" and counts a child wherever she
 * is. Physical occupancy answers "how many am I looking at" and counts whoever is
 * standing in the room. On a day when nobody moves they are identical, which is
 * exactly why the difference goes unnoticed until an afternoon when they diverge.
 */

import { describe, expect, it } from "vitest";
import {
    buildAttendanceOverviewModel,
    type OverviewCell,
} from "@/lib/roster/attendanceOverviewModel";

const TOD1 = "tod-1";
const TOD2 = "tod-2";
const PLAY = "play";

function child(
    id: string,
    state: "present" | "checked_out" | "absent" | "no_record",
    at: string | null = null,
) {
    return { customerMemberId: id, displayName: id, actual: { state, actualRoomLocationId: at } };
}

/** Emma is placed in Toddler 1 and is currently on the playground. */
const CELLS: OverviewCell[] = [
    {
        roomLocationId: TOD1,
        roomName: "Toddler 1",
        children: [child("emma", "present", PLAY), child("finn", "present", TOD1), child("gus", "no_record")],
    },
    {
        roomLocationId: TOD2,
        roomName: "Toddler 2",
        children: [child("hana", "checked_out"), child("ivo", "present", TOD2)],
    },
    { roomLocationId: PLAY, roomName: "Playground", children: [] },
];

describe("physical occupancy", () => {
    it("counts a visiting child in the room she is IN, not the one she is placed in", () => {
        const { hereNowByRoom } = buildAttendanceOverviewModel(CELLS);
        expect(hereNowByRoom.get(PLAY)).toBe(1); // Emma
        expect(hereNowByRoom.get(TOD1)).toBe(1); // Finn only — Emma is not here
        expect(hereNowByRoom.get(TOD2)).toBe(1); // Ivo
    });

    it("gives the playground a real count even though nobody is placed there", () => {
        // A shared space has no roster of its own; without this it would always
        // read zero while full of children.
        expect(buildAttendanceOverviewModel(CELLS).hereNowByRoom.get(PLAY)).toBe(1);
    });

    it("total occupancy equals the number of present children", () => {
        const m = buildAttendanceOverviewModel(CELLS);
        const total = [...m.hereNowByRoom.values()].reduce((a, b) => a + b, 0);
        expect(total).toBe(m.counts.present);
    });

    it("counts a present child with no resolved room where she is placed", () => {
        const cells: OverviewCell[] = [
            { roomLocationId: TOD1, roomName: "Toddler 1", children: [child("j", "present", null)] },
        ];
        const m = buildAttendanceOverviewModel(cells);
        expect(m.hereNowByRoom.get(TOD1)).toBe(1);
        // and she is not reported as away, because nothing said she went anywhere
        expect(m.awayFromPlacement).toHaveLength(0);
    });

    it("does not count checked-out or absent children as occupying anything", () => {
        const m = buildAttendanceOverviewModel(CELLS);
        expect([...m.hereNowByRoom.values()].reduce((a, b) => a + b, 0)).toBe(3);
        expect(m.counts.checkedOut).toBe(1);
    });
});

describe("away from placement", () => {
    it("names the child, where she belongs and where she is", () => {
        const [away] = buildAttendanceOverviewModel(CELLS).awayFromPlacement;
        expect(away).toMatchObject({ displayName: "emma", placedIn: "Toddler 1", nowIn: "Playground" });
    });

    it("does not report a child sitting in her own room", () => {
        const names = buildAttendanceOverviewModel(CELLS).awayFromPlacement.map((a) => a.displayName);
        expect(names).not.toContain("finn");
        expect(names).not.toContain("ivo");
    });

    it("is empty on a day when nobody moves — the case that hid the bug", () => {
        const still: OverviewCell[] = [
            { roomLocationId: TOD1, roomName: "Toddler 1", children: [child("a", "present", TOD1)] },
        ];
        const m = buildAttendanceOverviewModel(still);
        expect(m.awayFromPlacement).toEqual([]);
        expect(m.hereNowByRoom.get(TOD1)).toBe(1);
    });

    it("falls back to a neutral label when the destination room is not on screen", () => {
        const cells: OverviewCell[] = [
            { roomLocationId: TOD1, roomName: "Toddler 1", children: [child("k", "present", "elsewhere")] },
        ];
        expect(buildAttendanceOverviewModel(cells).awayFromPlacement[0].nowIn).toBe("another room");
    });
});

describe("the four counts", () => {
    it("classifies every expected child exactly once", () => {
        const c = buildAttendanceOverviewModel(CELLS).counts;
        expect(c).toMatchObject({ expected: 5, present: 3, notArrived: 1, checkedOut: 1, absent: 0 });
        expect(c.present + c.notArrived + c.checkedOut + c.absent).toBe(c.expected);
    });

    it("survives an empty site without inventing numbers", () => {
        const m = buildAttendanceOverviewModel([]);
        expect(m.counts).toMatchObject({ expected: 0, present: 0, notArrived: 0, checkedOut: 0 });
        expect(m.awayFromPlacement).toEqual([]);
        expect(m.hereNowByRoom.size).toBe(0);
    });
});
