/**
 * The Workspace and the Focus Panel must never disagree about where a child is.
 *
 * They no longer can. Thread 8 collapsed the two implementations: both surfaces
 * now reach the answer through the certified `whereaboutsAt` fold — the Workspace
 * via `resolveCurrentWhereabouts`, the Focus Panel via
 * `buildChildAttendanceReadModel` → `deriveCurrentPresence`, which is now a
 * translation of the fold's answer rather than a second reconstruction of it.
 *
 * Before that, the Focus Panel counted check-ins against check-outs for the day.
 * Counting has no opinion about ORDER, which is why it was the laxer of the two
 * and the one that would eventually drift. The ORDER cases below are the days
 * where it actually gave a different answer from the Workspace; they are the
 * regression guard for the collapse, and they fail against the counting
 * implementation.
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

    /**
     * ORDER CASES — each of these produced a DIFFERENT answer on the two surfaces
     * while the Focus Panel counted instead of folding. They are the evidence that
     * the collapse changed behaviour rather than merely moving code.
     */
    describe("the last effective fact wins, on both surfaces", () => {
        it("a day that ends in an absence is absent, not present", () => {
            // Counting saw checkIns(1) > checkOuts(0) and said `present`, ignoring
            // that the later fact retracted the arrival.
            const events = [
                ev({ id: "in6", room_location_id: TOD1 }),
                ev({
                    id: "abs2",
                    event_kind: "absence",
                    reason_key: "illness",
                    event_at: `${DATE}T09:00:00.000Z`,
                }),
            ];
            const { workspace, focusPanel } = bothSurfaces(events);
            expect(workspace.state).toBe("absent");
            expect(focusPanel.state).toBe("absent");
            expect(focusPanel.roomLocationId).toBeNull();
        });

        it("a re-entry after checkout is present, not checked out", () => {
            // Counting saw checkIns(1) === checkOuts(1) and said `checked_out`
            // while the child was standing in a room.
            const events = [
                ev({ id: "out2", event_kind: "check_out", event_at: `${DATE}T12:00:00.000Z` }),
                ev({ id: "in7", room_location_id: PLAY, event_at: `${DATE}T13:00:00.000Z` }),
            ];
            const { workspace, focusPanel } = bothSurfaces(events);
            expect(workspace.state).toBe("present");
            expect(focusPanel.state).toBe("present");
            expect(workspace.locationId).toBe(PLAY);
            expect(focusPanel.roomLocationId).toBe(PLAY);
        });

        it("an absence recorded after a checkout is absent, not checked out", () => {
            const events = [
                ev({ id: "in8", room_location_id: TOD1 }),
                ev({ id: "out3", event_kind: "check_out", event_at: `${DATE}T11:00:00.000Z` }),
                ev({
                    id: "abs3",
                    event_kind: "absence",
                    reason_key: "illness",
                    event_at: `${DATE}T11:30:00.000Z`,
                }),
            ];
            const { workspace, focusPanel } = bothSurfaces(events);
            expect(workspace.state).toBe("absent");
            expect(focusPanel.state).toBe("absent");
        });
    });

    it("does not let an earlier day leak into this one", () => {
        // Day scope is the Focus Panel's own question ("how did this day end"),
        // and the fold must not answer it with yesterday's un-closed check-in.
        const events = [
            ev({
                id: "yesterday",
                room_location_id: TOD1,
                service_date: "2026-09-08",
                event_at: "2026-09-08T08:00:00.000Z",
            }),
        ];
        const focusPanel = buildChildAttendanceReadModel({
            events,
            expectedAttendance: [],
            asOfDate: DATE,
        }).currentPresenceState;
        expect(focusPanel.state).toBe("no_record");
        expect(focusPanel.roomLocationId).toBeNull();
    });

    it("agrees that a child with no facts is nowhere", () => {
        const { workspace, focusPanel } = bothSurfaces([]);
        expect(workspace.locationId).toBeNull();
        expect(focusPanel.roomLocationId).toBeNull();
    });
});
