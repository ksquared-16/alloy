/**
 * The whole-day answer, derived from the segmented one.
 *
 * The point of these tests is not that two numbers agree — it is that where they
 * disagree, the disagreement is named. A parity suite that only asserts equality
 * passes on the day someone silently drops the unknown-hours case.
 */
import { describe, expect, it } from "vitest";

import type { ScheduledStaffMember, StaffSupplyCell } from "@/lib/scheduling/supply/buildStaffSupply";
import { buildStaffingProjectionDay } from "@/lib/staffingProjection/buildStaffingProjection";
import { toInterval } from "@/lib/staffingProjection/staffingSegments";
import {
    compareWholeDaySupply,
    wholeDayFromProjection,
} from "@/lib/staffingProjection/wholeDayConvergence";

const ORG = "org-1";
const SITE = "site-1";
const T1 = "room-1";
const T2 = "room-2";
const DATE = "2027-05-03";

function iv(a: string, b: string) {
    return toInterval(a, b)!;
}

function member(name: string, room: string | null): ScheduledStaffMember {
    return {
        assignmentId: `asg-${name}`,
        personId: `per-${name}`,
        displayName: name,
        positionLabel: null,
        employmentId: `emp-${name}`,
        siteLocationId: SITE,
        roomLocationId: room,
        roomName: null,
        weekdays: [1],
        timeLabel: null,
        effectiveFrom: DATE,
        effectiveTo: null,
        isPrimary: true,
        status: "active",
    };
}

function legacyCell(room: string | null, members: ScheduledStaffMember[]): StaffSupplyCell {
    return {
        date: DATE,
        weekday: 1,
        roomLocationId: room,
        scheduledStaffCount: members.length,
        scheduledStaff: members,
    };
}

function projStaff(name: string, room: string | null, hours: [string, string] | null, coverage = [] as { roomLocationId: string | null; interval: ReturnType<typeof iv> }[]) {
    return {
        employmentId: `emp-${name}`,
        personId: `per-${name}`,
        displayName: name,
        assignmentId: `asg-${name}`,
        baselineRoomLocationId: room,
        baselineIntervals: hours ? [iv(hours[0], hours[1])] : [],
        baselineHoursKnown: Boolean(hours),
        availabilityIntervals: [],
        coverage,
        presence: null,
    };
}

function projection(staff: ReturnType<typeof projStaff>[]) {
    return buildStaffingProjectionDay({
        orgId: ORG,
        siteLocationId: SITE,
        date: DATE,
        children: [],
        childActuals: [],
        staff,
        requiredStaffFor: () => ({ requiredStaff: 0, exceedsDefinedTiers: false }),
        roomNameById: new Map(),
        actualsObserved: false,
    });
}

describe("whole-day convergence", () => {
    it("reduces to exactly the people the supply reading names", () => {
        const day = projection([
            projStaff("Alex", T1, ["08:00", "16:00"]),
            projStaff("Sam", T2, ["08:00", "16:00"]),
        ]);
        const parity = compareWholeDaySupply(
            [legacyCell(T1, [member("Alex", T1)]), legacyCell(T2, [member("Sam", T2)])],
            wholeDayFromProjection(day),
            DATE
        );
        expect(parity.onlyInWholeDay).toEqual([]);
        expect(parity.onlyInProjection).toEqual([]);
        expect(parity.matchingRooms).toEqual([T1, T2]);
    });

    it("names the unknown-hours person rather than dropping them silently", () => {
        const day = projection([projStaff("Alex", T1, ["08:00", "16:00"]), projStaff("Sam", T1, null)]);
        const parity = compareWholeDaySupply(
            [legacyCell(T1, [member("Alex", T1), member("Sam", T1)])],
            wholeDayFromProjection(day),
            DATE
        );
        expect(parity.onlyInWholeDay).toEqual([{ roomLocationId: T1, personIds: ["per-Sam"] }]);
        expect(parity.onlyInProjection).toEqual([]);
        expect(day.unknowns).toContainEqual({
            code: "assignment_hours_unknown",
            assignmentId: "asg-Sam",
            personId: "per-Sam",
        });
    });

    it("places a covered person where Coverage put them, which the old reading could not say", () => {
        const day = projection([
            projStaff("Alex", T1, ["08:00", "16:00"], [
                { roomLocationId: T2, interval: iv("12:00", "16:00") },
            ]),
        ]);
        const reduced = wholeDayFromProjection(day);
        expect(reduced.map((c) => c.roomLocationId).sort()).toEqual([T1, T2]);

        const parity = compareWholeDaySupply([legacyCell(T1, [member("Alex", T1)])], reduced, DATE);
        // The whole-day reading has Alex only in room 1; the projection also has
        // the afternoon in room 2. That is the Coverage fact, reported as a
        // difference rather than hidden by either reading.
        expect(parity.onlyInProjection).toEqual([{ roomLocationId: T2, personIds: ["per-Alex"] }]);
        expect(parity.onlyInWholeDay).toEqual([]);
    });

    it("counts one employment once per room even across many segments", () => {
        const day = projection([
            projStaff("Alex", T1, ["08:00", "16:00"], [
                { roomLocationId: T1, interval: iv("10:00", "11:00") },
            ]),
        ]);
        const reduced = wholeDayFromProjection(day);
        expect(reduced).toHaveLength(1);
        expect(reduced[0].scheduledStaffCount).toBe(1);
    });
});
