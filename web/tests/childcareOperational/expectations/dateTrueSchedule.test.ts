/**
 * V7 Package 1 — 1A: the schedule effective ON each date (audit E2), for expectations and the card.
 *
 * A supersession marks the prior row `superseded` at once and closes it the day before its successor.
 * Expectations read only live rows, and kept one row per agreement, so between a future-dated edit
 * and its start the child was expected nowhere; the card showed only the upcoming row. Each case
 * below is the pure reader the loader, roster, staffing and compliance read models share.
 */
import { describe, expect, it } from "vitest";

import {
    expandExpectedAttendance,
    expandPlannedAttendance,
    rowEffectiveOn,
    type OperationalAgreementInput,
    type OperationalAssignmentInput,
    type OperationalPlacementInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { buildChildScheduling, type AssignmentInput } from "@/lib/scheduling/projection/buildSchedulingProjection";
import { resolveAssignmentLifecycleState } from "@/lib/operationalAssignments/assignmentLifecycleState";
import { buildAssignmentTimelineForWeekday } from "@/lib/operationalAssignments/assignmentTimeline";
import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import type { Assignment } from "@/lib/scheduling/projection/schedulingProjectionTypes";

const agreement: OperationalAgreementInput = {
    id: "ag", customer_member_id: "m", site_location_id: "site", start_date: "2026-01-05", end_date: null, status: "active",
};
const MF = { id: "pat-mf", weekdays: [1, 2, 3, 4, 5], schedule_type_key: "full_day" };
const TTH = { id: "pat-tth", weekdays: [2, 4], schedule_type_key: "part_time" };
const patternsById = new Map([[MF.id, MF], [TTH.id, TTH]]);
const asg = (o: Partial<OperationalAssignmentInput> & { id: string }): OperationalAssignmentInput => ({
    enrollment_agreement_id: "ag", schedule_pattern_id: MF.id, start_date: "2026-01-05", end_date: null, status: "active", ...o,
});
const plc = (o: Partial<OperationalPlacementInput>): OperationalPlacementInput => ({
    enrollment_agreement_id: "ag", room_location_id: "T1", program_category_id: "prog", start_date: "2026-01-05", end_date: null, status: "active", ...o,
});
// Mon 16 Nov – Fri 27 Nov 2026. The change is scheduled for Fri 20 Nov.
const expand = (assignments: OperationalAssignmentInput[], placements: OperationalPlacementInput[] = [plc({})], extra = {}) =>
    expandExpectedAttendance({ dateStart: "2026-11-16", dateEnd: "2026-11-27", agreements: [agreement], placements, assignments, patternsById, ...extra });
const days = (entries: ReturnType<typeof expand>) => entries.map((e) => `${e.date.slice(8)}:${e.assignmentId}:${e.roomLocationId}`);

// The E2 probe: old primary to 19 Nov (superseded at once), successor Tue/Thu from 20 Nov.
const prior = asg({ id: "old", status: "superseded", end_date: "2026-11-19" });
const successor = asg({ id: "new", schedule_pattern_id: TTH.id, start_date: "2026-11-20", status: "planned" });

describe("expected attendance follows the row effective on each date", () => {
    it("E2: the still-current primary answers through its end, the successor from its start", () => {
        expect(days(expand([successor, prior]))).toEqual([
            "16:old:T1", "17:old:T1", "18:old:T1", "19:old:T1",
            "24:new:T1", "26:new:T1",
        ]);
    });

    it("no gap and no double count at the boundary, whatever the row order", () => {
        const a = days(expand([prior, successor]));
        const b = days(expand([successor, prior]));
        expect(a).toEqual(b);
        expect(new Set(a.map((d) => d.slice(0, 2))).size).toBe(a.length);
    });

    it("overlapping stored rows still yield one entry per date (live beats superseded, then the later start)", () => {
        const overlapping = asg({ id: "old", status: "superseded", end_date: "2026-11-25" });
        const mfSuccessor = asg({ id: "new", start_date: "2026-11-20", status: "planned" });
        const entries = expand([overlapping, mfSuccessor]);
        for (const d of ["2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"]) {
            expect(entries.filter((e) => e.date === d).map((e) => e.assignmentId)).toEqual(["new"]);
        }
        expect(entries.filter((e) => e.date === "2026-11-19").map((e) => e.assignmentId)).toEqual(["old"]);
    });

    it("history: past dates resolve to the row that applied then", () => {
        const past = expandExpectedAttendance({
            dateStart: "2026-03-02", dateEnd: "2026-03-06", agreements: [agreement], placements: [plc({})], patternsById,
            assignments: [asg({ id: "spring", status: "superseded", end_date: "2026-03-31" }), asg({ id: "now", start_date: "2026-04-01" })],
        });
        expect(new Set(past.map((e) => e.assignmentId))).toEqual(new Set(["spring"]));
        expect(past).toHaveLength(5);
    });

    it("a superseded row with no end cannot speak for any date", () => {
        expect(expand([asg({ id: "orphan", status: "superseded", end_date: null })])).toEqual([]);
        expect(rowEffectiveOn([asg({ id: "x", status: "cancelled", end_date: null })], "2026-11-16")).toBeNull();
    });

    it("the placement effective on the date names the room — a placement change moves the room on its day", () => {
        const placements = [plc({ status: "superseded", end_date: "2026-11-19" }), plc({ room_location_id: "T2", start_date: "2026-11-20", status: "planned" })];
        const entries = expand([asg({ id: "p" })], placements);
        expect(entries.find((e) => e.date === "2026-11-19")?.roomLocationId).toBe("T1");
        expect(entries.find((e) => e.date === "2026-11-20")?.roomLocationId).toBe("T2");
    });

    it("an assignment's own week (Assignment Time) wins over its pattern; without one the pattern decides", () => {
        const custom = expand([asg({ id: "c" })], [plc({})], { weekdaysByAssignmentId: new Map([["c", [1, 3, 5]]]) });
        expect(custom.map((e) => e.weekday)).toEqual([1, 3, 5, 1, 3, 5]);
        expect(expand([asg({ id: "c" })]).map((e) => e.weekday)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
        const planned = expandPlannedAttendance({
            dateStart: "2026-11-16", dateEnd: "2026-11-20", patternsById, weekdaysByAssignmentId: new Map([["pp", [2]]]),
            proposedAssignments: [{ id: "pp", customer_member_id: "m", site_location_id: "site", room_location_id: "T1", program_category_id: null, schedule_pattern_id: MF.id, start_date: "2026-11-01", end_date: null, status: "planned" }],
        });
        expect(planned.map((e) => e.weekday)).toEqual([2]);
    });
});

const row = (o: Partial<ScheduleAssignmentRow> & { id: string }): ScheduleAssignmentRow => ({
    org_id: "o", subject_type: "child", enrollment_agreement_id: "ag", schedule_pattern_id: MF.id, customer_member_id: "m",
    subject_person_id: null, site_location_id: "site", room_location_id: "T1", program_category_id: null,
    operational_assignment_type_id: null, is_primary: true, start_date: "2026-01-05", end_date: null, status: "active",
    assignment_kind: "base", source_key: "operator", supersedes_assignment_id: null, metadata: {}, created_by: null,
    updated_by: null, created_at: "2026-01-05T00:00:00.000Z", updated_at: "2026-01-05T00:00:00.000Z", ...o,
});
const input = (r: ScheduleAssignmentRow, weekdays = MF.weekdays): AssignmentInput => ({
    row: r, weekdays, patternResolved: true, patternLabel: null, arriveTime: null, departTime: null,
    room: { id: "T1", name: "Toddler 1", program: null },
    assignmentType: { id: null, key: null, label: null, iconKey: null, visualTone: null, billingParticipation: null, attendanceParticipation: null, staffingParticipation: null },
});

describe("the card's projection: current and upcoming across a scheduled change", () => {
    const child = buildChildScheduling({
        subject: { id: "m", name: "Ivy", program: null, ageGroup: null, siteId: "site", siteName: "Site" },
        agreementStatus: "active",
        asOf: "2026-11-16",
        assignments: [
            input(row({ id: "old", status: "superseded", end_date: "2026-11-19" })),
            input(row({ id: "new", start_date: "2026-11-20", status: "planned", supersedes_assignment_id: "old" }), TTH.weekdays),
        ],
    });

    it("today's primary stays current (ending the day before) and the change is upcoming", () => {
        expect(child.current?.assignments.map((a) => [a.id, a.effectiveTo])).toEqual([["old", "2026-11-19"]]);
        expect(child.upcoming.flatMap((v) => v.assignments.map((a) => [a.id, a.supersedes]))).toEqual([["new", "old"]]);
        expect(child.history).toHaveLength(0);
    });

    it("once its window passes, the superseded row is history", () => {
        const later = buildChildScheduling({
            subject: { id: "m", name: "Ivy", program: null, ageGroup: null, siteId: "site", siteName: "Site" },
            agreementStatus: "active",
            asOf: "2026-11-23",
            assignments: [input(row({ id: "old", status: "superseded", end_date: "2026-11-19" })), input(row({ id: "new", start_date: "2026-11-20", status: "active" }))],
        });
        expect(later.current?.assignments.map((a) => a.id)).toEqual(["new"]);
        expect(later.history).toHaveLength(1);
    });

    it("lifecycle: a pending supersession reads Active, then Completed; a superseded future row reads Upcoming", () => {
        const life = (asOf: string, from = "2026-01-05") =>
            resolveAssignmentLifecycleState({ commitmentKind: "committed", status: "superseded", effectiveFrom: from, effectiveTo: "2026-11-19", openEnded: false, asOf }).label;
        expect(life("2026-11-16")).toBe("Active");
        expect(life("2026-11-20")).toBe("Completed");
        expect(life("2026-11-16", "2026-11-18")).toBe("Upcoming");
    });

    it("a row and the change scheduled after it never 'overlap', however alike their hours", () => {
        const a = (id: string, from: string, to: string | null): Assignment => ({
            id, subjectId: "m", subjectType: "child", childId: "m", room: { id: "T1", name: "T1", program: null }, weekdays: [2],
            arriveTime: "08:00", departTime: "16:00", effectiveFrom: from, effectiveTo: to, openEnded: to == null, kind: "base",
            status: "active", isPrimary: true, assignmentType: { id: null, key: null, label: null, iconKey: null, visualTone: null, billingParticipation: null, attendanceParticipation: null, staffingParticipation: null },
            patternId: null, patternLabel: null, billing: { participation: "none", label: "No billing" },
        });
        const sequential = buildAssignmentTimelineForWeekday([a("old", "2026-01-05", "2026-11-19"), a("new", "2026-11-20", null)], 2, "2026-11-16");
        expect(sequential.segments.some((s) => s.overlapsPrevious)).toBe(false);
        const concurrent = buildAssignmentTimelineForWeekday([a("x", "2026-01-05", null), a("y", "2026-02-01", null)], 2, "2026-11-16");
        expect(concurrent.segments.some((s) => s.overlapsPrevious)).toBe(true);
    });
});
