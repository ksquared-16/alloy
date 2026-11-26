/**
 * V7 S6 — PER-SESSION EXPECTED ATTENDANCE (Director, 2026-10-25).
 *
 * The primary and every committed secondary whose category expects attendance produce expectations,
 * each in its own space, on its own effective dates and weekdays. A child counts once per room per
 * date and once per site per date; interval demand counts a child once per room × segment; sessions in
 * different spaces stay distinct. Expected attendance never records presence, and nothing here reads
 * or writes pricing, accepted terms or attendance facts.
 *
 * One test per Director-listed scenario, numbered as in the instruction.
 */
import { describe, expect, it } from "vitest";

import {
    aggregateExpectedOccupancyByRoomDate,
    expandExpectedAttendance,
    primaryEntryFor,
    type OperationalAgreementInput,
    type OperationalAssignmentInput,
    type OperationalPlacementInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { selectQualifyingSessions } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { diffExpectedVsActual } from "@/lib/childcareOperational/attendance/expectedVsActual";
import { buildAttendanceOverviewModel, type OverviewCell } from "@/lib/roster/attendanceOverviewModel";
import { buildStaffingProjectionDay } from "@/lib/staffingProjection/buildStaffingProjection";
import { toInterval } from "@/lib/staffingProjection/staffingSegments";

const HOME = "room-home";
const HOME2 = "room-home-2";
const GYM = "room-gym";
const BEFORE = "type-before-care";
const ENRICH = "type-enrichment";
const TRANSPORT = "type-transport"; // attendance_participation = none
const EXPECTED_TYPES = new Set([BEFORE, ENRICH, "type-homeroom"]);

const MF = { id: "pat-mf", weekdays: [1, 2, 3, 4, 5], schedule_type_key: "full_day" };
const TTH = { id: "pat-tth", weekdays: [2, 4], schedule_type_key: "part_time" };
const MWF = { id: "pat-mwf", weekdays: [1, 3, 5], schedule_type_key: "part_time" };
const patternsById = new Map([MF, TTH, MWF].map((p) => [p.id, p]));

const agreement: OperationalAgreementInput = {
    id: "ag", customer_member_id: "ada", site_location_id: "site", start_date: "2026-01-05", end_date: null, status: "active",
};
const placement: OperationalPlacementInput = {
    enrollment_agreement_id: "ag", room_location_id: HOME, program_category_id: "prog", start_date: "2026-01-05", end_date: null, status: "active",
};
const primary = (over: Partial<OperationalAssignmentInput> = {}): OperationalAssignmentInput => ({
    id: "p", enrollment_agreement_id: "ag", schedule_pattern_id: MF.id, start_date: "2026-01-05", end_date: null, status: "active", ...over,
});
const secondary = (id: string, room: string | null, pattern: { id: string }, over: Partial<OperationalAssignmentInput> = {}): OperationalAssignmentInput => ({
    id, enrollment_agreement_id: "ag", schedule_pattern_id: pattern.id, start_date: "2026-01-05", end_date: null, status: "active",
    is_primary: false, room_location_id: room, ...over,
});

// Mon 2026-11-16 … Fri 2026-11-20
const WEEK = { dateStart: "2026-11-16", dateEnd: "2026-11-20" };
const expand = (assignments: OperationalAssignmentInput[], extra: Partial<Parameters<typeof expandExpectedAttendance>[0]> = {}) =>
    expandExpectedAttendance({ ...WEEK, agreements: [agreement], placements: [placement], assignments, patternsById, ...extra });
const on = (entries: ReturnType<typeof expand>, date: string) => entries.filter((e) => e.date === date);
const occupancy = (entries: ReturnType<typeof expand>, room: string, date: string) =>
    aggregateExpectedOccupancyByRoomDate(entries).find((o) => o.roomLocationId === room && o.date === date)?.childCount ?? 0;

describe("V7 S6 — per-session expected attendance", () => {
    it("1 · primary-only compatibility: rows without a primary flag are the primary, unchanged", () => {
        const entries = expand([primary()]);
        expect(entries).toHaveLength(5);
        expect(entries.every((e) => e.isPrimary && e.roomLocationId === HOME && e.assignmentId === "p")).toBe(true);
        expect(occupancy(entries, HOME, "2026-11-16")).toBe(1);
    });

    it("2 · a secondary whose category expects attendance is expected in its own space", () => {
        const rows = selectQualifyingSessions(
            [{ ...primary(), is_primary: true }, { ...secondary("bc", GYM, TTH), operational_assignment_type_id: BEFORE }],
            EXPECTED_TYPES,
        );
        const tue = on(expand(rows), "2026-11-17");
        expect(tue.map((e) => [e.roomLocationId, e.isPrimary])).toEqual([[HOME, true], [GYM, false]]);
    });

    it("3 · a secondary whose category does not expect attendance produces nothing; nor does a secondary with no primary", () => {
        const rows = selectQualifyingSessions(
            [{ ...primary(), is_primary: true }, { ...secondary("tr", GYM, TTH), operational_assignment_type_id: TRANSPORT }],
            EXPECTED_TYPES,
        );
        expect(rows.map((r) => r.id)).toEqual(["p"]);
        expect(selectQualifyingSessions([{ ...secondary("bc", GYM, TTH), operational_assignment_type_id: BEFORE }], EXPECTED_TYPES)).toEqual([]);
        expect(selectQualifyingSessions([{ ...secondary("x", GYM, TTH), operational_assignment_type_id: null }, { ...primary(), is_primary: true }], EXPECTED_TYPES).map((r) => r.id)).toEqual(["p"]);
    });

    it("4 · Before Care plus Homeroom: both rooms carry the child; the site counts her once", () => {
        const entries = expand([primary(), secondary("bc", HOME2, MF)]);
        expect(occupancy(entries, HOME, "2026-11-16")).toBe(1);
        expect(occupancy(entries, HOME2, "2026-11-16")).toBe(1);
        expect(new Set(on(entries, "2026-11-16").map((e) => e.customerMemberId)).size).toBe(1);
    });

    it("5 · Homeroom plus Enrichment in a shared space: distinct spaces, distinct demand", () => {
        const entries = expand([primary(), secondary("en", GYM, MWF)]);
        expect(on(entries, "2026-11-18").map((e) => e.roomLocationId).sort()).toEqual([GYM, HOME].sort());
        expect(on(entries, "2026-11-17").map((e) => e.roomLocationId)).toEqual([HOME]); // Tue: no enrichment
    });

    it("6 · two homerooms: a homeroom-category secondary in a second classroom is expected there too", () => {
        const entries = expand([primary(), secondary("h2", HOME2, TTH)]);
        expect(occupancy(entries, HOME, "2026-11-19")).toBe(1);
        expect(occupancy(entries, HOME2, "2026-11-19")).toBe(1);
        expect(occupancy(entries, HOME2, "2026-11-18")).toBe(0);
    });

    it("7 · different-day sessions follow each session's own week (Assignment Time beats pattern)", () => {
        const entries = expand([primary({ schedule_pattern_id: MWF.id }), secondary("tt", HOME2, MF)], {
            weekdaysByAssignmentId: new Map([["tt", [2, 4]]]),
        });
        expect(entries.filter((e) => e.isPrimary).map((e) => e.weekday)).toEqual([1, 3, 5]);
        expect(entries.filter((e) => !e.isPrimary).map((e) => e.weekday)).toEqual([2, 4]);
    });

    it("8 · same-day non-overlapping sessions in one room: one child in that room that day", () => {
        const entries = expand([primary(), secondary("ac", HOME, MF)]);
        expect(on(entries, "2026-11-16")).toHaveLength(2);
        expect(occupancy(entries, HOME, "2026-11-16")).toBe(1);
    });

    it("9 · same-day overlapping sessions: interval demand counts the child once per room × segment, and in each room she is in", () => {
        const iv = (s: string, e: string) => toInterval(s, e)!;
        const child = (assignmentId: string, room: string, s: string, e: string) => ({
            customerMemberId: "ada", agreementId: "ag", assignmentId, roomLocationId: room, intervals: [iv(s, e)], hoursKnown: true,
        });
        const d = buildStaffingProjectionDay({
            orgId: "org", siteLocationId: "site", date: "2026-11-16",
            children: [child("p", HOME, "08:00", "15:00"), child("ac", HOME, "14:00", "17:00"), child("gym", GYM, "15:00", "16:00")],
            childActuals: [], staff: [],
            requiredStaffFor: (_r: string | null, n: number) => ({ requiredStaff: Math.ceil(n / 4), exceedsDefinedTiers: false }),
            roomNameById: new Map([[HOME, "Home"], [GYM, "Gym"]]),
            actualsObserved: false,
        });
        const seg = (room: string, start: string) => d.segments.find((s) => s.roomLocationId === room && s.start === start);
        expect(seg(HOME, "14:00")?.expectedChildCount).toBe(1); // overlap 14:00–15:00: one child, not two
        expect(seg(GYM, "15:00")?.expectedChildCount).toBe(1);  // a session in another room still counts there
    });

    it("10 · per-room and per-site dedupe: overview, exceptions source and expected-vs-actual count one child", () => {
        const cells: OverviewCell[] = [
            { roomLocationId: HOME, roomName: "Home", children: [{ customerMemberId: "ada", displayName: "Ada", actual: { state: "no_record", actualRoomLocationId: null } }] },
            { roomLocationId: GYM, roomName: "Gym", children: [{ customerMemberId: "ada", displayName: "Ada", actual: { state: "no_record", actualRoomLocationId: null } }] },
        ];
        const m = buildAttendanceOverviewModel(cells);
        expect(m.counts.expected).toBe(1);
        expect(m.counts.notArrived).toBe(1);

        const present: OverviewCell[] = cells.map((c) => ({ ...c, children: c.children.map((k) => ({ ...k, actual: { state: "present" as const, actualRoomLocationId: GYM } })) }));
        const p = buildAttendanceOverviewModel(present);
        expect(p.counts.present).toBe(1);
        expect(p.hereNowByRoom.get(GYM)).toBe(1);
        expect(p.awayFromPlacement).toEqual([]); // in a space that expects her: not "away"

        const expected = on(expand([primary(), secondary("en", GYM, MF)]), "2026-11-16");
        const vs = diffExpectedVsActual(expected, [
            { enrollmentAgreementId: "ag", customerMemberId: "ada", serviceDate: "2026-11-16", present: true, absent: false, checkInCount: 1, missingCheckout: false, roomsObserved: [GYM] } as never,
        ]);
        expect(vs.expectedCount).toBe(1);
        expect(vs.matchedCount).toBe(1);
        expect(vs.variances.filter((v) => v.code === "room_mismatch")).toEqual([]);
    });

    it("11 · current, upcoming and historical: a replaced secondary is one session over time", () => {
        const before = secondary("bc1", GYM, MF, { start_date: "2026-01-05", end_date: "2026-11-17", status: "superseded" });
        const after = secondary("bc2", HOME2, MF, { start_date: "2026-11-18", supersedes_assignment_id: "bc1", status: "planned" });
        const entries = expand([primary(), before, after]);
        const secondaries = entries.filter((e) => !e.isPrimary);
        expect(secondaries.map((e) => [e.date, e.roomLocationId])).toEqual([
            ["2026-11-16", GYM], ["2026-11-17", GYM], ["2026-11-18", HOME2], ["2026-11-19", HOME2], ["2026-11-20", HOME2],
        ]);
        const history = expandExpectedAttendance({ dateStart: "2026-03-02", dateEnd: "2026-03-02", agreements: [agreement], placements: [placement], assignments: [primary(), before, after], patternsById });
        expect(history.filter((e) => !e.isPrimary).map((e) => e.roomLocationId)).toEqual([GYM]);
    });

    it("12 · missing arrival is one attention per child per day; the primary session answers 'where expected'", () => {
        const today = on(expand([secondary("bc", GYM, MF), primary()]), "2026-11-16");
        expect(primaryEntryFor(today)?.roomLocationId).toBe(HOME);
        const vs = diffExpectedVsActual(today, []);
        expect(vs.variances.filter((v) => v.code === "expected_not_checked_in")).toHaveLength(1);
        expect(vs.variances[0]?.expectedRoomLocationId).toBe(HOME);
    });

    it("13 · expected attendance is derived only: the expansion has no writer, and pricing reads the primary alone", async () => {
        const { readFileSync } = await import("node:fs");
        const core = readFileSync(`${process.cwd()}/lib/childcareOperational/expectations/scheduleExpectationCore.ts`, "utf8");
        expect(core).not.toMatch(/\.(insert|update|upsert|delete)\(/);
        const pricing = readFileSync(`${process.cwd()}/lib/enrollment/pricing/assignmentPricingFacts.ts`, "utf8");
        expect(pricing).toContain('.eq("is_primary", true)');
        expect(pricing).not.toContain("loadOperationalExpectationInputs");
    });
});
