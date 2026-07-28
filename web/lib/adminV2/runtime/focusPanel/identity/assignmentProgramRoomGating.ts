/**
 * When a primary operational assignment exists, Program/Room display derives from
 * the assignment classroom. Before that, Desired Program is independently editable
 * (inquiry participation select). Room without a primary still routes to Assignments.
 */

import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";

const PROGRAM_FIELD_REFS = new Set(["inquiry_child.program", "inquiry_child.program_category_id", "child.program"]);
const ROOM_FIELD_REFS = new Set(["child.room", "inquiry_child.program_room_cohort_key"]);

export function primaryAssignmentFromScheduling(
    scheduling: ChildScheduling | null | undefined,
): { program: string | null; room: string | null } | null {
    if (!scheduling) return null;
    const view = scheduling.current ?? scheduling.proposed;
    if (!view?.assignments?.length) return null;
    const primary = view.assignments.find((a) => a.isPrimary) ?? view.assignments[0];
    if (!primary) return null;
    const status = scheduling.status;
    if (status !== "scheduled" && status !== "proposed" && status !== "upcoming-only") return null;
    // Prefer assignment room.program; fall back to subject program from placement.
    const program =
        primary.room.program?.trim()
        || scheduling.child.program?.trim()
        || null;
    return {
        program,
        room: primary.room.name?.trim() || null,
    };
}

export function isProgramIdentityFieldRef(fieldRef: string): boolean {
    return PROGRAM_FIELD_REFS.has(fieldRef.trim());
}

export function isRoomIdentityFieldRef(fieldRef: string): boolean {
    return ROOM_FIELD_REFS.has(fieldRef.trim());
}

export function assignmentOwnsProgramRoomField(fieldRef: string): boolean {
    return isProgramIdentityFieldRef(fieldRef) || isRoomIdentityFieldRef(fieldRef);
}

export function programRoomEditableWhenNoPrimaryAssignment(
    fieldRef: string,
    scheduling: ChildScheduling | null | undefined,
): boolean {
    if (!assignmentOwnsProgramRoomField(fieldRef)) return true;
    return primaryAssignmentFromScheduling(scheduling) == null;
}
