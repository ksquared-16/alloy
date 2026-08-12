/**
 * Workflow events for staff presence facts.
 *
 * Mirrors the attendance emitter: every recorded/corrected/reversed presence fact
 * emits to workflow_events so downstream consequences react to events rather
 * than polling the table.
 */

import { emitEvent } from "@/lib/emitEvent";
import type {
    StaffPresenceActorType,
    StaffPresenceEntryType,
    StaffPresenceEventKind,
    StaffPresenceSourceType,
} from "@/lib/staffPresence/staffPresenceVocabulary";

export const STAFF_PRESENCE_EVENT_SCHEMA_VERSION = 1;

export const STAFF_PRESENCE_EVENT_RECORDED_EVENT = "staff_presence_event_recorded";
export const STAFF_PRESENCE_EVENT_CORRECTED_EVENT = "staff_presence_event_corrected";
export const STAFF_PRESENCE_EVENT_REVERSED_EVENT = "staff_presence_event_reversed";

export const STAFF_PRESENCE_EVENT_ENTITY_TYPE = "staff_presence_events";
export const STAFF_PRESENCE_ACTION_TYPE = "record_staff_presence";

type EmitContext = {
    actorUserId?: string | null;
    correlationId?: string | null;
};

function presencePayload(base: Record<string, unknown>, ctx?: EmitContext): Record<string, unknown> {
    return {
        schema_version: STAFF_PRESENCE_EVENT_SCHEMA_VERSION,
        ...base,
        ...(ctx?.actorUserId ? { actor_user_id: ctx.actorUserId } : {}),
        ...(ctx?.correlationId ? { correlation_id: ctx.correlationId } : {}),
    };
}

function eventTypeForEntry(entryType: StaffPresenceEntryType): string {
    if (entryType === "correction") return STAFF_PRESENCE_EVENT_CORRECTED_EVENT;
    if (entryType === "reversal") return STAFF_PRESENCE_EVENT_REVERSED_EVENT;
    return STAFF_PRESENCE_EVENT_RECORDED_EVENT;
}

export async function emitStaffPresenceEvent(input: {
    orgId: string;
    presenceEventId: string;
    personId: string;
    employmentId: string;
    siteLocationId: string;
    eventKind: StaffPresenceEventKind;
    entryType: StaffPresenceEntryType;
    correctsEventId: string | null;
    serviceDate: string;
    eventAt: string;
    actorType: StaffPresenceActorType;
    sourceType: StaffPresenceSourceType;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: eventTypeForEntry(input.entryType),
        entity_type: STAFF_PRESENCE_EVENT_ENTITY_TYPE,
        entity_id: input.presenceEventId,
        action_type: STAFF_PRESENCE_ACTION_TYPE,
        payload: presencePayload(
            {
                staff_presence_event_id: input.presenceEventId,
                person_id: input.personId,
                employment_id: input.employmentId,
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
