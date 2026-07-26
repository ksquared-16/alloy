import { describe, expect, it } from "vitest";

import {
    assignmentOwnsProgramRoomField,
    primaryAssignmentFromScheduling,
    programRoomEditableWhenNoPrimaryAssignment,
} from "@/lib/adminV2/runtime/focusPanel/identity/assignmentProgramRoomGating";
import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";

describe("assignmentProgramRoomGating", () => {
    it("detects primary assignment program and room", () => {
        const scheduling = {
            status: "scheduled",
            current: {
                assignments: [
                    {
                        isPrimary: true,
                        room: { program: "Preschool", name: "Room A" },
                    },
                ],
            },
            proposed: null,
        } as unknown as ChildScheduling;
        expect(primaryAssignmentFromScheduling(scheduling)).toEqual({
            program: "Preschool",
            room: "Room A",
        });
    });

    it("blocks program field edit when primary assignment exists", () => {
        const scheduling = {
            status: "scheduled",
            current: { assignments: [{ isPrimary: true, room: { program: "Toddler", name: "B" } }] },
            proposed: null,
        } as unknown as ChildScheduling;
        expect(programRoomEditableWhenNoPrimaryAssignment("inquiry_child.program", scheduling)).toBe(false);
        expect(assignmentOwnsProgramRoomField("child.room")).toBe(true);
    });

    it("allows program edit before committed assignment", () => {
        expect(
            programRoomEditableWhenNoPrimaryAssignment("inquiry_child.program", {
                status: "needs-placement",
                current: null,
                proposed: null,
            } as unknown as ChildScheduling),
        ).toBe(true);
    });
});
