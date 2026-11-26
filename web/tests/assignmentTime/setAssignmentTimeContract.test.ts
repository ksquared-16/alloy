/**
 * The Assignment Time authoring contract.
 *
 * The gap this closes was not a missing table or a missing resolver — both
 * existed and were certified in Slice 1. It was that nothing could WRITE. Hours
 * arrived only from a pattern, at creation, one arrive/depart pair across every
 * weekday, so an operator could not give an assignment hours afterwards, change
 * them, or work different hours on different days. Every child assignment on
 * staging therefore carried recurrence with unknown hours, no room ever required
 * a staff member, and no staffing gap could exist to be seen or filled.
 *
 * These are the rules the week-replacing write has to keep.
 */
import { describe, expect, it, vi } from "vitest";

import {
    AssignmentTimeRejectedError,
    setAssignmentTime,
    validateAssignmentTimeDays,
} from "@/lib/assignmentTime/setAssignmentTime";

function client(result: { data?: unknown; error?: { message: string } | null } = {}) {
    const rpc = vi.fn().mockResolvedValue({ data: result.data ?? 0, error: result.error ?? null });
    return { rpc } as never as Parameters<typeof setAssignmentTime>[0] & { rpc: typeof rpc };
}

describe("what an operator may say", () => {
    it("accepts different hours on different weekdays — the shape a pattern cannot express", () => {
        expect(
            validateAssignmentTimeDays([
                { weekday: 1, startTime: "08:00", endTime: "16:30" },
                { weekday: 3, startTime: "08:00", endTime: "16:30" },
                { weekday: 5, startTime: "08:00", endTime: "16:30" },
                { weekday: 2, startTime: "09:00", endTime: "17:30" },
                { weekday: 4, startTime: "09:00", endTime: "17:30" },
            ])
        ).toEqual([]);
    });

    it("keeps UNKNOWN sayable — a day that recurs with hours nobody recorded", () => {
        expect(validateAssignmentTimeDays([{ weekday: 1 }, { weekday: 2, startTime: null, endTime: null }])).toEqual([]);
    });

    it("refuses half an interval rather than guessing the other end", () => {
        expect(validateAssignmentTimeDays([{ weekday: 1, startTime: "08:00" }])).toEqual([
            "Give a day both a start and an end time, or neither.",
        ]);
    });

    it("refuses a day that ends before it starts", () => {
        expect(validateAssignmentTimeDays([{ weekday: 1, startTime: "16:00", endTime: "08:00" }])).toEqual([
            "A day must end after it starts.",
        ]);
    });

    it("refuses overnight, which V1 does not represent", () => {
        expect(validateAssignmentTimeDays([{ weekday: 1, startTime: "22:00", endTime: "02:00" }])).toEqual([
            "A day must end after it starts.",
        ]);
    });

    it("refuses a second interval starting at the same time on one day", () => {
        expect(
            validateAssignmentTimeDays([
                { weekday: 1, startTime: "08:00", endTime: "12:00" },
                { weekday: 1, startTime: "08:00", endTime: "16:00" },
            ])
        ).toEqual(["That day already has an interval starting at the same time."]);
    });

    it("allows a split day — two intervals on one weekday", () => {
        expect(
            validateAssignmentTimeDays([
                { weekday: 1, startTime: "08:00", endTime: "12:00" },
                { weekday: 1, startTime: "13:00", endTime: "16:00" },
            ])
        ).toEqual([]);
    });

    it("refuses a day that is not a day", () => {
        expect(validateAssignmentTimeDays([{ weekday: 7, startTime: "08:00", endTime: "16:00" }])).toEqual([
            "That is not a day of the week.",
        ]);
    });
});

describe("the write", () => {
    it("replaces the week in ONE call, because a delete and an insert cannot be two", async () => {
        const db = client({ data: 5 });
        const rows = await setAssignmentTime(db, {
            assignmentId: "asg-1",
            days: [{ weekday: 1, startTime: "08:00", endTime: "16:30" }],
            actorUserId: "user-1",
        });
        expect(rows).toBe(5);
        expect(db.rpc).toHaveBeenCalledTimes(1);
        expect(db.rpc).toHaveBeenCalledWith("set_assignment_weekday_intervals", {
            p_assignment_id: "asg-1",
            p_days: [{ weekday: 1, start_time: "08:00", end_time: "16:30" }],
            p_actor: "user-1",
        });
    });

    it("sends an unknown day as null rather than as an empty string", async () => {
        const db = client();
        await setAssignmentTime(db, { assignmentId: "asg-1", days: [{ weekday: 2 }] });
        expect(db.rpc).toHaveBeenCalledWith("set_assignment_weekday_intervals", {
            p_assignment_id: "asg-1",
            p_days: [{ weekday: 2, start_time: null, end_time: null }],
            p_actor: null,
        });
    });

    it("never reaches the database with input it already knows is wrong", async () => {
        const db = client();
        await expect(
            setAssignmentTime(db, { assignmentId: "asg-1", days: [{ weekday: 1, startTime: "08:00" }] })
        ).rejects.toBeInstanceOf(AssignmentTimeRejectedError);
        expect(db.rpc).not.toHaveBeenCalled();
    });

    it("says what an operator can act on, never a constraint name", async () => {
        const db = client({ error: { message: 'assignment_time: weekday 1 must end after it starts' } });
        await expect(
            setAssignmentTime(db, { assignmentId: "asg-1", days: [{ weekday: 1, startTime: "08:00", endTime: "16:00" }] })
        ).rejects.toThrow("A day must end after it starts.");
    });

    it("does not touch the reusable pattern", async () => {
        const db = client();
        await setAssignmentTime(db, { assignmentId: "asg-1", days: [{ weekday: 1, startTime: "08:00", endTime: "16:00" }] });
        const call = db.rpc.mock.calls[0];
        expect(JSON.stringify(call)).not.toContain("pattern");
    });
});
