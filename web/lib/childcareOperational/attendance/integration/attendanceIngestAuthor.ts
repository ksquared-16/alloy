/**
 * WHO authored an inbound attendance event.
 *
 * ── ONE INGESTION PATH, TWO KINDS OF AUTHOR ──
 *
 * Attendance used to answer "who is allowed to author this" by reading
 * `attendance_integration_producers`. The Developer Platform answers the same
 * question from an application, an installation and a credential. Two
 * independent authorities for one question is G-14.
 *
 * The convergence is not a second ingestion path. It is this type: ingestion
 * takes a RESOLVED author, and each side resolves its own. Attendance stops
 * knowing how a credential becomes an authority, and the Developer Platform
 * never learns what an attendance fact is.
 *
 *   legacy producer     → resolveIntegrationProducer  ┐
 *                                                     ├→ AttendanceIngestAuthor → ingest
 *   application principal → attendanceAuthorityForPrincipal ┘
 *
 * Both kinds carry the SAME `NonHumanProducerAuthority`, so
 * `assertNonHumanCaptureAllowed` remains the single gate on what may be
 * authored. This type settles identity and correlation only; it grants nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NonHumanProducerAuthority } from "@/lib/childcareOperational/attendance/attendancePermissions";
import { resolveExternalMapping } from "@/lib/childcareOperational/attendance/integration/externalMapping";
import type { ResolvedIntegrationProducer } from "@/lib/childcareOperational/attendance/integration/producerAuthority";
import { resolveIntegrationResourceRef } from "@/lib/platform/external/integrationResourceRefs";

/**
 * The author of an inbound event, already proven.
 *
 * `producerKey` is present on both kinds and is what reaches the canonical fact
 * as `source_key`. It is deliberately stable across credential rotation, so
 * provenance survives a rotation on either side.
 */
export type AttendanceIngestAuthor =
    | {
        kind: "producer";
        /** `attendance_integration_producers.id`. */
        producerId: string;
        orgId: string;
        producerKey: string;
        label: string;
        authority: NonHumanProducerAuthority;
    }
    | {
        kind: "installation";
        /** `app_installations.id`. There is no producer row, and there will not be one. */
        installationId: string;
        orgId: string;
        producerKey: string;
        label: string;
        authority: NonHumanProducerAuthority;
    };

/** Express a legacy resolution as an author, so one shape reaches ingestion. */
export function authorFromLegacyProducer(producer: ResolvedIntegrationProducer): AttendanceIngestAuthor {
    return {
        kind: "producer",
        producerId: producer.producerId,
        orgId: producer.orgId,
        producerKey: producer.producerKey,
        label: producer.label,
        authority: producer.authority,
    };
}

/**
 * The two columns that identify an author on an evidence row.
 *
 * Exactly one is ever set. `attendance_integration_events` carries a CHECK that
 * says so, because the alternative — a null `producer_id` standing in for a
 * Developer Platform author — collides with the UNATTRIBUTED bucket and would
 * both misreport provenance and let one installation's event id evict another's.
 */
export function evidenceIdentityOf(author: AttendanceIngestAuthor): {
    producer_id: string | null;
    installation_id: string | null;
} {
    return author.kind === "producer"
        ? { producer_id: author.producerId, installation_id: null }
        : { producer_id: null, installation_id: author.installationId };
}

export type CorrelationResult =
    | { ok: true; entityType: "child" | "location"; alloyId: string }
    | { ok: false; code: string; detail: string };

/**
 * Turn one of the author's external identifiers into an Alloy resource.
 *
 * Each kind of author owns its own correlation table and neither may read the
 * other's: a legacy producer resolves through `attendance_integration_mappings`,
 * an installation through `integration_resource_refs`. Letting an installation
 * fall back to legacy mappings would re-create the dual authority this replaces,
 * and would let a mapping made for one producer authorize a different caller.
 *
 * Unknown never creates, on either side.
 */
export async function correlateExternalId(params: {
    supabase: SupabaseClient;
    author: AttendanceIngestAuthor;
    entityType: "child" | "location";
    externalId: string;
}): Promise<CorrelationResult> {
    const { supabase, author, entityType, externalId } = params;

    if (author.kind === "producer") {
        const r = await resolveExternalMapping({
            supabase,
            orgId: author.orgId,
            producerId: author.producerId,
            entityType,
            externalId,
        });
        if (!r.ok) return { ok: false, code: r.code, detail: r.detail };
        // Narrowed on the literal, not on a comparison to a variable: a mapping
        // row that resolved as a child must never be read as a room, which is
        // what the typed targets in the schema exist to prevent.
        if (entityType === "child") {
            if (r.entityType !== "child") {
                return {
                    ok: false,
                    code: "mapping_wrong_entity_kind",
                    detail: `The mapping for "${externalId}" does not name a child.`,
                };
            }
            return { ok: true, entityType: "child", alloyId: r.customerMemberId };
        }
        if (r.entityType !== "location") {
            return {
                ok: false,
                code: "mapping_wrong_entity_kind",
                detail: `The mapping for "${externalId}" does not name a location.`,
            };
        }
        return { ok: true, entityType: "location", alloyId: r.locationId };
    }

    const ref = await resolveIntegrationResourceRef({
        supabase,
        installationId: author.installationId,
        orgId: author.orgId,
        resourceType: entityType,
        externalId,
    });
    if (!ref.ok) {
        // Kept in the vocabulary the inbox already speaks, so a disposition means
        // the same thing whichever authority resolved it.
        const detail = ref.code === "ambiguous"
            ? `More than one active mapping claims "${externalId}".`
            : ref.code === "lookup_failed"
                ? `The mapping for "${externalId}" could not be read.`
                : `No active mapping for "${externalId}".`;
        return { ok: false, code: ref.code === "not_mapped" ? "unmapped_external_id" : ref.code, detail };
    }
    return { ok: true, entityType, alloyId: ref.alloyResourceId };
}
