/**
 * When a committed primary operational assignment exists, Program/Room display
 * derives from the assignment classroom. Proposed drafts (pre-enrollment or
 * OA `commitment_kind=proposed`) do **not** own those identity fields — Desired
 * Program stays independently editable until a committed schedule exists.
 * Room without a primary still routes to Assignments.
 */

import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";

const PROGRAM_FIELD_REFS = new Set(["inquiry_child.program", "inquiry_child.program_category_id", "child.program"]);
const ROOM_FIELD_REFS = new Set(["child.room", "inquiry_child.program_room_cohort_key"]);
const LOCATION_FIELD_REFS = new Set(["inquiry_child.location_id", "child.location"]);

export function primaryAssignmentFromScheduling(
    scheduling: ChildScheduling | null | undefined,
): { program: string | null; room: string | null } | null {
    if (!scheduling) return null;
    const status = scheduling.status;
    // Proposed-only / needs-placement never lock Program/Room on identity cards.
    if (status !== "scheduled" && status !== "upcoming-only") return null;
    const view = scheduling.current ?? scheduling.proposed;
    if (!view?.assignments?.length) return null;
    const primary = view.assignments.find((a) => a.isPrimary) ?? view.assignments[0];
    if (!primary) return null;
    // Synthetic / OA proposed rows are planning-only — not identity Program owners.
    if (primary.commitmentKind === "proposed") return null;
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

/** Site / school location — Editable per child (and lead); not Assignments-owned. */
export function isLocationIdentityFieldRef(fieldRef: string): boolean {
    return LOCATION_FIELD_REFS.has(fieldRef.trim());
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
