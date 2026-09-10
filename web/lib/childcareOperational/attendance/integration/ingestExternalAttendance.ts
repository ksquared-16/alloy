/**
 * The external attendance ingestion boundary.
 *
 * Where a provider's payload STOPS. Everything downstream of this file speaks
 * canonical Alloy: a normalized event in, the existing `recordAttendanceEvent`
 * out. No provider field name reaches attendance core, which is what keeps a
 * second provider from costing a second attendance system.
 *
 *   provider payload → adapter → normalized event → THIS →
 *   producer authority → mapping → canonical command → canonical fact
 *
 * ── THE INBOX IS EVIDENCE, NOT TRUTH ──
 *
 * Every inbound event is recorded before it is judged, and its disposition says
 * what happened to it. Attendance projections read `child_attendance_events` and
 * must never read the inbox — the disposition describes INTEGRATION PROCESSING,
 * not whether a child is present. `unmapped` means "we could not tell
 * which child"; it says nothing about that child's day.
 *
 * ── REPLAY IS NOT CONFLICT ──
 *
 * Identity is (producer, provider event id) — the provider's own stable id,
 * namespaced. Not a payload hash: a hash makes a corrected event look new and a
 * replayed one look different the moment any field moves. The payload
 * fingerprint is kept alongside for a narrower job — telling a replay from a
 * contradiction that reused the same id.
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAttendanceEvent, correctAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";
import { resolveExternalMapping } from "@/lib/childcareOperational/attendance/integration/externalMapping";
import {
    resolveIntegrationProducer,
    type ResolvedIntegrationProducer,
} from "@/lib/childcareOperational/attendance/integration/producerAuthority";

/**
 * What every provider adapter must produce. Provider-neutral by construction:
 * there is nowhere here to put a Classroom Coach field name.
 */
export type NormalizedExternalAttendanceEvent = {
    /** The provider's own stable identity for this delivery. The dedupe key. */
    externalEventId: string;
    eventKind: "check_in" | "check_out" | "room_transfer" | "absence";
    /** The provider's identifier for the child. Resolved, never trusted. */
    externalChildId: string;
    externalSiteId?: string | null;
    externalRoomId?: string | null;
    externalFromRoomId?: string | null;
    externalToRoomId?: string | null;
    /** When it physically happened, per the provider. */
    physicalEventAt: string;
    /** When the provider recorded it, if different. */
    providerRecordedAt?: string | null;
    /** The provider's id for an earlier event this one corrects. */
    correctsExternalEventId?: string | null;
    /** `reversal` voids; `correction` restates. */
    correctionMode?: "correction" | "reversal" | null;
    /** Kept as evidence. Never consulted for authority. */
    raw?: Record<string, unknown>;
};

/*
 * The SAME words `payment_provider_events` uses, and the same words stored in
 * `attendance_integration_events.disposition`. One vocabulary end to end: what
 * an operator reads in the inbox is what the caller was told.
 *
 * `duplicate` is the exception that proves it — it is a truthful answer to a
 * redelivery, but never a stored state, because the row it describes is the one
 * that says `applied`.
 */
export type IngestDisposition =
    | "applied"
    | "duplicate"
    | "unmapped"
    | "conflicted"
    | "rejected"
    | "unattributed";

export type IngestOutcome = {
    disposition: IngestDisposition;
    /** The canonical fact, when one was authored or already existed. */
    attendanceEventId?: string | null;
    evidenceId?: string | null;
    code?: string | null;
    detail?: string | null;
};

/** Stable fingerprint of the MEANING of an event — not its identity. */
export function payloadFingerprint(event: NormalizedExternalAttendanceEvent): string {
    const canonical = JSON.stringify({
        kind: event.eventKind,
        child: event.externalChildId,
        room: event.externalRoomId ?? null,
        from: event.externalFromRoomId ?? null,
        to: event.externalToRoomId ?? null,
        at: event.physicalEventAt,
        corrects: event.correctsExternalEventId ?? null,
    });
    return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const serviceDateOf = (iso: string) => String(iso).slice(0, 10);

/**
 * Ingest one normalized provider event.
 *
 * Ordered so that nothing is written before it is earned: the producer is
 * resolved first, then evidence is recorded, then identity, then authority, then
 * the canonical command. A request that fails at any step leaves an evidence row
 * explaining why and no attendance truth at all.
 */
export async function ingestExternalAttendanceEvent(params: {
    supabase: SupabaseClient;
    presentedCredential: string | null | undefined;
    providerKey: string;
    event: NormalizedExternalAttendanceEvent;
}): Promise<IngestOutcome> {
    const { supabase, event } = params;
    const fingerprint = payloadFingerprint(event);

    const resolved = await resolveIntegrationProducer(supabase, params.presentedCredential);
    if (!resolved.ok) {
        /*
         * The producer could not be established, so there is no org to attribute
         * this to. It is still recorded — an event Alloy cannot attribute is a
         * real operational fact somebody may need to see — with a null org, which
         * is exactly how the payments inbox treats an unrecognised account.
         */
        const row = {
            provider_key: params.providerKey,
            provider_event_id: event.externalEventId,
            provider_event_type: event.eventKind,
            disposition: "unattributed",
            failure_code: resolved.code,
            payload_fingerprint: fingerprint,
            physical_event_at: event.physicalEventAt,
            provider_recorded_at: event.providerRecordedAt ?? null,
            raw: event.raw ?? {},
            updated_at: new Date().toISOString(),
        };
        /*
         * Read-then-write rather than an upsert. The uniqueness that holds here
         * is a PARTIAL index (`WHERE producer_id IS NULL`), and Postgres will not
         * infer a partial index as an ON CONFLICT target unless the statement
         * repeats its predicate — which PostgREST's `onConflict` cannot express.
         * The upsert this replaces therefore failed on every unidentified call,
         * and failed silently, which is the worst way for an evidence table to
         * behave: the record of "somebody tried to author attendance with a
         * credential we do not know" is exactly the one worth keeping.
         */
        const seen = await supabase
            .from("attendance_integration_events")
            .select("id")
            .eq("provider_key", params.providerKey)
            .eq("provider_event_id", event.externalEventId)
            .is("producer_id", null)
            .limit(1);
        const seenId = ((seen.data ?? []) as unknown as Array<{ id: string }>)[0]?.id ?? null;
        const wrote = seenId
            ? await supabase.from("attendance_integration_events").update(row).eq("id", seenId)
            : await supabase.from("attendance_integration_events").insert(row);
        if (wrote.error) {
            // Losing the evidence must not look like a clean refusal.
            return {
                disposition: "unattributed",
                code: resolved.code,
                detail: `${resolved.detail} (evidence not recorded: ${wrote.error.message})`,
            };
        }
        return { disposition: "unattributed", evidenceId: seenId, code: resolved.code, detail: resolved.detail };
    }
    const producer = resolved.producer;

    // ── Evidence first, and idempotently. One inbound event is one row, however
    // many times it is delivered or reprocessed.
    const existing = await supabase
        .from("attendance_integration_events")
        .select("id, disposition, payload_fingerprint, attendance_event_id")
        .eq("provider_key", params.providerKey)
        .eq("provider_event_id", event.externalEventId)
        .eq("producer_id", producer.producerId)
        .limit(1);

    const prior = ((existing.data ?? []) as unknown as Array<{
        id: string; disposition: string; payload_fingerprint: string | null; attendance_event_id: string | null;
    }>)[0];

    if (prior && prior.disposition === "applied") {
        if (prior.payload_fingerprint && prior.payload_fingerprint !== fingerprint) {
            /*
             * SAME ID, DIFFERENT MEANING. Not a replay, and emphatically not a
             * second interpretation to author quietly. The provider has reused an
             * identifier for something else, which is a data-integrity problem
             * only a person can resolve.
             */
            /*
             * THE ROW STAYS `applied`. What conflicted is THIS DELIVERY, not the
             * fact that was already committed — that fact is standing, canonical
             * and unaffected, and a disposition saying `conflicted` would claim
             * otherwise. It would also break correction lineage: a later
             * correction naming this provider event looks it up by its committed
             * disposition, so demoting the row would silently orphan every
             * correction that followed a contradictory redelivery.
             *
             * The disposition is the durable OUTCOME; `failure_code` carries the
             * most recent processing note. Same split as `duplicate`, which is an
             * answer to a caller rather than a state of the evidence.
             */
            await supabase
                .from("attendance_integration_events")
                .update({ failure_code: "payload_conflict", updated_at: new Date().toISOString() })
                .eq("id", prior.id);
            return {
                disposition: "conflicted",
                evidenceId: prior.id,
                code: "payload_conflict",
                detail: "This external event id was already committed with different content.",
            };
        }
        // A truthful committed success. The provider retried; the answer is the
        // fact that already exists.
        return { disposition: "duplicate", evidenceId: prior.id, attendanceEventId: prior.attendance_event_id };
    }

    const evidence = await upsertEvidence(supabase, {
        producer,
        providerKey: params.providerKey,
        event,
        fingerprint,
        disposition: "received",
        failureCode: null,
        priorId: prior?.id ?? null,
    });
    if (!evidence.id) {
        /*
         * REFUSE RATHER THAN PROCEED. Authoring a canonical attendance fact with
         * no record of what asked for it would leave a fact nobody can explain,
         * and an inbox that quietly loses rows is not evidence at all. The
         * provider retries; the identity is stable, so a retry costs nothing.
         */
        return {
            disposition: "rejected",
            code: "evidence_write_failed",
            detail: evidence.error ?? "The inbound event could not be recorded.",
        };
    }
    const evidenceId = evidence.id;

    // ── Identity. Unknown never creates.
    const child = await resolveExternalMapping({
        supabase,
        orgId: producer.orgId,
        producerId: producer.producerId,
        entityType: "child",
        externalId: event.externalChildId,
    });
    if (!child.ok) {
        await setDisposition(supabase, evidenceId, "unmapped", child.code);
        return { disposition: "unmapped", evidenceId, code: child.code, detail: child.detail };
    }

    const rooms: Record<string, string | null> = {};
    for (const [field, externalId] of [
        ["room", event.externalRoomId],
        ["from", event.externalFromRoomId],
        ["to", event.externalToRoomId],
    ] as const) {
        if (!externalId) { rooms[field] = null; continue; }
        const loc = await resolveExternalMapping({
            supabase,
            orgId: producer.orgId,
            producerId: producer.producerId,
            entityType: "location",
            externalId,
        });
        if (!loc.ok) {
            // An unknown room does not invent a location, and it does not fall
            // back to "no room" either — a fact placed in the wrong room, or in
            // none, is still a wrong fact.
            await setDisposition(supabase, evidenceId, "unmapped", loc.code);
            return { disposition: "unmapped", evidenceId, code: loc.code, detail: loc.detail };
        }
        // Narrowed rather than asserted: a mapping row that resolved as a child
        // must not silently be read as a room, which is precisely the confusion
        // the typed targets in the schema exist to prevent.
        if (loc.entityType !== "location") {
            await setDisposition(supabase, evidenceId, "rejected", "mapping_wrong_entity_kind");
            return {
                disposition: "rejected",
                evidenceId,
                code: "mapping_wrong_entity_kind",
                detail: `The mapping for "${externalId}" does not name a location.`,
            };
        }
        rooms[field] = loc.locationId;
    }

    // ── Authority. The producer's registered sites decide reach; the request
    // does not get a say.
    if (child.entityType !== "child") {
        await setDisposition(supabase, evidenceId, "rejected", "mapping_wrong_entity_kind");
        return {
            disposition: "rejected",
            evidenceId,
            code: "mapping_wrong_entity_kind",
            detail: "The mapping for that identifier does not name a child.",
        };
    }
    const agreement = await resolveAgreementForChild(supabase, producer.orgId, child.customerMemberId);
    if (!agreement) {
        await setDisposition(supabase, evidenceId, "rejected", "no_enrollment_agreement");
        return { disposition: "rejected", evidenceId, code: "no_enrollment_agreement", detail: "That child has no enrollment agreement to attach attendance to." };
    }
    if (!producer.authority.allowedSiteLocationIds.includes(agreement.siteLocationId ?? "")) {
        await setDisposition(supabase, evidenceId, "rejected", "site_not_authorized");
        return {
            disposition: "rejected",
            evidenceId,
            code: "site_not_authorized",
            detail: "This producer is not authorized for that child's site.",
        };
    }
    if (!producer.authority.grantedPermissionKeys.includes("attendance.record")) {
        await setDisposition(supabase, evidenceId, "rejected", "capability_not_granted");
        return { disposition: "rejected", evidenceId, code: "capability_not_granted", detail: "This producer may not record attendance." };
    }

    // ── The canonical command. Provenance is derived here, never supplied.
    const actor = {
        actorType: "system" as const,
        actorLabel: producer.label,
        sourceType: "integration_api" as const,
        sourceKey: producer.producerKey,
    };
    const common = {
        orgId: producer.orgId,
        eventAt: event.physicalEventAt,
        serviceDate: serviceDateOf(event.physicalEventAt),
        roomLocationId: rooms.room,
        fromRoomLocationId: rooms.from,
        toRoomLocationId: rooms.to,
        // The provider's event id IS the idempotency identity, so Thread 2's
        // substrate converges a replay that reached the writer.
        idempotencyKey: `${producer.producerKey}:${event.externalEventId}`,
        actor,
    };

    try {
        let written;
        if (event.correctsExternalEventId) {
            const target = await resolveCommittedFactFor(supabase, producer, params.providerKey, event.correctsExternalEventId);
            if (!target) {
                // A correction naming an original Alloy never committed cannot be
                // applied. Refusing keeps the lineage honest: a correction with
                // nothing to correct would otherwise become an original.
                await setDisposition(supabase, evidenceId, "rejected", "unknown_correction_target");
                return {
                    disposition: "rejected",
                    evidenceId,
                    code: "unknown_correction_target",
                    detail: "The event this correction references was never committed here.",
                };
            }
            written = await correctAttendanceEvent(supabase, {
                ...common,
                eventKind: event.eventKind,
                entryType: event.correctionMode ?? "correction",
                correctsEventId: target,
            } as Parameters<typeof correctAttendanceEvent>[1]);
        } else {
            written = await recordAttendanceEvent(supabase, {
                ...common,
                enrollmentAgreementId: agreement.id,
                eventKind: event.eventKind,
            } as Parameters<typeof recordAttendanceEvent>[1]);
        }

        await supabase
            .from("attendance_integration_events")
            .update({
                disposition: "applied",
                attendance_event_id: written.id,
                failure_code: null,
                processed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", evidenceId);

        return { disposition: "applied", evidenceId, attendanceEventId: written.id };
    } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        await setDisposition(supabase, evidenceId, "rejected", "write_failed");
        return { disposition: "rejected", evidenceId, code: "write_failed", detail };
    }
}

async function upsertEvidence(
    supabase: SupabaseClient,
    args: {
        producer: ResolvedIntegrationProducer;
        providerKey: string;
        event: NormalizedExternalAttendanceEvent;
        fingerprint: string;
        disposition: string;
        failureCode: string | null;
        priorId: string | null;
    },
): Promise<{ id: string; error: string | null }> {
    const row = {
        provider_key: args.providerKey,
        provider_event_id: args.event.externalEventId,
        provider_event_type: args.event.eventKind,
        org_id: args.producer.orgId,
        producer_id: args.producer.producerId,
        presented_producer_key: args.producer.producerKey,
        disposition: args.disposition,
        failure_code: args.failureCode,
        payload_fingerprint: args.fingerprint,
        physical_event_at: args.event.physicalEventAt,
        provider_recorded_at: args.event.providerRecordedAt ?? null,
        raw: args.event.raw ?? {},
        updated_at: new Date().toISOString(),
    };
    if (args.priorId) {
        // A retry of an event that previously failed reuses its row. One inbound
        // event stays one durable event however many attempts it takes.
        const { error } = await supabase.from("attendance_integration_events").update(row).eq("id", args.priorId);
        return { id: error ? "" : args.priorId, error: error?.message ?? null };
    }
    const { data, error } = await supabase
        .from("attendance_integration_events")
        .insert(row)
        .select("id")
        .single();
    // Surfaced, never swallowed: a fixture or a constraint that quietly refuses
    // this row would otherwise produce a suite of vacuous passes.
    return { id: (data as { id: string } | null)?.id ?? "", error: error?.message ?? null };
}

async function setDisposition(
    supabase: SupabaseClient,
    evidenceId: string,
    disposition: string,
    failureCode: string | null,
): Promise<void> {
    if (!evidenceId) return;
    await supabase
        .from("attendance_integration_events")
        .update({ disposition, failure_code: failureCode, updated_at: new Date().toISOString() })
        .eq("id", evidenceId);
}

/** The enrollment a fact attaches to, and the site that decides reach. */
async function resolveAgreementForChild(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
): Promise<{ id: string; siteLocationId: string | null } | null> {
    const { data } = await supabase
        .from("child_enrollment_agreements")
        .select("id, site_location_id")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .limit(1);
    const row = ((data ?? []) as unknown as Array<{ id: string; site_location_id: string | null }>)[0];
    return row ? { id: row.id, siteLocationId: row.site_location_id } : null;
}

/** The canonical fact a provider's earlier event produced, if it committed. */
async function resolveCommittedFactFor(
    supabase: SupabaseClient,
    producer: ResolvedIntegrationProducer,
    providerKey: string,
    externalEventId: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("attendance_integration_events")
        .select("attendance_event_id")
        .eq("provider_key", providerKey)
        .eq("provider_event_id", externalEventId)
        .eq("producer_id", producer.producerId)
        .eq("disposition", "applied")
        .limit(1);
    const row = ((data ?? []) as unknown as Array<{ attendance_event_id: string | null }>)[0];
    return row?.attendance_event_id ?? null;
}
