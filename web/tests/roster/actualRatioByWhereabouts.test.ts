/**
 * V7 Package 1 — 1B (audit K1): a room's ACTUAL ratio counts the children standing in it.
 *
 * `presentChildRoom` is the one rule the roster's actual staffing and the Attendance overview's
 * "here now" share: a present child counts where the whereabouts fold puts them, or — when the fold
 * names no room — where they are expected. Roster presence ("is my class here") is unchanged.
 */
import { describe, expect, it } from "vitest";

import { presentChildRoom } from "@/lib/roster/dailyOperatingState";
import { buildAttendanceOverviewModel } from "@/lib/roster/attendanceOverviewModel";

describe("presentChildRoom", () => {
    it("a child moved to the gym counts in the gym, not in her classroom", () => {
        expect(presentChildRoom({ state: "present", actualRoomLocationId: "GYM" }, "T1")).toBe("GYM");
    });
    it("present with no recorded room: her expected room", () => {
        expect(presentChildRoom({ state: "present", actualRoomLocationId: null }, "T1")).toBe("T1");
    });
    it("checked out, absent, not arrived: nowhere", () => {
        for (const state of ["checked_out", "absent", "no_record"]) {
            expect(presentChildRoom({ state, actualRoomLocationId: "T1" }, "T1")).toBeNull();
        }
    });
});

describe("the Attendance overview reads the same rule", () => {
    it("here-now by room follows whereabouts; the moved child is listed away from her placement", () => {
        const child = (id: string, state: "present" | "checked_out" | "absent" | "no_record", at: string | null) => ({
            customerMemberId: id, displayName: id, actual: { state, actualRoomLocationId: at },
        });
        const overview = buildAttendanceOverviewModel(
            [
                { roomLocationId: "T1", roomName: "Toddler 1", children: [child("a", "present", "T1"), child("b", "present", "GYM"), child("c", "absent", null), child("d", "present", null)] },
                { roomLocationId: "GYM", roomName: "Gym", children: [] },
            ] as never,
        );
        expect(overview.hereNowByRoom.get("T1")).toBe(2);
        expect(overview.hereNowByRoom.get("GYM")).toBe(1);
        expect(overview.awayFromPlacement.map((x) => x.customerMemberId)).toEqual(["b"]);
    });
});
