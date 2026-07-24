import { describe, expect, it } from "vitest";
import {
    buildChildScheduling,
    buildSchedulingProjectionForChild,
    formatWeekdays,
    type AssignmentInput,
    type PureChildSchedulingInput,
} from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { ChildSchedulingSubject } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import type { ScheduleAssignmentStatus } from "@/lib/childcareOperational/enrollmentOperationalStatus";

const ASOF = "2026-07-21";
const COMPUTED_AT = "2026-07-21T12:00:00.000Z";
const CHILD_ID = "cm-ethan";

const SUBJECT: ChildSchedulingSubject = {
    id: CHILD_ID,
    name: "Ethan",
    program: "Toddler",
    ageGroup: "toddler",
    siteId: "site-1",
    siteName: "Downtown",
};

function assignmentRow(
    over: Partial<ScheduleAssignmentRow> & {
        id: string;
        start_date: string;
        status: ScheduleAssignmentStatus;
    }
): ScheduleAssignmentRow {
    return {
        org_id: "org-1",
        enrollment_agreement_id: "agr-1",
        schedule_pattern_id: "pat-1",
        customer_member_id: CHILD_ID,
        end_date: null,
        assignment_kind: "base",
        source_key: "operator",
        supersedes_assignment_id: null,
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...over,
    };
}

function input(
    assignments: AssignmentInput[],
    agreementStatus: string | null = "active"
): PureChildSchedulingInput {
    return { subject: SUBJECT, agreementStatus, assignments, asOf: ASOF };
}

const ROOM = { id: "room-sunshine", name: "Sunshine", program: "Toddler" };
const MON_FRI = [1, 2, 3, 4, 5];

describe("formatWeekdays", () => {
    it("names and orders weekdays", () => {
        expect(formatWeekdays([5, 1, 3])).toBe("Mon, Wed, Fri");
    });
});

describe("buildChildScheduling", () => {
    it("resolves a current open-ended base assignment as scheduled", () => {
        const child = buildChildScheduling(
            input([
                {
                    row: assignmentRow({ id: "a1", start_date: "2026-07-01", status: "active" }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: ROOM,
                },
            ])
        );
        expect(child.status).toBe("scheduled");
        expect(child.current).not.toBeNull();
        expect(child.current!.openEnded).toBe(true);
        expect(child.current!.assignments).toHaveLength(1);
        expect(child.current!.assignments[0].room.name).toBe("Sunshine");
        expect(child.upcoming).toHaveLength(0);
        expect(child.history).toHaveLength(0);
    });

    it("classifies a future-dated assignment as upcoming-only", () => {
        const child = buildChildScheduling(
            input([
                {
                    row: assignmentRow({ id: "a2", start_date: "2026-09-02", status: "planned" }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: ROOM,
                },
            ])
        );
        expect(child.status).toBe("upcoming-only");
        expect(child.current).toBeNull();
        expect(child.upcoming).toHaveLength(1);
        expect(child.upcoming[0].effectiveFrom).toBe("2026-09-02");
    });

    it("returns needs-placement when an active agreement has no assignments", () => {
        const child = buildChildScheduling(input([]));
        expect(child.status).toBe("needs-placement");
        expect(child.current).toBeNull();
    });

    it("returns needs-placement when there is no operational agreement", () => {
        const child = buildChildScheduling(input([], null));
        expect(child.status).toBe("needs-placement");
    });

    it("returns ended when the agreement is terminal", () => {
        const child = buildChildScheduling(input([], "ended"));
        expect(child.status).toBe("ended");
    });

    it("routes a bounded temporary assignment to the temporary bucket", () => {
        const child = buildChildScheduling(
            input([
                {
                    row: assignmentRow({ id: "base", start_date: "2026-07-01", status: "active" }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: ROOM,
                },
                {
                    row: assignmentRow({
                        id: "temp",
                        start_date: "2026-07-24",
                        end_date: "2026-08-15",
                        assignment_kind: "temporary",
                        status: "active",
                    }),
                    weekdays: [4],
                    patternResolved: true,
                    room: { id: "room-rainbow", name: "Rainbow", program: "Toddler" },
                },
            ])
        );
        expect(child.status).toBe("scheduled");
        expect(child.temporary).toHaveLength(1);
        expect(child.temporary[0].temporary).toBe(true);
        expect(child.temporary[0].effectiveTo).toBe("2026-08-15");
    });

    it("groups concurrent split-week base assignments into one current view", () => {
        const child = buildChildScheduling(
            input([
                {
                    row: assignmentRow({ id: "mwf", start_date: "2026-07-01", status: "active" }),
                    weekdays: [1, 3, 5],
                    patternResolved: true,
                    room: ROOM,
                },
                {
                    row: assignmentRow({
                        id: "tt",
                        schedule_pattern_id: "pat-2",
                        start_date: "2026-07-01",
                        status: "active",
                    }),
                    weekdays: [2, 4],
                    patternResolved: true,
                    room: { id: "room-rainbow", name: "Rainbow", program: "Toddler" },
                },
            ])
        );
        expect(child.current).not.toBeNull();
        expect(child.current!.assignments).toHaveLength(2);
    });

    it("collects superseded/ended assignments into history, newest first", () => {
        const child = buildChildScheduling(
            input([
                {
                    row: assignmentRow({
                        id: "old1",
                        start_date: "2026-01-01",
                        end_date: "2026-03-31",
                        status: "superseded",
                    }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: ROOM,
                },
                {
                    row: assignmentRow({
                        id: "old2",
                        start_date: "2026-04-01",
                        end_date: "2026-06-30",
                        status: "ended",
                    }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: ROOM,
                },
                {
                    row: assignmentRow({ id: "cur", start_date: "2026-07-01", status: "active" }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: ROOM,
                },
            ])
        );
        expect(child.status).toBe("scheduled");
        expect(child.history).toHaveLength(2);
        expect(child.history[0].effectiveFrom).toBe("2026-04-01"); // newest first
        expect(child.history[1].effectiveFrom).toBe("2026-01-01");
    });
});

describe("buildSchedulingProjectionForChild", () => {
    it("wraps a child as a subject-scoped projection with children[]=1", () => {
        const child = buildChildScheduling(
            input([
                {
                    row: assignmentRow({ id: "a1", start_date: "2026-07-01", status: "active" }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: ROOM,
                },
            ])
        );
        const projection = buildSchedulingProjectionForChild(child, ASOF, COMPUTED_AT);
        expect(projection.subject).toEqual({ type: "child", id: CHILD_ID, name: "Ethan" });
        expect(projection.children).toHaveLength(1);
        expect(projection.asOf).toBe(ASOF);
        expect(projection.calculationMeta.computedAt).toBe(COMPUTED_AT);
        expect(projection.calculationMeta.completeness).toBe("complete");
    });

    it("marks completeness partial when a current room is unresolved", () => {
        const child = buildChildScheduling(
            input([
                {
                    row: assignmentRow({ id: "a1", start_date: "2026-07-01", status: "active" }),
                    weekdays: MON_FRI,
                    patternResolved: true,
                    room: { id: null, name: null, program: null },
                },
            ])
        );
        const projection = buildSchedulingProjectionForChild(child, ASOF, COMPUTED_AT);
        expect(projection.calculationMeta.completeness).toBe("partial");
        expect(projection.calculationMeta.partialReasons).toContain("room unresolved");
    });
});
