/**
 * Staff presence fact vocabulary.
 * Keep aligned with supabase/migrations/20260812090000_staff_presence_facts_v1.sql
 *
 * Deliberately a SUBSET of the child attendance vocabulary, not a copy:
 *
 *   check_in / check_out / present / absence   shared operational meaning — reused
 *   room_transfer                              NOT included: child room transfer is
 *                                              a governed movement fact. Staff room
 *                                              movement is a separate domain and is
 *                                              out of scope; a check_in authors the
 *                                              actual room instead.
 *   schedule_override                          NOT included: that is a child
 *                                              enrollment-schedule concept.
 *
 * Entry types and correction semantics are identical by design — the correction
 * contract is universal, and forking it would fork replay.
 *
 * Actor types are NOT copied mechanically: "parent", "guardian" and
 * "emergency_contact" cannot author staff presence.
 */

export const STAFF_PRESENCE_EVENT_KINDS = ["check_in", "check_out", "present", "absence"] as const;
export type StaffPresenceEventKind = (typeof STAFF_PRESENCE_EVENT_KINDS)[number];

export const STAFF_PRESENCE_ENTRY_TYPES = ["original", "correction", "reversal"] as const;
export type StaffPresenceEntryType = (typeof STAFF_PRESENCE_ENTRY_TYPES)[number];

export const STAFF_PRESENCE_ACTOR_TYPES = ["staff", "operator", "system"] as const;
export type StaffPresenceActorType = (typeof STAFF_PRESENCE_ACTOR_TYPES)[number];

export const STAFF_PRESENCE_SOURCE_TYPES = [
    "operator_action",
    "staff_workspace",
    "processing_import",
    "system",
] as const;
export type StaffPresenceSourceType = (typeof STAFF_PRESENCE_SOURCE_TYPES)[number];

/** Kinds that assert a place and therefore require a room. */
export const STAFF_PRESENCE_KINDS_REQUIRING_ROOM = ["check_in", "present"] as const;

export function isStaffPresenceEventKind(v: string): v is StaffPresenceEventKind {
    return (STAFF_PRESENCE_EVENT_KINDS as readonly string[]).includes(v);
}
export function isStaffPresenceActorType(v: string): v is StaffPresenceActorType {
    return (STAFF_PRESENCE_ACTOR_TYPES as readonly string[]).includes(v);
}
export function isStaffPresenceSourceType(v: string): v is StaffPresenceSourceType {
    return (STAFF_PRESENCE_SOURCE_TYPES as readonly string[]).includes(v);
}

export type StaffPresenceEventRow = {
    id: string;
    org_id: string;
    person_id: string;
    employment_id: string;
    site_location_id: string;
    event_kind: StaffPresenceEventKind;
    entry_type: StaffPresenceEntryType;
    corrects_event_id: string | null;
    event_at: string;
    service_date: string;
    room_location_id: string | null;
    actor_type: StaffPresenceActorType;
    actor_user_id: string | null;
    actor_person_id: string | null;
    actor_label: string | null;
    source_type: StaffPresenceSourceType;
    source_key: string;
    reason_key: string | null;
    note: string | null;
    metadata: Record<string, unknown>;
    created_by: string | null;
    created_at: string;
};

export const STAFF_PRESENCE_SELECT_COLUMNS =
    "id, org_id, person_id, employment_id, site_location_id, event_kind, entry_type, corrects_event_id, " +
    "event_at, service_date, room_location_id, actor_type, actor_user_id, actor_person_id, actor_label, " +
    "source_type, source_key, reason_key, note, metadata, created_by, created_at";
