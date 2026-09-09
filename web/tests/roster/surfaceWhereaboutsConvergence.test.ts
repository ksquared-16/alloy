/**
 * The Workspace and the Focus Panel must never disagree about where a child is.
 *
 * They still reach the answer by different code: the Workspace roster goes
 * through `resolveCurrentWhereabouts` → the certified `whereaboutsAt` fold, and
 * the Focus Panel goes through `buildChildAttendanceReadModel` →
 * `deriveCurrentPresence`. Both walk the day in time order, so they agree today.
 *
 * Two implementations that agree today are still two implementations, and the
 * laxer one is the one that eventually drifts. Collapsing them is accepted Thread
 * 8 cleanup; until then this test is the thing that would catch the drift, so it
 * compares them on the scenarios where a naive implementation goes wrong rather
 * than on the easy path.
 */

import { describe, expect, it } from "vitest";
import { buildChildAttendanceReadModel } from "@/lib/childcareOperational/attendance/childAttendanceReadModel";
import { resolveCurrentWhereabouts } from "@/lib/roster/resolveCurrentWhereabouts";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

const DATE = "2026-09-09";
const TOD1 = "b-toddler-1";
const TOD2 = "c-toddler-2";
const PLAY = "a-playground"; // sorts first — breaks alphabetical implementations

let seq = 0;
function ev(over: Partial<ChildAttendanceEventRow>): ChildAttendanceEventRow {
    seq += 1;
    return {
        id: `e${seq}`,
        org_id: "org",
        enrollment_agreement_id: "agr-1",
        customer_member_id: "child-1",
        site_location_id: "site",
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

const move = (id: string, from: string, to: string, at: string) =>
    ev({ id, event_kind: "room_transfer", from_room_location_id: from, to_room_location_id: to, event_at: `${DATE}T${at}:00.000Z` });

/** What each surface would show, from the same facts. */
function bothSurfaces(events: ChildAttendanceEventRow[]) {
    const workspace = resolveCurrentWhereabouts(events, `${DATE}T23:59:59.999Z`);
    const focusPanel = buildChildAttendanceReadModel({
        events,
        expectedAttendance: [],
        asOfDate: DATE,
    }).currentPresenceState;
    return { workspace, focusPanel };
}

const CASES: [string, ChildAttendanceEventRow[], string | null, string][] = [
    [
        "ends the day on the playground (alphabetically first)",
        [
            ev({ id: "in", room_location_id: TOD1 }),
            move("m1", TOD1, TOD2, "10:00"),
            move("m2", TOD2, PLAY, "15:30"),
        ],
        PLAY,
        "present",
    ],
    [
        "ends the day in the last classroom",
        [ev({ id: "in2", room_location_id: TOD1 }), move("m3", TOD1, TOD2, "11:00")],
        TOD2,
        "present",
    ],
    [
        "never moved",
        [ev({ id: "in3", room_location_id: TOD1 })],
        TOD1,
        "present",
    ],
    [
        "checked out after moving",
        [
            ev({ id: "in4", room_location_id: TOD1 }),
            move("m4", TOD1, PLAY, "10:00"),
            ev({ id: "out", event_kind: "check_out", event_at: `${DATE}T17:00:00.000Z` }),
        ],
        null,
        "checked_out",
    ],
    [
        "absent",
        [ev({ id: "abs", event_kind: "absence", reason_key: "illness" })],
        null,
        "absent",
    ],
];

describe("Workspace and Focus Panel agree on current whereabouts", () => {
    for (const [name, events, expectedRoom, expectedState] of CASES) {
        it(`${name} — both surfaces say the same thing`, () => {
            const { workspace, focusPanel } = bothSurfaces(events);

            expect(workspace.locationId).toBe(expectedRoom);
            expect(focusPanel.roomLocationId).toBe(expectedRoom);
            expect(workspace.locationId).toBe(focusPanel.roomLocationId);

            expect(workspace.state).toBe(expectedState);
            // The fact layer calls departure `checked_out` here too; the states
            // are compared directly so a rename on either side fails loudly.
            expect(focusPanel.state).toBe(expectedState);
        });
    }

    it("agrees after a correction rewrites the past", () => {
        const events = [
            ev({ id: "in5", room_location_id: TOD1 }),
            move("m5", TOD1, PLAY, "10:00"),
            ev({
                id: "rev",
                event_kind: "room_transfer",
                entry_type: "reversal",
                corrects_event_id: "m5",
                from_room_location_id: TOD1,
                to_room_location_id: PLAY,
                event_at: `${DATE}T10:05:00.000Z`,
            }),
        ];
        const { workspace, focusPanel } = bothSurfaces(events);
        // The move never happened; she is still in her classroom.
        expect(workspace.locationId).toBe(TOD1);
        expect(focusPanel.roomLocationId).toBe(TOD1);
    });

    it("agrees that a child with no facts is nowhere", () => {
        const { workspace, focusPanel } = bothSurfaces([]);
        expect(workspace.locationId).toBeNull();
        expect(focusPanel.roomLocationId).toBeNull();
    });
});
