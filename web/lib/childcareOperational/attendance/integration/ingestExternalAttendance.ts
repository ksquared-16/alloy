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
import { resolveChildMemberEligibility } from "@/lib/records/childMemberEligibility";
import {
    correlateExternalId,
    evidenceIdentityOf,
    type AttendanceIngestAuthor,
} from "@/lib/childcareOperational/attendance/integration/attendanceIngestAuthor";

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
 * Ordered so that nothing is written before it is earned: the author arrives
 * already proven, then evidence is recorded, then identity, then authority, then
 * the canonical command. A request that fails at any step leaves an evidence row
 * explaining why and no attendance truth at all.
 */
export async function ingestExternalAttendanceEvent(params: {
    supabase: SupabaseClient;
    providerKey: string;
    event: NormalizedExternalAttendanceEvent;
    /**
     * An author the CALLER already proved.
     *
     * Ingestion no longer accepts a credential. It used to take
     * `presentedCredential` and resolve a legacy producer for itself, which made
     * Attendance the owner of an authority the Developer Platform also owned —
     * G-14. A production census returned zero legacy producers, so the path was
     * removed rather than deprecated: a dormant credential path is still a
     * credential path.
     *
     * There is therefore no UNATTRIBUTED disposition from this function any more.
     * An unresolvable principal is refused at the request boundary and never
     * reaches ingestion, so "a credential we do not recognise tried to author
     * attendance" is a fact the boundary records, not this inbox.
     */
    author: AttendanceIngestAuthor;
}): Promise<IngestOutcome> {
    const { supabase, event, author } = params;
    const fingerprint = payloadFingerprint(event);


    // ── Evidence first, and idempotently. One inbound event is one row, however
    // many times it is delivered or reprocessed.
    const existing = await supabase
        .from("attendance_integration_events")
        .select("id, disposition, payload_fingerprint, attendance_event_id")
        .eq("provider_key", params.providerKey)
        .eq("provider_event_id", event.externalEventId)
        .eq("installation_id", author.installationId)
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
        author,
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
    const child = await correlateExternalId({
        supabase,
        author,
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
        const loc = await correlateExternalId({
            supabase,
            author,
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
        rooms[field] = loc.alloyId;
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
    /*
     * THE MAPPING RESOLVED A UUID. IT DID NOT PROVE A CHILD.
     *
     * `attendance_integration_mappings.child_customer_member_id` is a foreign key
     * into `customer_members`, and that household table holds adults too. A
     * provider that maps a parent's badge — deliberately or by an operator's
     * honest mistake at mapping time — would otherwise produce a canonical
     * attendance fact saying a CHILD was present because an ADULT moved.
     *
     * The provider's own `entity_type = "child"` is not evidence of this: it
     * describes what the provider believes its identifier means, and the entire
     * point of the boundary is that the provider does not get to describe Alloy's
     * subjects. So the canonical resolver decides, and it fails closed.
     */
    const eligible = await resolveChildMemberEligibility(supabase, author.orgId, child.alloyId);
    if (!eligible.ok) {
        await setDisposition(supabase, evidenceId, "rejected", eligible.code);
        return { disposition: "rejected", evidenceId, code: eligible.code, detail: eligible.message };
    }

    const agreement = await resolveAgreementForChild(supabase, author.orgId, child.alloyId);
    if (!agreement) {
        await setDisposition(supabase, evidenceId, "rejected", "no_enrollment_agreement");
        return { disposition: "rejected", evidenceId, code: "no_enrollment_agreement", detail: "That child has no enrollment agreement to attach attendance to." };
    }
    if (!author.authority.allowedSiteLocationIds.includes(agreement.siteLocationId ?? "")) {
        await setDisposition(supabase, evidenceId, "rejected", "site_not_authorized");
        return {
            disposition: "rejected",
            evidenceId,
            code: "site_not_authorized",
            detail: "This producer is not authorized for that child's site.",
        };
    }
    if (!author.authority.grantedPermissionKeys.includes("attendance.record")) {
        await setDisposition(supabase, evidenceId, "rejected", "capability_not_granted");
        return { disposition: "rejected", evidenceId, code: "capability_not_granted", detail: "This producer may not record attendance." };
    }

    // ── The canonical command. Provenance is derived here, never supplied.
    const actor = {
        actorType: "system" as const,
        actorLabel: author.label,
        sourceType: "integration_api" as const,
        sourceKey: author.producerKey,
    };
    const common = {
        orgId: author.orgId,
        eventAt: event.physicalEventAt,
        serviceDate: serviceDateOf(event.physicalEventAt),
        roomLocationId: rooms.room,
        fromRoomLocationId: rooms.from,
        toRoomLocationId: rooms.to,
        // The provider's event id IS the idempotency identity, so Thread 2's
        // substrate converges a replay that reached the writer.
        idempotencyKey: `${author.producerKey}:${event.externalEventId}`,
        actor,
    };

    try {
        let written;
        if (event.correctsExternalEventId) {
            const target = await resolveCommittedFactFor(supabase, author, params.providerKey, event.correctsExternalEventId);
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
        author: AttendanceIngestAuthor;
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
        org_id: args.author.orgId,
        // Exactly one of producer_id / installation_id is set; the table carries
        // a CHECK saying so, and each has its own partial unique index.
        ...evidenceIdentityOf(args.author),
        presented_producer_key: args.author.producerKey,
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
    author: AttendanceIngestAuthor,
    providerKey: string,
    externalEventId: string,
): Promise<string | null> {
    // A correction may only target a fact THIS installation committed. Scoping by
    // the author's own identity is what stops one installation correcting
    // another's event because the provider reused an id.
    const { data } = await supabase
        .from("attendance_integration_events")
        .select("attendance_event_id")
        .eq("provider_key", providerKey)
        .eq("provider_event_id", externalEventId)
        .eq("disposition", "applied")
        .eq("installation_id", author.installationId)
        .limit(1);
    const row = ((data ?? []) as unknown as Array<{ attendance_event_id: string | null }>)[0];
    return row?.attendance_event_id ?? null;
}
