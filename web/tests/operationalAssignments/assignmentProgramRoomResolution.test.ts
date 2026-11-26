import { describe, expect, it } from "vitest";
import {
    programCategoryIdForRoom,
    resolveProgramOnRoomChange,
    resolveRoomOnProgramChange,
    roomImpliesCanonicalProgram,
    roomValidForProgram,
} from "@/lib/operationalAssignments/assignmentProgramRoomResolution";

const ROOMS = [
    { roomId: "room-infant", programCategoryId: "prog-infant" },
    { roomId: "room-toddler", programCategoryId: "prog-toddler" },
    { roomId: "room-flex", programCategoryId: null },
];

describe("assignmentProgramRoomResolution", () => {
    it("resolves a room's canonical program", () => {
        expect(programCategoryIdForRoom(ROOMS, "room-infant")).toBe("prog-infant");
        expect(programCategoryIdForRoom(ROOMS, "room-flex")).toBeNull();
        expect(programCategoryIdForRoom(ROOMS, null)).toBeNull();
        expect(programCategoryIdForRoom(ROOMS, "missing-room")).toBeNull();
    });

    it("only rooms with a declared program imply a canonical program", () => {
        expect(roomImpliesCanonicalProgram(ROOMS, "room-infant")).toBe(true);
        expect(roomImpliesCanonicalProgram(ROOMS, "room-flex")).toBe(false);
        expect(roomImpliesCanonicalProgram(ROOMS, null)).toBe(false);
    });

    it("changing room to one with a canonical program overrides the prior program", () => {
        const resolution = resolveProgramOnRoomChange({
            rooms: ROOMS,
            roomId: "room-toddler",
            priorProgramCategoryId: "prog-infant",
        });
        expect(resolution).toEqual({ programCategoryId: "prog-toddler", programFromRoom: true });
    });

    it("changing room to one with no declared program keeps the prior (context-resolved) program", () => {
        const resolution = resolveProgramOnRoomChange({
            rooms: ROOMS,
            roomId: "room-flex",
            priorProgramCategoryId: "prog-infant",
        });
        expect(resolution).toEqual({ programCategoryId: "prog-infant", programFromRoom: false });
    });

    it("clearing the room selection resolves to no program-from-room", () => {
        expect(
            resolveProgramOnRoomChange({ rooms: ROOMS, roomId: null, priorProgramCategoryId: "prog-infant" })
        ).toEqual({ programCategoryId: "prog-infant", programFromRoom: false });
    });

    it("a room with no declared program is valid for any program", () => {
        expect(roomValidForProgram(ROOMS, "room-flex", "prog-infant")).toBe(true);
    });

    it("a room whose declared program matches is valid; a mismatch is invalid", () => {
        expect(roomValidForProgram(ROOMS, "room-infant", "prog-infant")).toBe(true);
        expect(roomValidForProgram(ROOMS, "room-infant", "prog-toddler")).toBe(false);
    });

    it("no room or no program short-circuits to valid (nothing to invalidate)", () => {
        expect(roomValidForProgram(ROOMS, null, "prog-infant")).toBe(true);
        expect(roomValidForProgram(ROOMS, "room-infant", null)).toBe(true);
    });

    it("changing program clears a now-invalid room", () => {
        const resolution = resolveRoomOnProgramChange({
            rooms: ROOMS,
            roomId: "room-infant",
            nextProgramCategoryId: "prog-toddler",
        });
        expect(resolution).toEqual({ roomId: null, cleared: true });
    });

    it("changing program keeps a still-valid room", () => {
        const resolution = resolveRoomOnProgramChange({
            rooms: ROOMS,
            roomId: "room-flex",
            nextProgramCategoryId: "prog-toddler",
        });
        expect(resolution).toEqual({ roomId: "room-flex", cleared: false });
    });

    it("no room selected has nothing to clear", () => {
        expect(
            resolveRoomOnProgramChange({ rooms: ROOMS, roomId: null, nextProgramCategoryId: "prog-toddler" })
        ).toEqual({ roomId: null, cleared: false });
    });
});
