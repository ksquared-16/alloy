/**
 * The Calendar's geometry, and the line it must not cross.
 *
 * Layout is testable without a browser and worth testing there: the failure that
 * matters is not a misplaced pixel, it is a short fifteen-minute stretch rendered
 * the same width as a four-hour block, which is how a surface hides the thing it
 * was built to show.
 */
import { describe, expect, it } from "vitest";

import {
    buildCalendarLanes,
    candidatesForGap,
    gapCommandContext,
    hourTicks,
    operatingWindow,
    percentSpan,
} from "@/lib/staffingProjection/calendarLayout";
import { buildStaffingProjectionDay } from "@/lib/staffingProjection/buildStaffingProjection";
import { toInterval } from "@/lib/staffingProjection/staffingSegments";

const SITE = "site-1";
const T1 = "room-1";
const T2 = "room-2";
const DATE = "2027-05-03";

const iv = (a: string, b: string) => toInterval(a, b)!;

function child(id: string, room: string | null, a: string, b: string) {
    return {
        customerMemberId: id,
        agreementId: `agr-${id}`,
        assignmentId: `asg-${id}`,
        roomLocationId: room,
        intervals: [iv(a, b)],
        hoursKnown: true,
    };
}

function staff(name: string, room: string | null, hours: [string, string] | null, extra = {}) {
    return {
        employmentId: `emp-${name}`,
        personId: `per-${name}`,
        displayName: name,
        assignmentId: `asg-${name}`,
        baselineRoomLocationId: room,
        baselineIntervals: hours ? [iv(hours[0], hours[1])] : [],
        baselineHoursKnown: Boolean(hours),
        availabilityIntervals: [],
        coverage: [] as { roomLocationId: string | null; interval: ReturnType<typeof iv> }[],
        presence: null,
        ...extra,
    };
}

type DayInput = Parameters<typeof buildStaffingProjectionDay>[0];

function day(over: Partial<DayInput> = {}) {
    return buildStaffingProjectionDay({
        orgId: "org-1",
        siteLocationId: SITE,
        date: DATE,
        children: [],
        childActuals: [],
        staff: [],
        requiredStaffFor: (_room, n) => ({ requiredStaff: Math.ceil(n / 4), exceedsDefinedTiers: false }),
        roomNameById: new Map([[T1, "Toddler 1"], [T2, "Toddler 2"]]),
        actualsObserved: true,
        ...over,
    });
}

describe("operating window", () => {
    it("spans the facts, not the clock", () => {
        const d = day({
            children: [child("c1", T1, "08:30", "16:00")],
            staff: [staff("Alex", T1, ["08:00", "16:30"])],
        });
        expect(operatingWindow(d.segments)).toEqual({ start: "08:00", end: "16:30" });
    });

    it("is null when nothing is asserted", () => {
        expect(operatingWindow([])).toBeNull();
    });
});

describe("segment geometry", () => {
    const window = { start: "08:00", end: "16:00" } as const;

    it("keeps a short stretch visibly short", () => {
        const quarter = percentSpan(window, { start: "09:00", end: "09:15" });
        const fourHours = percentSpan(window, { start: "10:00", end: "14:00" });
        expect(quarter.widthPct).toBeCloseTo(3.125, 3);
        expect(fourHours.widthPct).toBeCloseTo(50, 3);
        expect(fourHours.widthPct).toBeGreaterThan(quarter.widthPct * 10);
    });

    it("does not snap a boundary to a rendering grid", () => {
        // 08:37 is not a half-hour, and the strip must not pretend it is.
        const odd = percentSpan(window, { start: "08:37", end: "09:00" });
        expect(odd.leftPct).toBeCloseTo((37 / 480) * 100, 5);
    });

    it("places the first block at the left edge and the last at the right", () => {
        expect(percentSpan(window, { start: "08:00", end: "09:00" }).leftPct).toBe(0);
        const last = percentSpan(window, { start: "15:00", end: "16:00" });
        expect(last.leftPct + last.widthPct).toBeCloseTo(100, 5);
    });

    it("gives an hour scale inside the window only", () => {
        expect(hourTicks({ start: "08:30", end: "11:30" })).toEqual(["09:00", "10:00", "11:00"]);
    });
});

describe("lanes", () => {
    it("rolls a lane up with the certified rule, not its own", () => {
        const d = day({
            children: [
                ...Array.from({ length: 10 }, (_, i) => child(`m${i}`, T1, "09:00", "10:00")),
                child("q1", T1, "10:00", "12:00"),
            ],
            staff: [staff("Alex", T1, ["09:00", "12:00"]), staff("Sam", T1, ["09:00", "12:00"])],
        });
        const [lane] = buildCalendarLanes(d.segments).filter((l) => l.roomLocationId === T1);
        // One short segment makes the lane short, even though the later one is fine.
        expect(lane.state).toBe("short");
        expect(lane.gapSegments).toHaveLength(1);
        expect(lane.gapSegments[0].start).toBe("09:00");
    });

    it("reports peaks without inventing a verdict from them", () => {
        const d = day({
            children: [child("c1", T1, "08:00", "12:00"), child("c2", T1, "09:00", "10:00")],
            staff: [staff("Alex", T1, ["08:00", "12:00"])],
        });
        const [lane] = buildCalendarLanes(d.segments).filter((l) => l.roomLocationId === T1);
        expect(lane.expectedChildrenPeak).toBe(2);
        expect(lane.plannedStaffPeak).toBe(1);
        expect(lane.requiredStaffPeak).toBe(1);
    });

    it("puts rooms needing attention first and the site lane last", () => {
        const d = day({
            children: Array.from({ length: 10 }, (_, i) => child(`c${i}`, T2, "09:00", "10:00")),
            staff: [
                staff("Alex", T1, ["09:00", "10:00"]),
                staff("Sam", T2, ["09:00", "10:00"]),
                staff("Site", null, ["09:00", "10:00"]),
            ],
        });
        const lanes = buildCalendarLanes(d.segments);
        expect(lanes[0].roomLocationId).toBe(T2);
        expect(lanes[0].state).toBe("short");
        expect(lanes[lanes.length - 1].roomLocationId).toBeNull();
    });

    it("says unknown at the lane level when a requirement could not resolve", () => {
        const d = day({
            children: [child("c1", T1, "09:00", "10:00")],
            staff: [staff("Alex", T1, ["09:00", "10:00"])],
            requiredStaffFor: (_r, n) => ({ requiredStaff: 0, exceedsDefinedTiers: n > 0 }),
        });
        const [lane] = buildCalendarLanes(d.segments).filter((l) => l.roomLocationId === T1);
        expect(lane.state).toBe("unknown");
        expect(lane.hasUnknown).toBe(true);
        expect(lane.requiredStaffPeak).toBeNull();
    });
});

describe("the gap hands the command its context", () => {
    const d = day({
        children: Array.from({ length: 10 }, (_, i) => child(`c${i}`, T1, "09:00", "10:00")),
        staff: [
            staff("Alex", T1, ["09:00", "10:00"]),
            staff("Sam", T1, ["09:00", "10:00"]),
            staff("Jordan", null, null, { availabilityIntervals: [iv("09:00", "10:00")] }),
        ],
    });
    const gap = d.segments.find((s) => s.roomLocationId === T1 && s.plannedState === "short")!;

    it("carries site, room, date, interval and shortfall", () => {
        expect(gapCommandContext(gap)).toEqual({
            siteLocationId: SITE,
            roomLocationId: T1,
            date: DATE,
            startTime: "09:00",
            endTime: "10:00",
            shortfall: 1,
        });
    });

    it("gives no context for a segment that is not short", () => {
        const fine = d.segments.find((s) => s.plannedState !== "short");
        expect(fine ? gapCommandContext(fine) : null).toBeNull();
    });

    it("offers only people free in that interval, and ranks nobody", () => {
        expect(candidatesForGap(gap, d.segments)).toEqual([
            { employmentId: "emp-Jordan", personId: "per-Jordan", displayName: "Jordan" },
        ]);
    });

    it("does not offer someone already planned in another room at that time", () => {
        const busy = day({
            children: Array.from({ length: 10 }, (_, i) => child(`c${i}`, T1, "09:00", "10:00")),
            staff: [
                staff("Alex", T1, ["09:00", "10:00"]),
                staff("Sam", T2, ["09:00", "10:00"], { availabilityIntervals: [iv("09:00", "10:00")] }),
            ],
        });
        const short = busy.segments.find((s) => s.roomLocationId === T1 && s.plannedState === "short")!;
        expect(candidatesForGap(short, busy.segments)).toEqual([]);
    });
});
