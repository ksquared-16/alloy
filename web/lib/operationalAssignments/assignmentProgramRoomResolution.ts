/**
 * Pure Program ↔ Room resolution helpers for the Assignment editors (SchedulingCard's
 * ScheduleEditor, WorkspaceCreateAssignmentModal). Extracted so the resolution rules —
 * "a room with a canonical Program locks the Program", "an invalid Room clears when
 * the Program changes" — are unit-tested independent of any editor's React state.
 *
 * Program identity here is `location_program_categories.id` (the same id
 * `child_placements.program_category_id` / `opportunity_customer_members
 * .program_category_id` use) — NOT the Studio Pattern `programKeys` vocabulary
 * (`location_program_categories.key`), which is a separate identifier on the same
 * table for a different purpose (pattern applicability, not room/program binding).
 *
 * @see docs/platform/planning/assignment-platform-settings-inventory.md §1b
 */

export type ProgramRoomLookup = { roomId: string; programCategoryId?: string | null };

/** The room's canonical Program, when the room declares exactly one. */
export function programCategoryIdForRoom(
    rooms: readonly ProgramRoomLookup[],
    roomId: string | null | undefined
): string | null {
    if (!roomId) return null;
    return rooms.find((r) => r.roomId === roomId)?.programCategoryId ?? null;
}

/** True when the selected room implies a single canonical Program (Program becomes read-only). */
export function roomImpliesCanonicalProgram(
    rooms: readonly ProgramRoomLookup[],
    roomId: string | null | undefined
): boolean {
    return programCategoryIdForRoom(rooms, roomId) != null;
}

export type ProgramResolution = { programCategoryId: string | null; programFromRoom: boolean };

/**
 * Resolve the effective Program after a Room selection/change. A room with a
 * canonical Program always wins (Room → Program); a room with none leaves the
 * prior Program untouched (e.g. a Program resolved from child/assignment context).
 */
export function resolveProgramOnRoomChange(args: {
    rooms: readonly ProgramRoomLookup[];
    roomId: string | null | undefined;
    priorProgramCategoryId: string | null;
}): ProgramResolution {
    const fromRoom = programCategoryIdForRoom(args.rooms, args.roomId);
    if (fromRoom) return { programCategoryId: fromRoom, programFromRoom: true };
    return { programCategoryId: args.priorProgramCategoryId, programFromRoom: false };
}

/**
 * True when `roomId` remains valid once the Program becomes `programCategoryId`. A
 * room with no declared Program is always valid (it doesn't claim a Program); a room
 * whose declared Program differs from the new Program is invalid.
 */
export function roomValidForProgram(
    rooms: readonly ProgramRoomLookup[],
    roomId: string | null | undefined,
    programCategoryId: string | null | undefined
): boolean {
    if (!roomId || !programCategoryId) return true;
    const roomProgram = programCategoryIdForRoom(rooms, roomId);
    if (!roomProgram) return true;
    return roomProgram === programCategoryId;
}

export type RoomResolution = { roomId: string | null; cleared: boolean };

/** Resolve the effective Room after a Program change — clears an invalid Room. */
export function resolveRoomOnProgramChange(args: {
    rooms: readonly ProgramRoomLookup[];
    roomId: string | null | undefined;
    nextProgramCategoryId: string | null | undefined;
}): RoomResolution {
    const currentRoomId = args.roomId ?? null;
    if (!currentRoomId) return { roomId: null, cleared: false };
    if (roomValidForProgram(args.rooms, currentRoomId, args.nextProgramCategoryId)) {
        return { roomId: currentRoomId, cleared: false };
    }
    return { roomId: null, cleared: true };
}
