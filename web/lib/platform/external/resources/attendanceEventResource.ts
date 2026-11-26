/**
 * The public representation of one canonical attendance fact.
 *
 * ── WHY EVENTS AND NOT "ATTENDANCE" ──
 *
 * `child_attendance_events` is an append-only ledger, and the noun is the ledger's own. A resource
 * called `attendance` would imply a folded answer — is this child here right now — which is a
 * different question with a different shape, a different freshness contract, and no stable id to
 * page over. That projection exists internally (`attendanceFold`) and is deliberately left to a
 * later, separately bounded slice. What this contract publishes is what happened, in the order it
 * was recorded, including the corrections.
 *
 * ── CORRECTIONS ARE FACTS, NOT EDITS ──
 *
 * A row is never updated. A mistake is fixed by appending a `correction` that restates the values
 * and names the event it corrects, or a `reversal` that voids one. Both carry `corrects_event_id`.
 * A consumer folds them the way Alloy does: a superseded event is no longer effective, and a
 * reversal contributes nothing but its own tombstone. That is why this resource needs no archive or
 * deletion law — nothing here ever disappears, so nothing has to be reported as missing.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──
 *
 * `org_id`          the installation already determines it; publishing it invites a caller to think
 *                   it is selectable, and it is not
 * `enrollment_agreement_id`  internal linkage, not an external concept
 * `actor_user_id`, `actor_person_id`, `actor_label`   a named human. `actor_type` gives the
 *                   operational fact — a parent or a staff member — without identifying anyone
 * `source_key`      internal transport identity
 * `note`            free text. Free text authored by staff about a child is the one field most
 *                   likely to carry something nobody decided to publish
 * `reason_key`      a closed vocabulary, but it contains `illness` and `medical_appointment`. An
 *                   absence reason is child health information; it is withheld until someone
 *                   deliberately decides a partner should have it, and the excused/unexcused
 *                   CLASSIFICATION would be the safer half if they should
 * `metadata`        uncontracted by construction
 * `created_by`      an operator identity
 */

import type {
    AttendanceActorType,
    AttendanceEntryType,
    AttendanceEventKind,
    AttendanceSourceType,
} from "@/lib/childcareOperational/attendance/attendanceVocabulary";

/** The canonical columns this resource reads. Nothing else is selected. */
export const ATTENDANCE_EVENT_COLUMNS = [
    "id",
    "customer_member_id",
    "site_location_id",
    "room_location_id",
    "from_room_location_id",
    "to_room_location_id",
    "event_kind",
    "entry_type",
    "corrects_event_id",
    "event_at",
    "service_date",
    "actor_type",
    "source_type",
    "created_at",
].join(", ");

export type CanonicalAttendanceEventRow = {
    id: string;
    customer_member_id: string;
    site_location_id: string;
    room_location_id: string | null;
    from_room_location_id: string | null;
    to_room_location_id: string | null;
    event_kind: AttendanceEventKind;
    entry_type: AttendanceEntryType;
    corrects_event_id: string | null;
    event_at: string;
    service_date: string;
    actor_type: AttendanceActorType;
    source_type: AttendanceSourceType;
    created_at: string;
};

export type PublicAttendanceEvent = {
    id: string;
    child_id: string;
    /** This installation's own identifier for the child, when it has mapped one. */
    child_external_id: string | null;
    site_id: string;
    room_id: string | null;
    from_room_id: string | null;
    to_room_id: string | null;
    event_kind: AttendanceEventKind;
    entry_type: AttendanceEntryType;
    corrects_event_id: string | null;
    /** When it physically happened. */
    event_at: string;
    /** The service day it belongs to — not always the calendar day of `event_at`. */
    service_date: string;
    actor_type: AttendanceActorType;
    source: AttendanceSourceType;
    /**
     * When Alloy recorded it, and the ONLY field incremental synchronization advances on.
     *
     * A correction for last Tuesday is recorded today. Ordering a forward-only feed by `event_at`
     * would file it behind a watermark the consumer has already passed, and they would never see
     * it. Ordering by the recording time means every fact — however old the day it describes —
     * arrives after the facts recorded before it.
     */
    recorded_at: string;
};

export function toPublicAttendanceEvent(
    row: CanonicalAttendanceEventRow,
    childExternalId: string | null,
): PublicAttendanceEvent {
    return {
        id: row.id,
        child_id: row.customer_member_id,
        child_external_id: childExternalId,
        site_id: row.site_location_id,
        room_id: row.room_location_id,
        from_room_id: row.from_room_location_id,
        to_room_id: row.to_room_location_id,
        event_kind: row.event_kind,
        entry_type: row.entry_type,
        corrects_event_id: row.corrects_event_id,
        event_at: row.event_at,
        service_date: row.service_date,
        actor_type: row.actor_type,
        source: row.source_type,
        recorded_at: row.created_at,
    };
}
