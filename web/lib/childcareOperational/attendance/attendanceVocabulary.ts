/**
 * Childcare attendance fact vocabulary (P2).
 * Keep aligned with supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql
 */

export const ATTENDANCE_EVENT_KINDS = [
    "check_in",
    "check_out",
    "absence",
    "present",
    "room_transfer",
    "schedule_override",
] as const;
export type AttendanceEventKind = (typeof ATTENDANCE_EVENT_KINDS)[number];

export const ATTENDANCE_ENTRY_TYPES = ["original", "correction", "reversal"] as const;
export type AttendanceEntryType = (typeof ATTENDANCE_ENTRY_TYPES)[number];

export const ATTENDANCE_ACTOR_TYPES = [
    "staff",
    "parent",
    "guardian",
    "emergency_contact",
    "system",
] as const;
export type AttendanceActorType = (typeof ATTENDANCE_ACTOR_TYPES)[number];

export const ATTENDANCE_SOURCE_TYPES = [
    "operator_action",
    "staff_workspace",
    "parent_portal",
    "processing_import",
    "system",
] as const;
export type AttendanceSourceType = (typeof ATTENDANCE_SOURCE_TYPES)[number];

/** Kinds that require a room_location_id. */
export const ATTENDANCE_KINDS_REQUIRING_ROOM = ["check_in", "present"] as const;

export function isAttendanceEventKind(v: string): v is AttendanceEventKind {
    return (ATTENDANCE_EVENT_KINDS as readonly string[]).includes(v);
}
export function isAttendanceActorType(v: string): v is AttendanceActorType {
    return (ATTENDANCE_ACTOR_TYPES as readonly string[]).includes(v);
}
export function isAttendanceSourceType(v: string): v is AttendanceSourceType {
    return (ATTENDANCE_SOURCE_TYPES as readonly string[]).includes(v);
}
