import { describe, expect, it } from "vitest";
import {
    buildAssignmentTimelineForWeekday,
    pickTimelineWeekday,
    assignmentSummaryLine,
    sortAssignmentsForDisplay,
    assignmentFinancialPlaceholder,
} from "@/lib/operationalAssignments/assignmentTimeline";
import type { Assignment } from "@/lib/scheduling/projection/schedulingProjectionTypes";

function assignment(over: {
    id: string;
    label: string;
    weekdays: number[];
    arriveTime?: string | null;
    departTime?: string | null;
    isPrimary?: boolean;
    subjectType?: "child" | "staff";
}): Assignment {
    return {
        id: over.id,
        subjectId: "subject-1",
        subjectType: over.subjectType ?? "child",
        childId: "subject-1",
        room: { id: "r1", name: "Sunshine", program: "Preschool" },
        weekdays: over.weekdays,
        arriveTime: over.arriveTime ?? null,
        departTime: over.departTime ?? null,
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
        openEnded: true,
        kind: "base",
        status: "active",
        isPrimary: over.isPrimary ?? false,
        assignmentType: {
            id: over.id,
            key: over.id,
            label: over.label,
            iconKey: null,
            visualTone: "info",
            billingParticipation: "eligible",
            attendanceParticipation: "expected",
            staffingParticipation: "demand",
        },
        patternId: "pat-1",
        patternLabel: over.label,
        billing: { participation: "eligible", label: "Recurring billing eligible" },
    };
}

describe("buildAssignmentTimelineForWeekday", () => {
    it("orders segments by arrive time and flags overlaps", () => {
        const model = buildAssignmentTimelineForWeekday(
            [
                assignment({
                    id: "primary",
                    label: "Primary Preschool",
                    weekdays: [1, 2, 3, 4, 5],
                    arriveTime: "08:30",
                    departTime: "15:00",
                    isPrimary: true,
                }),
                assignment({
                    id: "before",
                    label: "Before Care",
                    weekdays: [1, 2, 3, 4, 5],
                    arriveTime: "07:00",
                    departTime: "08:30",
                }),
                assignment({
                    id: "soccer",
                    label: "Soccer Shots",
                    weekdays: [3],
                    arriveTime: "10:00",
                    departTime: "11:00",
                }),
            ],
            3
        );
        expect(model.segments.map((s) => s.label)).toEqual([
            "Before Care",
            "Primary Preschool",
            "Soccer Shots",
        ]);
        expect(model.segments[1]!.overlapsPrevious).toBe(false);
        expect(model.segments[1]!.gapAfterPreviousMinutes).toBeNull();
        expect(model.segments[2]!.overlapsPrevious).toBe(true);
        expect(model.segments[2]!.note).toContain("Overlaps");
        expect(model.summary).toContain("3 assignments on Wednesday");
    });

    it("notes gaps between timed segments and marks future windows", () => {
        const model = buildAssignmentTimelineForWeekday(
            [
                assignment({
                    id: "before",
                    label: "Before Care",
                    weekdays: [1],
                    arriveTime: "07:00",
                    departTime: "08:00",
                }),
                {
                    ...assignment({
                        id: "primary",
                        label: "Primary",
                        weekdays: [1],
                        arriveTime: "09:00",
                        departTime: "15:00",
                        isPrimary: true,
                    }),
                    effectiveFrom: "2027-01-01",
                    openEnded: true,
                },
            ],
            1,
            "2026-07-25"
        );
        expect(model.segments[1]!.gapAfterPreviousMinutes).toBe(60);
        expect(model.segments[1]!.note).toContain("1h gap");
        expect(model.segments[1]!.isFuture).toBe(true);
        expect(model.gapCount).toBe(1);
        expect(model.futureCount).toBe(1);
        expect(model.summary).toContain("1 gap");
        expect(model.summary).toContain("1 future");
    });

    it("omits assignments that do not include the weekday", () => {
        const model = buildAssignmentTimelineForWeekday(
            [
                assignment({
                    id: "mwf",
                    label: "MWF",
                    weekdays: [1, 3, 5],
                    arriveTime: "09:00",
                    departTime: "12:00",
                }),
                assignment({
                    id: "tt",
                    label: "TT",
                    weekdays: [2, 4],
                    arriveTime: "09:00",
                    departTime: "12:00",
                }),
            ],
            2
        );
        expect(model.segments).toHaveLength(1);
        expect(model.segments[0]!.label).toBe("TT");
    });

    it("notes missing hours without inventing times", () => {
        const model = buildAssignmentTimelineForWeekday(
            [assignment({ id: "x", label: "Therapy", weekdays: [1] })],
            1
        );
        expect(model.hasHours).toBe(false);
        expect(model.segments[0]!.note).toContain("Hours not set");
    });
});

describe("pickTimelineWeekday", () => {
    it("prefers today when work exists; else first weekday with work", () => {
        const list = [
            assignment({
                id: "wed",
                label: "Wed only",
                weekdays: [3],
                arriveTime: "09:00",
                departTime: "10:00",
            }),
        ];
        expect(pickTimelineWeekday(list, 3)).toBe(3);
        expect(pickTimelineWeekday(list, 1)).toBe(3);
    });
});

describe("assignmentSummaryLine", () => {
    it("scans Room · Days · Effective · Time without child-only wording", () => {
        const line = assignmentSummaryLine(
            assignment({
                id: "p",
                label: "Primary Classroom",
                weekdays: [1, 2, 3, 4, 5],
                arriveTime: "08:30",
                departTime: "15:00",
                isPrimary: true,
                subjectType: "staff",
            })
        );
        expect(line).toContain("Sunshine");
        expect(line).toContain("Mon–Fri");
        expect(line).toContain("Jul 1, 2026");
        expect(line).toContain("8:30 AM–3:00 PM");
        expect(line).not.toContain("Primary Classroom");
        expect(line.toLowerCase()).not.toContain("child");
    });
});

describe("sortAssignmentsForDisplay", () => {
    it("orders primary before secondary", () => {
        const sorted = sortAssignmentsForDisplay([
            assignment({ id: "sec", label: "After Care", weekdays: [1], arriveTime: "07:00", departTime: "08:00" }),
            assignment({
                id: "pri",
                label: "Primary Classroom",
                weekdays: [1, 2, 3, 4, 5],
                arriveTime: "08:30",
                departTime: "15:00",
                isPrimary: true,
            }),
        ]);
        expect(sorted.map((a) => a.id)).toEqual(["pri", "sec"]);
    });
});

describe("assignmentFinancialPlaceholder", () => {
    it("returns relationship label when billing eligible", () => {
        expect(
            assignmentFinancialPlaceholder(
                assignment({ id: "x", label: "Primary", weekdays: [1] })
            )
        ).toBe("Recurring billing eligible");
    });

    it("returns em dash when billing not linked", () => {
        const a = assignment({ id: "x", label: "Therapy", weekdays: [1] });
        a.billing = { participation: "none", label: null };
        expect(assignmentFinancialPlaceholder(a)).toBe("—");
    });
});
