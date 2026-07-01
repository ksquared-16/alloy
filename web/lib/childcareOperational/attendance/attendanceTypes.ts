/**
 * Row + input shapes for childcare attendance facts (P2).
 * Keep aligned with supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql
 */

import type {
    AttendanceActorType,
    AttendanceEntryType,
    AttendanceEventKind,
    AttendanceSourceType,
} from "@/lib/childcareOperational/attendance/attendanceVocabulary";

export type ChildAttendanceEventRow = {
    id: string;
    org_id: string;
    enrollment_agreement_id: string;
    customer_member_id: string;
    site_location_id: string;
    event_kind: AttendanceEventKind;
    entry_type: AttendanceEntryType;
    corrects_event_id: string | null;
    event_at: string;
    service_date: string;
    room_location_id: string | null;
    from_room_location_id: string | null;
    to_room_location_id: string | null;
    actor_type: AttendanceActorType;
    actor_user_id: string | null;
    actor_person_id: string | null;
    actor_label: string | null;
    source_type: AttendanceSourceType;
    source_key: string;
    reason_key: string | null;
    note: string | null;
    metadata: Record<string, unknown>;
    created_by: string | null;
    created_at: string;
};

/** Actor + source context attached to every recorded fact. */
export type AttendanceActorContext = {
    actorType: AttendanceActorType;
    actorUserId?: string | null;
    actorPersonId?: string | null;
    actorLabel?: string | null;
    sourceType?: AttendanceSourceType;
    sourceKey?: string;
};

export type RecordAttendanceEventInput = {
    orgId: string;
    enrollmentAgreementId: string;
    eventKind: AttendanceEventKind;
    eventAt: string;
    /**
     * Org/location-local service day (YYYY-MM-DD). Optional: when omitted, it is
     * derived from `eventAt` in `timeZone` (see attendanceServiceDate.ts). One of
     * `serviceDate` or `timeZone` must be provided.
     */
    serviceDate?: string;
    /** IANA timezone used to derive serviceDate from eventAt when serviceDate is absent. */
    timeZone?: string;
    roomLocationId?: string | null;
    fromRoomLocationId?: string | null;
    toRoomLocationId?: string | null;
    reasonKey?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
    actor: AttendanceActorContext;
};

export type CorrectAttendanceEventInput = Omit<RecordAttendanceEventInput, "enrollmentAgreementId"> & {
    /** entry_type: 'correction' restates; 'reversal' voids the target. */
    entryType: "correction" | "reversal";
    correctsEventId: string;
};
