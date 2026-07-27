import { describe, expect, it } from "vitest";
import {
    ASSIGNMENT_CATEGORY_DEFAULT_TONE_BY_LABEL,
    defaultVisualToneForAssignmentTypeLabel,
    filterRoomsForPurposeBehavior,
    readAssignmentTypeBehavior,
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

    it("filters rooms by selected eligibility", () => {
        const rooms = [
            { roomId: "a", programCategoryId: "p1" },
            { roomId: "b", programCategoryId: "p2" },
        ];
        const filtered = filterRoomsForPurposeBehavior(
            rooms,
            { roomRequirement: "optional", eligibleSpaceMode: "selected", eligibleRoomIds: ["b"] },
            null
        );
        expect(filtered.map((r) => r.roomId)).toEqual(["b"]);
    });

    it("returns no rooms when space is not used", () => {
        expect(
            filterRoomsForPurposeBehavior(
                [{ roomId: "a" }],
                { roomRequirement: "not_used" },
                null
            )
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
});
