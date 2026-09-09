/**
 * The roster's "where is this child now" must be the LAST PLACE THEY WENT, not
 * the alphabetically-last room they visited.
 *
 * THE BUG THIS PINS
 *
 * `buildCombinedRoster` derived current location as
 * `day.roomsObserved[day.roomsObserved.length - 1]`. `roomsObserved` is built by
 * `summarizeAttendanceByDay` as `[...rooms].sort()` — an alphabetically sorted
 * SET, with no time in it at all. Taking its last element answers "which room
 * name sorts last today", which coincides with the truth often enough to look
 * correct in a demo and to be wrong on a real afternoon.
 *
 * A child who ends the day back on the playground is the ordinary case that
 * breaks it: Playground sorts before Toddler 2, so the roster keeps showing
 * Toddler 2 after she has left it. The operator is then told a child is in a
 * room she is not in — the single worst thing an attendance board can say.
 *
 * Thread 2 already built and certified the correct answer (`whereaboutsAt`,
 * a chronological fold). These tests assert the roster agrees with it.
 */

import { describe, expect, it } from "vitest";
import { summarizeAttendanceByDay } from "@/lib/childcareOperational/attendance/attendanceFold";
import { whereaboutsAt } from "@/lib/childcareOperational/attendance/attendanceWhereabouts";
import { resolveCurrentWhereabouts } from "@/lib/roster/resolveCurrentWhereabouts";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

const AGR = "agr-1";
const TOD1 = "b-toddler-1";
const TOD2 = "c-toddler-2";
const PLAY = "a-playground"; // sorts FIRST — the case the old derivation got wrong

let seq = 0;
function ev(over: Partial<ChildAttendanceEventRow>): ChildAttendanceEventRow {
    seq += 1;
    return {
        id: `e${seq}`,
        org_id: "org",
        enrollment_agreement_id: AGR,
        customer_member_id: "child-1",
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
        source_type: "staff_workspace",
        source_key: "staff_workspace",
        reason_key: null,
        note: null,
        metadata: {},
        created_by: null,
        created_at: "2026-09-09T08:00:00.000Z",
        ...over,
    } as ChildAttendanceEventRow;
}

/** Checked into Toddler 1, moved to Toddler 2, then out to the Playground. */
const ENDS_ON_PLAYGROUND: ChildAttendanceEventRow[] = [
    ev({ id: "in", event_kind: "check_in", room_location_id: TOD1, event_at: "2026-09-09T08:00:00.000Z" }),
    ev({
        id: "m1",
        event_kind: "room_transfer",
        from_room_location_id: TOD1,
        to_room_location_id: TOD2,
        event_at: "2026-09-09T10:00:00.000Z",
    }),
    ev({
        id: "m2",
        event_kind: "room_transfer",
        from_room_location_id: TOD2,
        to_room_location_id: PLAY,
        event_at: "2026-09-09T15:30:00.000Z",
    }),
];

describe("the old alphabetical derivation was wrong", () => {
    it("demonstrates the defect: sorted-set-last disagrees with the timeline", () => {
        const [day] = summarizeAttendanceByDay(ENDS_ON_PLAYGROUND);
        const alphabeticallyLast = day.roomsObserved[day.roomsObserved.length - 1];

        // What the roster used to show:
        expect(alphabeticallyLast).toBe(TOD2);
        // Where the child actually is:
        expect(whereaboutsAt(ENDS_ON_PLAYGROUND, "2026-09-09T16:00:00.000Z")?.locationId).toBe(PLAY);
        // The two disagree — that disagreement is the bug.
        expect(alphabeticallyLast).not.toBe(PLAY);
    });
});

describe("resolveCurrentWhereabouts — the roster's single source", () => {
    it("reports the last place the child actually went", () => {
        const w = resolveCurrentWhereabouts(ENDS_ON_PLAYGROUND, "2026-09-09T16:00:00.000Z");
        expect(w.state).toBe("present");
        expect(w.locationId).toBe(PLAY);
    });

    it("agrees with the certified Thread 2 fold, by construction", () => {
        const at = "2026-09-09T16:00:00.000Z";
        expect(resolveCurrentWhereabouts(ENDS_ON_PLAYGROUND, at).locationId).toBe(
            whereaboutsAt(ENDS_ON_PLAYGROUND, at)?.locationId
        );
    });

    it("still reads the simple case correctly", () => {
        const simple = [ev({ id: "s1", event_kind: "check_in", room_location_id: TOD1 })];
        const w = resolveCurrentWhereabouts(simple, "2026-09-09T09:00:00.000Z");
        expect(w.locationId).toBe(TOD1);
        expect(w.state).toBe("present");
    });

    it("clears the location on check-out rather than stranding the child in a room", () => {
        const departed = [
            ...ENDS_ON_PLAYGROUND,
            ev({ id: "out", event_kind: "check_out", event_at: "2026-09-09T17:00:00.000Z" }),
        ];
        const w = resolveCurrentWhereabouts(departed, "2026-09-09T18:00:00.000Z");
        expect(w.state).toBe("checked_out");
        expect(w.locationId).toBeNull();
    });

    it("reports a child with no facts as not arrived, holding no room", () => {
        const w = resolveCurrentWhereabouts([], "2026-09-09T09:00:00.000Z");
        expect(w.state).toBe("not_arrived");
        expect(w.locationId).toBeNull();
    });

    it("reports absence without a location", () => {
        const absent = [ev({ id: "a", event_kind: "absence", reason_key: "illness" })];
        const w = resolveCurrentWhereabouts(absent, "2026-09-09T09:00:00.000Z");
        expect(w.state).toBe("absent");
        expect(w.locationId).toBeNull();
    });

    it("honours a correction — a reversed move does not strand the child", () => {
        const corrected = [
            ...ENDS_ON_PLAYGROUND,
            ev({
                id: "rev",
                event_kind: "room_transfer",
                entry_type: "reversal",
                corrects_event_id: "m2",
                from_room_location_id: TOD2,
                to_room_location_id: PLAY,
                event_at: "2026-09-09T15:35:00.000Z",
            }),
        ];
        // The playground move never happened, so she is still in Toddler 2.
        expect(resolveCurrentWhereabouts(corrected, "2026-09-09T16:00:00.000Z").locationId).toBe(TOD2);
    });
});

describe("placement is not whereabouts", () => {
    it("movement changes where she is and says nothing about where she belongs", () => {
        // The roster carries the committed placement room separately; this fold
        // never reads or returns it, which is what keeps the two truths distinct.
        const w = resolveCurrentWhereabouts(ENDS_ON_PLAYGROUND, "2026-09-09T16:00:00.000Z");
        expect(w.locationId).toBe(PLAY);
        expect(Object.keys(w)).not.toContain("placementRoomLocationId");
    });
});
