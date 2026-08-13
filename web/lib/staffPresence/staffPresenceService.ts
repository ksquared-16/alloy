/**
 * Staff presence service — the one write authority for the fact stream.
 *
 * Nothing else writes `staff_presence_events`; the registered presence actions
 * are its only sanctioned callers, and the table is append-only at the database
 * level regardless.
 *
 * Invariants held here (the database holds them too — this layer exists so the
 * operator gets a sentence instead of a 23514):
 *  - the person must hold employment covering the service date
 *  - org and site scope must be coherent
 *  - corrections and reversals reference a prior fact; nothing is edited in place
 *
 * NOT payroll. No compensable time, breaks, overtime or wages are computed here
 * and none may be added.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertValidIsoDate } from "@/lib/childcareOperational/effectiveDating";
import { EmploymentServiceError } from "@/lib/employment/employmentErrors";
import { emitStaffPresenceEvent } from "@/lib/staffPresence/staffPresenceEvents";
import {
    STAFF_PRESENCE_KINDS_REQUIRING_ROOM,
    STAFF_PRESENCE_SELECT_COLUMNS,
    isStaffPresenceEventKind,
    type StaffPresenceActorType,
    type StaffPresenceEntryType,
    type StaffPresenceEventKind,
    type StaffPresenceEventRow,
    type StaffPresenceSourceType,
} from "@/lib/staffPresence/staffPresenceVocabulary";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

function requireId(v: unknown, field: string): string {
    const s = trimOrNull(v);
    if (!s) throw new EmploymentServiceError("invalid_input", `${field} is required`);
    return s;
}

function rethrow(message: string): never {
    const invariant =
        /employment does not cover|employment org mismatch|does not match the employment|invalid site_location_id|room must be|correction must target|append-only/i.test(
            message
        );
    throw new EmploymentServiceError(invariant ? "invalid_state" : "db_error", message);
}

export type RecordStaffPresenceInput = {
    orgId: string;
    personId: string;
    /** Resolved automatically from the covering employment when omitted. */
    employmentId?: string | null;
    siteLocationId: string;
    roomLocationId?: string | null;
    eventKind: StaffPresenceEventKind;
    entryType?: StaffPresenceEntryType;
    correctsEventId?: string | null;
    serviceDate: string;
    /** ISO instant. Defaults to now. */
    eventAt?: string | null;
    actorType?: StaffPresenceActorType;
    sourceType?: StaffPresenceSourceType;
    sourceKey?: string;
    reasonKey?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    correlationId?: string | null;
};

/**
 * The employment covering this person on this service date.
 *
 * Presence outside employment is not a fact about staff — it is a data error, and
 * the caller learns that here rather than from a constraint violation.
 */
/*
 * ⚠ Row casts below go through `unknown` on purpose.
 *
 * The columns are selected via a runtime string constant, so the typed Supabase client cannot
 * resolve the shape and widens the result to `GenericStringError`. That is a limitation of the
 * client's inference, not a claim about the data — the select constant and the row type are kept
 * in step by hand, and the DB certification asserts the real columns.
 */
export async function resolveCoveringEmployment(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    serviceDate: string
): Promise<{ id: string } | null> {
    const { data, error } = await supabase
        .from("employments")
        .select("id, employment_status, start_date, end_date")
        .eq("org_id", orgId)
        .eq("person_id", personId);
    if (error) rethrow(error.message);
    const rows = (data ?? []) as {
        id: string;
        employment_status: string;
        start_date: string;
        end_date: string | null;
    }[];
    const covering = rows.find(
        (e) =>
            e.employment_status !== "canceled" &&
            e.start_date <= serviceDate &&
            (e.end_date == null || e.end_date >= serviceDate)
    );
    return covering ? { id: covering.id } : null;
}

export async function recordStaffPresence(
    supabase: SupabaseClient,
    input: RecordStaffPresenceInput
): Promise<StaffPresenceEventRow> {
    const orgId = requireId(input.orgId, "orgId");
    const personId = requireId(input.personId, "personId");
    const siteLocationId = requireId(input.siteLocationId, "siteLocationId");
    assertValidIsoDate(input.serviceDate, "serviceDate");

    if (!isStaffPresenceEventKind(input.eventKind)) {
        throw new EmploymentServiceError("invalid_input", `Unknown event_kind "${input.eventKind}"`);
    }

    const entryType: StaffPresenceEntryType = input.entryType ?? "original";
    const correctsEventId = trimOrNull(input.correctsEventId);
    if (entryType === "original" && correctsEventId) {
        throw new EmploymentServiceError("invalid_input", "An original fact cannot reference a prior event");
    }
    if (entryType !== "original" && !correctsEventId) {
        throw new EmploymentServiceError(
            "invalid_input",
            "A correction or reversal must reference the fact it supersedes"
        );
    }

    const roomLocationId = trimOrNull(input.roomLocationId);
    if (
        entryType !== "reversal" &&
        (STAFF_PRESENCE_KINDS_REQUIRING_ROOM as readonly string[]).includes(input.eventKind) &&
        !roomLocationId
    ) {
        throw new EmploymentServiceError(
            "invalid_input",
            `${input.eventKind} asserts a place — a room is required`
        );
    }

    const employmentId =
        trimOrNull(input.employmentId) ??
        (await resolveCoveringEmployment(supabase, orgId, personId, input.serviceDate))?.id ??
        null;
    if (!employmentId) {
        throw new EmploymentServiceError(
            "invalid_state",
            "This person held no employment on that date, so presence cannot be recorded",
            { person_id: personId, service_date: input.serviceDate }
        );
    }

    const { data, error } = await supabase
        .from("staff_presence_events")
        .insert({
            org_id: orgId,
            person_id: personId,
            employment_id: employmentId,
            site_location_id: siteLocationId,
            room_location_id: roomLocationId,
            event_kind: input.eventKind,
            entry_type: entryType,
            corrects_event_id: correctsEventId,
            service_date: input.serviceDate,
            event_at: trimOrNull(input.eventAt) ?? new Date().toISOString(),
            actor_type: input.actorType ?? "operator",
            actor_user_id: trimOrNull(input.actorUserId),
            source_type: input.sourceType ?? "operator_action",
            source_key: trimOrNull(input.sourceKey) ?? "operator_action",
            reason_key: trimOrNull(input.reasonKey),
            note: trimOrNull(input.note),
            metadata: input.metadata ?? {},
            created_by: trimOrNull(input.actorUserId),
        })
        .select(STAFF_PRESENCE_SELECT_COLUMNS)
        .single();
    if (error) rethrow(error.message);

    const row = data as unknown as StaffPresenceEventRow;
    await emitStaffPresenceEvent({
        orgId,
        presenceEventId: row.id,
        personId: row.person_id,
        employmentId: row.employment_id,
        siteLocationId: row.site_location_id,
        eventKind: row.event_kind,
        entryType: row.entry_type,
        correctsEventId: row.corrects_event_id,
        serviceDate: row.service_date,
        eventAt: row.event_at,
        actorType: row.actor_type,
        sourceType: row.source_type,
        ctx: { actorUserId: input.actorUserId ?? null, correlationId: input.correlationId ?? null },
    });

    return row;
}

/** Every fact for a site on one service date, oldest first — history, not state. */
export async function listStaffPresenceForSiteDate(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    serviceDate: string
): Promise<StaffPresenceEventRow[]> {
    const { data, error } = await supabase
        .from("staff_presence_events")
        .select(STAFF_PRESENCE_SELECT_COLUMNS)
        .eq("org_id", requireId(orgId, "orgId"))
        .eq("site_location_id", requireId(siteLocationId, "siteLocationId"))
        .eq("service_date", serviceDate)
        .order("event_at", { ascending: true });
    if (error) rethrow(error.message);
    return (data ?? []) as unknown as StaffPresenceEventRow[];
}
