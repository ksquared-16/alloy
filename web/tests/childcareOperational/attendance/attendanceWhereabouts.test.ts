/**
 * Point-in-time whereabouts — the invariant is that a child is in ONE place.
 *
 * The failure being guarded is the day-level fold's room SET: a child who moved
 * Toddler 1 → Playground → Toddler 2 appears in all three, so any consumer
 * counting occupancy from it triple-counts one child. These tests assert the
 * timeline, not just the endpoints, because the bug only shows up mid-day.
 */

import { describe, expect, it } from "vitest";
import {
    occupancyAt,
    occupancyByPhysicalSpaceAt,
    whereaboutsAt,
} from "@/lib/childcareOperational/attendance/attendanceWhereabouts";
import { summarizeAttendanceByDay } from "@/lib/childcareOperational/attendance/attendanceFold";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

const AGR = "agr-1";
const MEMBER = "child-1";
const TOD1 = "tod-1";
const TOD2 = "tod-2";
const PLAY = "playground";
const ROOM1 = "room-1";

let seq = 0;
function ev(over: Partial<ChildAttendanceEventRow>): ChildAttendanceEventRow {
    seq += 1;
    return {
        id: `e${seq}`,
        org_id: "org",
        enrollment_agreement_id: AGR,
        customer_member_id: MEMBER,
        site_location_id: "site",
        event_kind: "check_in",
        entry_type: "original",
        corrects_event_id: null,
        event_at: "2026-09-09T08:00:00.000Z",
        service_date: "2026-09-09",
        room_location_id: null,
        from_room_location_id: null,
        to_room_location_id: null,
        actor_type: "staff",
        actor_user_id: null,
        actor_person_id: null,
        actor_label: null,
        source_type: "operator_action",
        source_key: "operator_action",
        reason_key: null,
        note: null,
        metadata: {},
        created_by: null,
        created_at: "2026-09-09T08:00:00.000Z",
        ...over,
    } as ChildAttendanceEventRow;
}

/** 08:00 Toddler 1 → 10:00 Playground → 10:45 Toddler 2 → 17:00 out. */
const DAY: ChildAttendanceEventRow[] = [
    ev({ id: "in", event_kind: "check_in", room_location_id: TOD1, event_at: "2026-09-09T08:00:00.000Z" }),
    ev({
        id: "mv1",
        event_kind: "room_transfer",
        from_room_location_id: TOD1,
        to_room_location_id: PLAY,
        event_at: "2026-09-09T10:00:00.000Z",
    }),
    ev({
        id: "mv2",
        event_kind: "room_transfer",
        from_room_location_id: PLAY,
        to_room_location_id: TOD2,
        event_at: "2026-09-09T10:45:00.000Z",
    }),
    ev({ id: "out", event_kind: "check_out", event_at: "2026-09-09T17:00:00.000Z" }),
];

describe("whereaboutsAt — the required sequence", () => {
    const cases: [string, string | null, string][] = [
        ["2026-09-09T07:00:00.000Z", null, "not_arrived"],
        ["2026-09-09T09:00:00.000Z", TOD1, "present"],
        ["2026-09-09T10:15:00.000Z", PLAY, "present"],
        ["2026-09-09T11:00:00.000Z", TOD2, "present"],
        ["2026-09-09T18:00:00.000Z", null, "departed"],
    ];

    for (const [at, locationId, state] of cases) {
        it(`${at} → ${locationId ?? state}`, () => {
            const w = whereaboutsAt(DAY, at);
            expect(w?.locationId).toBe(locationId);
            expect(w?.state).toBe(state);
        });
    }

    it("is inclusive at the exact instant of a move", () => {
        expect(whereaboutsAt(DAY, "2026-09-09T10:00:00.000Z")?.locationId).toBe(PLAY);
    });
});

describe("one child is never in two places", () => {
    it("counts the child in exactly one location at any instant", () => {
        for (const at of [
            "2026-09-09T09:00:00.000Z",
            "2026-09-09T10:15:00.000Z",
            "2026-09-09T11:00:00.000Z",
        ]) {
            const occ = occupancyAt(DAY, at);
            expect(occ).toHaveLength(1);
            expect(occ[0].childCount).toBe(1);
        }
    });

    it("contrasts with the day-level fold, which legitimately reports all three rooms", () => {
        // Not a bug in the day fold — a different question. This pins WHY
        // occupancy must not be derived from it.
        const [day] = summarizeAttendanceByDay(DAY);
        expect(day.roomsObserved.sort()).toEqual([PLAY, TOD1, TOD2].sort());
        expect(occupancyAt(DAY, "2026-09-09T11:00:00.000Z").map((o) => o.locationId)).toEqual([TOD2]);
    });

    it("reports nobody present after checkout", () => {
        expect(occupancyAt(DAY, "2026-09-09T18:00:00.000Z")).toEqual([]);
    });
});

describe("corrections and reversals reconstruct history", () => {
    it("a reversal of the playground move puts the child back in Toddler 1", () => {
        const reversed = [
            ...DAY,
            ev({
                id: "rev",
                event_kind: "room_transfer",
                entry_type: "reversal",
                corrects_event_id: "mv1",
                from_room_location_id: TOD1,
                to_room_location_id: PLAY,
                event_at: "2026-09-09T10:30:00.000Z",
            }),
        ];
        // The playground move never happened, so at 10:15 the child was still in
        // Toddler 1 — the past is rewritten by lineage, not by mutation.
        expect(whereaboutsAt(reversed, "2026-09-09T10:15:00.000Z")?.locationId).toBe(TOD1);
        // The later move to Toddler 2 still stands on its own.
        expect(whereaboutsAt(reversed, "2026-09-09T11:00:00.000Z")?.locationId).toBe(TOD2);
    });

    it("a correction restating the destination changes where the child was", () => {
        const corrected = [
            ...DAY,
            ev({
                id: "cor",
                event_kind: "room_transfer",
                entry_type: "correction",
                corrects_event_id: "mv1",
                from_room_location_id: TOD1,
                to_room_location_id: TOD2,
                event_at: "2026-09-09T10:00:00.000Z",
            }),
        ];
        expect(whereaboutsAt(corrected, "2026-09-09T10:15:00.000Z")?.locationId).toBe(TOD2);
    });

    it("a reversed check-in means the child was never present", () => {
        const events = [
            ev({ id: "in2", event_kind: "check_in", room_location_id: TOD1, event_at: "2026-09-09T08:00:00.000Z" }),
            ev({
                id: "rev2",
                event_kind: "check_in",
                entry_type: "reversal",
                corrects_event_id: "in2",
                room_location_id: TOD1,
                event_at: "2026-09-09T08:05:00.000Z",
            }),
        ];
        const w = whereaboutsAt(events, "2026-09-09T09:00:00.000Z");
        expect(w?.state).toBe("not_arrived");
        expect(occupancyAt(events, "2026-09-09T09:00:00.000Z")).toEqual([]);
    });
});

describe("absence and multi-child occupancy", () => {
    it("an absent child occupies nothing", () => {
        const events = [ev({ id: "abs", event_kind: "absence", reason_key: "illness" })];
        expect(whereaboutsAt(events, "2026-09-09T09:00:00.000Z")?.state).toBe("absent");
        expect(occupancyAt(events, "2026-09-09T09:00:00.000Z")).toEqual([]);
    });

    it("tallies several children independently", () => {
        const other = DAY.map((e) => ({
            ...e,
            id: `o-${e.id}`,
            enrollment_agreement_id: "agr-2",
            customer_member_id: "child-2",
        }));
        // child-2 never leaves Toddler 1.
        const stayput = other.filter((e) => e.event_kind === "check_in");
        const occ = occupancyAt([...DAY, ...stayput], "2026-09-09T11:00:00.000Z");
        const byLocation = Object.fromEntries(occ.map((o) => [o.locationId, o.childCount]));
        expect(byLocation).toEqual({ [TOD1]: 1, [TOD2]: 1 });
    });
});

describe("physical-space rollup (Thread 1 topology)", () => {
    // Toddler 1 and Toddler 2 both sit inside Room 1; the playground stands alone.
    const spaceByGroup = new Map<string, string | null>([
        [TOD1, ROOM1],
        [TOD2, ROOM1],
        [PLAY, null],
    ]);

    it("sums both groups into their containing physical space", () => {
        const other = [
            ev({
                id: "c2in",
                enrollment_agreement_id: "agr-2",
                customer_member_id: "child-2",
                event_kind: "check_in",
                room_location_id: TOD1,
                event_at: "2026-09-09T08:00:00.000Z",
            }),
        ];
        // At 11:00 child-1 is in Toddler 2 and child-2 is in Toddler 1 — one room.
        const rolled = occupancyByPhysicalSpaceAt([...DAY, ...other], "2026-09-09T11:00:00.000Z", spaceByGroup);
        expect(rolled).toEqual([{ locationId: ROOM1, at: "2026-09-09T11:00:00.000Z", occupants: ["child-1", "child-2"], childCount: 2 }]);
    });

    it("does not roll a child on the playground into their classroom's room", () => {
        const rolled = occupancyByPhysicalSpaceAt(DAY, "2026-09-09T10:15:00.000Z", spaceByGroup);
        expect(rolled).toEqual([{ locationId: PLAY, at: "2026-09-09T10:15:00.000Z", occupants: ["child-1"], childCount: 1 }]);
    });
});
