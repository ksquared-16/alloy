/**
 * Thread 9, Phase C — occupancy is a point-in-time question.
 *
 * Scenario E is the load-bearing one: a child moves Toddler 1 -> Playground ->
 * Toddler 2 across the day. Occupancy must follow her, the site total must stay
 * one, and nothing may consult or change placement.
 *
 * The counts are driven through `occupancyAt` — the certified fold — rather than
 * through hand-written location totals, so a change to what "present" means
 * breaks this file too.
 */

import { describe, expect, it } from "vitest";
import { occupancyAt, occupancyByPhysicalSpaceAt } from "@/lib/childcareOperational/attendance/attendanceWhereabouts";
import { totalOccupancy } from "@/lib/metrics/resolvers/attendanceOccupancyMetrics";
import { summarizeAttendanceByDay } from "@/lib/childcareOperational/attendance/attendanceFold";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

const DATE = "2026-09-12";
const TOD1 = "room-toddler-1";
const TOD2 = "room-toddler-2";
const PLAY = "room-playground";
const SPACE = "space-main-hall";

let seq = 0;
function ev(over: Partial<ChildAttendanceEventRow>): ChildAttendanceEventRow {
    seq += 1;
    return {
        id: `e${seq}`,
        org_id: "org",
        enrollment_agreement_id: "agr-1",
        customer_member_id: "child-1",
        site_location_id: "site-1",
        event_kind: "check_in",
        entry_type: "original",
        corrects_event_id: null,
        event_at: `${DATE}T08:00:00.000Z`,
        service_date: DATE,
        room_location_id: null,
        from_room_location_id: null,
        to_room_location_id: null,
        actor_type: "staff",
        actor_user_id: null,
        actor_person_id: null,
        actor_label: null,
        source_type: "staff_workspace",
        source_key: "staff_workspace",
        reason_key: null,
        note: null,
        metadata: {},
        created_by: null,
        created_at: `${DATE}T08:00:00.000Z`,
        ...over,
    } as ChildAttendanceEventRow;
}

const move = (from: string, to: string, at: string) =>
    ev({ event_kind: "room_transfer", from_room_location_id: from, to_room_location_id: to, event_at: `${DATE}T${at}:00.000Z` });

/** Toddler 1 -> Playground -> Toddler 2, one child, one day. */
const MOVEMENT_DAY = [
    ev({ room_location_id: TOD1 }),
    move(TOD1, PLAY, "10:30"),
    move(PLAY, TOD2, "14:00"),
];

describe("E — movement moves occupancy and nothing else", () => {
    it("places her in the room she is actually in, at each instant", () => {
        const morning = occupancyAt(MOVEMENT_DAY, `${DATE}T09:00:00.000Z`);
        expect(morning.map((o) => o.locationId)).toEqual([TOD1]);

        const midday = occupancyAt(MOVEMENT_DAY, `${DATE}T12:00:00.000Z`);
        expect(midday.map((o) => o.locationId)).toEqual([PLAY]);

        const afternoon = occupancyAt(MOVEMENT_DAY, `${DATE}T16:00:00.000Z`);
        expect(afternoon.map((o) => o.locationId)).toEqual([TOD2]);
    });

    it("keeps the site total at one all day — she is one child, not three", () => {
        for (const at of ["09:00", "12:00", "16:00"]) {
            const total = totalOccupancy(occupancyAt(MOVEMENT_DAY, `${DATE}T${at}:00.000Z`));
            expect(total, `total at ${at}`).toBe(1);
        }
    });

    it("is NOT what a daily summary would say", () => {
        /*
         * This is the failure the metric exists to avoid. The day summary reports
         * the SET of rooms she appeared in — three — and any resolver summing
         * that as occupancy would report three children on site.
         */
        const [day] = summarizeAttendanceByDay(MOVEMENT_DAY);
        expect(day.roomsObserved.length).toBe(3);
        expect(totalOccupancy(occupancyAt(MOVEMENT_DAY, `${DATE}T16:00:00.000Z`))).toBe(1);
    });

    it("reads no placement at all — the fold is given only facts", () => {
        // occupancyAt's entire input is the event list. There is no placement
        // parameter to pass, which is the structural guarantee that movement
        // cannot be mistaken for re-placement.
        const entries = occupancyAt(MOVEMENT_DAY, `${DATE}T16:00:00.000Z`);
        expect(entries[0].occupants).toEqual(["child-1"]);
    });
});

describe("physical space rollup", () => {
    it("rolls an operational group up to its containing space", () => {
        const spaceByGroupId = new Map<string, string | null>([
            [TOD1, SPACE],
            [TOD2, SPACE],
            [PLAY, null],
        ]);
        const rolled = occupancyByPhysicalSpaceAt(MOVEMENT_DAY, `${DATE}T16:00:00.000Z`, spaceByGroupId);
        expect(rolled.map((o) => o.locationId)).toEqual([SPACE]);
        expect(totalOccupancy(rolled)).toBe(1);
    });

    it("leaves a standalone location rolling up to itself", () => {
        const spaceByGroupId = new Map<string, string | null>([[PLAY, null]]);
        const rolled = occupancyByPhysicalSpaceAt(MOVEMENT_DAY, `${DATE}T12:00:00.000Z`, spaceByGroupId);
        expect(rolled.map((o) => o.locationId)).toEqual([PLAY]);
    });

    it("does not double count a child when groups share a space", () => {
        const spaceByGroupId = new Map<string, string | null>([
            [TOD1, SPACE],
            [TOD2, SPACE],
        ]);
        // Distinct agreements as well as distinct children: the fold groups
        // whereabouts by enrollment agreement, so sharing one would collapse two
        // children into a single position.
        const two = [
            ev({ customer_member_id: "a", enrollment_agreement_id: "agr-a", room_location_id: TOD1 }),
            ev({ customer_member_id: "b", enrollment_agreement_id: "agr-b", room_location_id: TOD2 }),
        ];
        const rolled = occupancyByPhysicalSpaceAt(two, `${DATE}T12:00:00.000Z`, spaceByGroupId);
        expect(totalOccupancy(rolled)).toBe(2);
        expect(rolled).toHaveLength(1);
    });
});

describe("departure and correction", () => {
    it("removes a checked-out child from occupancy", () => {
        const day = [
            ev({ room_location_id: TOD1 }),
            ev({ event_kind: "check_out", event_at: `${DATE}T15:00:00.000Z` }),
        ];
        expect(totalOccupancy(occupancyAt(day, `${DATE}T14:00:00.000Z`))).toBe(1);
        expect(totalOccupancy(occupancyAt(day, `${DATE}T16:00:00.000Z`))).toBe(0);
    });

    it("F — a reversed move rewrites where she is, without double counting", () => {
        const day = [
            ev({ id: "in", room_location_id: TOD1 }),
            ev({ id: "m1", event_kind: "room_transfer", from_room_location_id: TOD1, to_room_location_id: PLAY, event_at: `${DATE}T10:00:00.000Z` }),
            ev({ id: "rev", event_kind: "room_transfer", entry_type: "reversal", corrects_event_id: "m1", from_room_location_id: TOD1, to_room_location_id: PLAY, event_at: `${DATE}T10:05:00.000Z` }),
        ];
        const entries = occupancyAt(day, `${DATE}T12:00:00.000Z`);
        // The move never happened, so she is in her classroom — and she is still
        // exactly one child, not one in each room.
        expect(entries.map((o) => o.locationId)).toEqual([TOD1]);
        expect(totalOccupancy(entries)).toBe(1);
    });
});
