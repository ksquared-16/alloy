import { describe, expect, it } from "vitest";
import {
    ASSIGNMENT_CATEGORY_DEFAULT_TONE_BY_LABEL,
    defaultVisualToneForAssignmentTypeLabel,
    readAssignmentTypeBehavior,
    scopeRoomsForAssignmentPicker,
    roomsForEveryCategory,
    writeAssignmentTypeBehavior,
} from "@/lib/operationalAssignments/assignmentTypeBehavior";

describe("assignmentTypeBehavior", () => {
    it("reads tri-state program/room requirements and syncs legacy booleans on write", () => {
        const written = writeAssignmentTypeBehavior({
            programRequirement: "optional",
            roomRequirement: "not_used",
            primaryEligible: true,
            allowsOverlap: true,
            eligibleSpaceMode: "selected",
            eligibleRoomIds: ["r1"],
        });
        expect(written.requiresProgram).toBe(false);
        expect(written.requiresRoom).toBe(false);
        expect(written.roomRequirement).toBe("not_used");

        const read = readAssignmentTypeBehavior(written);
        expect(read.programRequirement).toBe("optional");
        expect(read.roomRequirement).toBe("not_used");
        expect(read.eligibleSpaceMode).toBe("selected");
    });

    it("a Category's stored room list is history: it round-trips but never narrows the picker (V7 Q-B)", () => {
        const stored = readAssignmentTypeBehavior({ eligibleSpaceMode: "selected", eligibleRoomIds: ["b"] });
        expect(writeAssignmentTypeBehavior(stored)).toMatchObject({ eligibleSpaceMode: "selected", eligibleRoomIds: ["b"] });
        const rooms = [
            { roomId: "a", programCategoryId: "p1" },
            { roomId: "b", programCategoryId: "p2" },
        ];
        expect(scopeRoomsForAssignmentPicker(rooms, { roomRequirement: "optional", ...stored }).map((r) => r.roomId)).toEqual(["a", "b"]);
    });

    it("the space's own Uses decide, as on the server", () => {
        const rooms = [
            { roomId: "classroom", unitRole: "operational_group" as const, spaceUses: ["before_care_id"] },
            { roomId: "gym", unitRole: "shared_space" as const, spaceUses: ["enrichment_id"] },
            { roomId: "shell", unitRole: "physical_space" as const, spaceUses: null },
        ];
        const use = { categoryId: "before_care_id", subjectType: "child" as const };
        expect(scopeRoomsForAssignmentPicker(rooms, {}, use).map((r) => r.roomId)).toEqual(["classroom"]);
    });

    it("returns no rooms when space is not used", () => {
        expect(
            scopeRoomsForAssignmentPicker([{ roomId: "a" }], { roomRequirement: "not_used" })
        ).toEqual([]);
    });

    it("assigns fixed, distinct-where-possible default tones to the seeded vocabulary", () => {
        expect(defaultVisualToneForAssignmentTypeLabel("Primary Classroom")).toBe("accent");
        expect(defaultVisualToneForAssignmentTypeLabel("Before Care")).toBe("info");
        expect(defaultVisualToneForAssignmentTypeLabel("After Care")).toBe("success");
        expect(defaultVisualToneForAssignmentTypeLabel("Enrichment")).toBe("warning");
        expect(defaultVisualToneForAssignmentTypeLabel("Therapy")).toBe("warning");
        expect(defaultVisualToneForAssignmentTypeLabel("Transportation")).toBe("neutral");
        expect(defaultVisualToneForAssignmentTypeLabel("Recurring Service")).toBe("success");
        // Case/whitespace tolerant — the operator types the label, not the key.
        expect(defaultVisualToneForAssignmentTypeLabel("  before care  ".toUpperCase())).toBe("info");
        // Before Care and After Care — the pair the polish request called out as
        // duplicated — must never resolve to the same tone.
        expect(defaultVisualToneForAssignmentTypeLabel("Before Care")).not.toBe(
            defaultVisualToneForAssignmentTypeLabel("After Care")
        );
        expect(defaultVisualToneForAssignmentTypeLabel("Unrecognized Category")).toBeNull();
        expect(Object.keys(ASSIGNMENT_CATEGORY_DEFAULT_TONE_BY_LABEL)).toHaveLength(7);
    });

    it("roomsForEveryCategory offers active rooms every selected Category would offer — the Roster's bulk pickers", () => {
        const rooms = [
            { roomId: "toddler", roomName: "Toddler A", active: true },
            { roomId: "infant", roomName: "Infant B", active: true },
            { roomId: "closed", roomName: "Closed C", active: false },
        ];
        // No Category narrows nothing, but an inactive room is never offered.
        expect(roomsForEveryCategory(rooms, []).map((r) => r.roomId)).toEqual(["toddler", "infant"]);
        const as = (behavior: object) => ({ behavior, use: { categoryId: null, subjectType: "child" as const } });
        // A Category's stored room list no longer narrows the bulk picker (V7 Q-B).
        const toddlerOnly = { eligibleSpaceMode: "selected" as const, eligibleRoomIds: ["toddler"] };
        expect(roomsForEveryCategory(rooms, [as(toddlerOnly)]).map((r) => r.roomId)).toEqual(["toddler", "infant"]);
        // A Category that uses no room offers none — and a room must suit every selected row.
        expect(roomsForEveryCategory(rooms, [as({ roomRequirement: "not_used" as const })])).toEqual([]);
    });
});
