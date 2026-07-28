/**
 * When a primary operational assignment exists, Program/Room display derives from
 * the assignment and inquiry Program is not independently editable.
 */

import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";

const PROGRAM_FIELD_REFS = new Set(["inquiry_child.program", "inquiry_child.program_category_id"]);
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
    return {
        program: primary.room.program?.trim() || null,
        room: primary.room.name?.trim() || null,
    };
}

export function assignmentOwnsProgramRoomField(fieldRef: string): boolean {
    return PROGRAM_FIELD_REFS.has(fieldRef) || ROOM_FIELD_REFS.has(fieldRef);
}

export function programRoomEditableWhenNoPrimaryAssignment(
    fieldRef: string,
    scheduling: ChildScheduling | null | undefined,
): boolean {
    if (!assignmentOwnsProgramRoomField(fieldRef)) return true;
    return primaryAssignmentFromScheduling(scheduling) == null;
}
