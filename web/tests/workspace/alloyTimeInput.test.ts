import { describe, expect, it } from "vitest";

import {
    formatAlloyTimeDisplay,
    parseAlloyTimeInput,
} from "@/lib/workspace/alloyTimeValue";
import {
    filterRoomsForPurposeBehavior,
    scopeRoomsForAssignmentPicker,
    type AssignmentTypeBehavior,
} from "@/lib/operationalAssignments/assignmentTypeBehavior";

describe("alloyTimeValue", () => {
    it("formats stored HH:mm to operator display", () => {
        expect(formatAlloyTimeDisplay("08:30")).toBe("8:30 AM");
        expect(formatAlloyTimeDisplay("12:00")).toBe("12:00 PM");
        expect(formatAlloyTimeDisplay("00:15")).toBe("12:15 AM");
        expect(formatAlloyTimeDisplay("")).toBe("");
    });

    it("parses common operator time strings into HH:mm", () => {
        expect(parseAlloyTimeInput("8:30 AM")).toBe("08:30");
        expect(parseAlloyTimeInput("8:30am")).toBe("08:30");
        expect(parseAlloyTimeInput("2:00 PM")).toBe("14:00");
        expect(parseAlloyTimeInput("14:00")).toBe("14:00");
        expect(parseAlloyTimeInput("0830a")).toBe("08:30");
        expect(parseAlloyTimeInput("")).toBe("");
        expect(parseAlloyTimeInput("not-a-time")).toBeNull();
    });
});

describe("scopeRoomsForAssignmentPicker", () => {
    const rooms = [
        { roomId: "infant", programCategoryId: "prog-infant" },
        { roomId: "toddler", programCategoryId: "prog-toddler" },
        { roomId: "open", programCategoryId: null },
    ];

    it("keeps program mismatches visible for override (unlike hard filter)", () => {
        const behavior: AssignmentTypeBehavior = {
            roomRequirement: "required",
            eligibleSpaceMode: "program_match",
        };
        const hard = filterRoomsForPurposeBehavior(rooms, behavior, "prog-infant");
        const scoped = scopeRoomsForAssignmentPicker(rooms, behavior);
        expect(hard.map((r) => r.roomId)).toEqual(["infant", "open"]);
        expect(scoped.map((r) => r.roomId)).toEqual(["infant", "toddler", "open"]);
    });

    it("still respects not_used and selected allow-lists", () => {
        expect(scopeRoomsForAssignmentPicker(rooms, { roomRequirement: "not_used" })).toEqual([]);
        const selected = scopeRoomsForAssignmentPicker(rooms, {
            roomRequirement: "required",
            eligibleSpaceMode: "selected",
            eligibleRoomIds: ["toddler"],
        });
        expect(selected.map((r) => r.roomId)).toEqual(["toddler"]);
    });
});
