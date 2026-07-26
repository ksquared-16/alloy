import { describe, expect, it } from "vitest";
import {
    buildChildScheduling,
    buildSchedulingProjectionForChild,
    formatWeekdays,
    type AssignmentInput,
    type PureChildSchedulingInput,
} from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";

const CHILD_ID = "child-ethan";
const ASOF = "2026-07-24";
const COMPUTED_AT = "2026-07-24T12:00:00.000Z";

const SUBJECT = {
    id: CHILD_ID,
    name: "Ethan",
    program: "Toddler",
    ageGroup: null,
    siteId: "site-1",
    siteName: "North Campus",
};

function assignmentRow(over: Partial<ScheduleAssignmentRow> & { id: string }): ScheduleAssignmentRow {
    return {
        org_id: "org-1",
        subject_type: "child",
        enrollment_agreement_id: "ea-1",
        schedule_pattern_id: "pat-1",
        customer_member_id: CHILD_ID,
        subject_person_id: null,
        site_location_id: "site-1",
        room_location_id: null,
        program_category_id: null,
        operational_assignment_type_id: null,
        is_primary: false,
        start_date: "2026-07-01",
        end_date: null,
        status: "active",
        assignment_kind: "base",
        source_key: "operator",
        supersedes_assignment_id: null,
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
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

const PRIMARY_TYPE = {
    id: "type-primary",
    key: "primary_classroom",
    label: "Primary Classroom",
    iconKey: "calendar-clock",
    visualTone: "success" as const,
    billingParticipation: "eligible" as const,
    attendanceParticipation: "expected" as const,
    staffingParticipation: "demand" as const,
};

function ai(
    row: ScheduleAssignmentRow,
    weekdays: number[],
    room: typeof ROOM | { id: string | null; name: string | null; program: string | null } = ROOM,
    over: Partial<AssignmentInput> = {}
): AssignmentInput {
    return {
        row,
        weekdays,
        patternResolved: true,
        patternLabel: "Full Time",
        arriveTime: "08:30",
        departTime: "15:00",
        room,
        assignmentType: PRIMARY_TYPE,
        ...over,
    };
}

describe("formatWeekdays", () => {
    it("names and orders weekdays", () => {
        expect(formatWeekdays([5, 1, 3])).toBe("Mon, Wed, Fri");
    });
});

describe("buildChildScheduling", () => {
    it("resolves a current open-ended base assignment as scheduled", () => {
        const child = buildChildScheduling(
            input([ai(assignmentRow({ id: "a1", start_date: "2026-07-01", status: "active" }), MON_FRI)])
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
            input([ai(assignmentRow({ id: "a2", start_date: "2026-09-02", status: "planned" }), MON_FRI)])
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
                ai(assignmentRow({ id: "base", start_date: "2026-07-01", status: "active" }), MON_FRI),
                ai(
                    assignmentRow({
                        id: "temp",
                        start_date: "2026-07-24",
                        end_date: "2026-08-15",
                        assignment_kind: "temporary",
                        status: "active",
                    }),
                    [4],
                    { id: "room-rainbow", name: "Rainbow", program: "Toddler" }
                ),
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
                ai(assignmentRow({ id: "mwf", start_date: "2026-07-01", status: "active" }), [1, 3, 5]),
                ai(
                    assignmentRow({
                        id: "tt",
                        schedule_pattern_id: "pat-2",
                        start_date: "2026-07-01",
                        status: "active",
                    }),
                    [2, 4],
                    { id: "room-rainbow", name: "Rainbow", program: "Toddler" }
                ),
            ])
        );
        expect(child.current).not.toBeNull();
        expect(child.current!.assignments).toHaveLength(2);
    });

    it("collects superseded/ended assignments into history, newest first", () => {
        const child = buildChildScheduling(
            input([
                ai(
                    assignmentRow({
                        id: "old1",
                        start_date: "2026-01-01",
                        end_date: "2026-03-31",
                        status: "superseded",
                    }),
                    MON_FRI
                ),
                ai(
                    assignmentRow({
                        id: "old2",
                        start_date: "2026-04-01",
                        end_date: "2026-06-30",
                        status: "ended",
                    }),
                    MON_FRI
                ),
                ai(assignmentRow({ id: "cur", start_date: "2026-07-01", status: "active" }), MON_FRI),
            ])
        );
        expect(child.status).toBe("scheduled");
        expect(child.history).toHaveLength(2);
        expect(child.history[0].effectiveFrom).toBe("2026-04-01"); // newest first
        expect(child.history[1].effectiveFrom).toBe("2026-01-01");
    });

    it("sorts current primary assignment first and exposes type/hours/billing", () => {
        const enrichment = {
            id: "type-enrichment",
            key: "enrichment",
            label: "Soccer Shots",
            iconKey: "sparkles",
            visualTone: "info" as const,
            billingParticipation: "eligible" as const,
            attendanceParticipation: "expected" as const,
            staffingParticipation: "none" as const,
        };
        const child = buildChildScheduling(
            input([
                ai(
                    assignmentRow({
                        id: "soccer",
                        start_date: "2026-07-01",
                        status: "active",
                        is_primary: false,
                    }),
                    [3],
                    ROOM,
                    {
                        patternLabel: "Wed AM",
                        arriveTime: "10:00",
                        departTime: "11:00",
                        assignmentType: enrichment,
                    }
                ),
                ai(
                    assignmentRow({
                        id: "primary",
                        start_date: "2026-07-01",
                        status: "active",
                        is_primary: true,
                    }),
                    MON_FRI
                ),
            ])
        );
        expect(child.current!.assignments.map((a) => a.id)).toEqual(["primary", "soccer"]);
        expect(child.current!.assignments[0].isPrimary).toBe(true);
        expect(child.current!.assignments[0].assignmentType.label).toBe("Primary Classroom");
        expect(child.current!.assignments[1].arriveTime).toBe("10:00");
        expect(child.current!.assignments[1].departTime).toBe("11:00");
        expect(child.current!.assignments[1].billing).toEqual({
            participation: "eligible",
            label: "Recurring billing eligible",
        });
        expect(child.current!.assignments[0].billing.label).toBe("Tuition");
    });
});

describe("buildSchedulingProjectionForChild", () => {
    it("wraps a child as a subject-scoped projection with children[]=1", () => {
        const child = buildChildScheduling(
            input([ai(assignmentRow({ id: "a1", start_date: "2026-07-01", status: "active" }), MON_FRI)])
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
                ai(assignmentRow({ id: "a1", start_date: "2026-07-01", status: "active" }), MON_FRI, {
                    id: null,
                    name: null,
                    program: null,
                }),
            ])
        );
        const projection = buildSchedulingProjectionForChild(child, ASOF, COMPUTED_AT);
        expect(projection.calculationMeta.completeness).toBe("partial");
        expect(projection.calculationMeta.partialReasons).toContain("room unresolved");
    });
});
