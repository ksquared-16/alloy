/**
 * Workflow events for childcare attendance facts (P2).
 * Every recorded/corrected attendance fact emits to workflow_events; downstream
 * consequences (billing, compliance, forecasting) react to events, never poll.
 */

import { emitEvent } from "@/lib/emitEvent";
import type {
    AttendanceActorType,
    AttendanceEntryType,
    AttendanceEventKind,
    AttendanceSourceType,
} from "@/lib/childcareOperational/attendance/attendanceVocabulary";

export const ATTENDANCE_EVENT_SCHEMA_VERSION = 1;

export const ATTENDANCE_EVENT_RECORDED_EVENT = "attendance_event_recorded";
export const ATTENDANCE_EVENT_CORRECTED_EVENT = "attendance_event_corrected";
export const ATTENDANCE_EVENT_REVERSED_EVENT = "attendance_event_reversed";

/** Own entity type / refKey namespace per child_namespace_decision §6 (attendance-child context). */
export const CHILD_ATTENDANCE_EVENT_ENTITY_TYPE = "child_attendance_events";

export const ATTENDANCE_ACTION_TYPE = "record_attendance";

type EmitContext = {
    actorUserId?: string | null;
    correlationId?: string | null;
};

function attendancePayload(base: Record<string, unknown>, ctx?: EmitContext): Record<string, unknown> {
    return {
        schema_version: ATTENDANCE_EVENT_SCHEMA_VERSION,
        ...base,
        ...(ctx?.actorUserId ? { actor_user_id: ctx.actorUserId } : {}),
        ...(ctx?.correlationId ? { correlation_id: ctx.correlationId } : {}),
    };
}

function eventTypeForEntry(entryType: AttendanceEntryType): string {
    if (entryType === "correction") return ATTENDANCE_EVENT_CORRECTED_EVENT;
    if (entryType === "reversal") return ATTENDANCE_EVENT_REVERSED_EVENT;
    return ATTENDANCE_EVENT_RECORDED_EVENT;
}

export async function emitAttendanceEvent(input: {
    orgId: string;
    attendanceEventId: string;
    enrollmentAgreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    eventKind: AttendanceEventKind;
    entryType: AttendanceEntryType;
    correctsEventId: string | null;
    serviceDate: string;
    eventAt: string;
    actorType: AttendanceActorType;
    sourceType: AttendanceSourceType;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: eventTypeForEntry(input.entryType),
        entity_type: CHILD_ATTENDANCE_EVENT_ENTITY_TYPE,
        entity_id: input.attendanceEventId,
        action_type: ATTENDANCE_ACTION_TYPE,
        payload: attendancePayload(
            {
                attendance_event_id: input.attendanceEventId,
                enrollment_agreement_id: input.enrollmentAgreementId,
                customer_member_id: input.customerMemberId,
                site_location_id: input.siteLocationId,
                event_kind: input.eventKind,
                entry_type: input.entryType,
                corrects_event_id: input.correctsEventId,
                service_date: input.serviceDate,
                event_at: input.eventAt,
                actor_type: input.actorType,
                source_type: input.sourceType,
            },
            input.ctx
        ),
    });
}
