/**
 * WHO authored an inbound attendance event.
 *
 * ── ONE AUTHORITY, WHICH IS THE POINT OF G-14 ──
 *
 * Attendance used to answer "who is allowed to author this" by reading
 * `attendance_integration_producers`, while the Developer Platform answered the
 * same question from an application, an installation and a credential. Two
 * independent authorities for one question WAS G-14.
 *
 * There is now one:
 *
 *   application principal → attendanceAuthorForPrincipal → AttendanceIngestAuthor → ingest
 *
 * The legacy producer kind is gone rather than deprecated. A production census
 * of `alloy_deployed_primary` returned zero producers, zero producer sites, zero
 * mappings and zero producer-attributed events, so the compatibility path was
 * authority nothing held — and a dormant credential path that nobody uses is
 * still a credential path somebody can reach.
 *
 * The author carries a `NonHumanProducerAuthority`, so
 * `assertNonHumanCaptureAllowed` remains the single gate on what may be
 * authored. This type settles identity and correlation only; it grants nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NonHumanProducerAuthority } from "@/lib/childcareOperational/attendance/attendancePermissions";
import { resolveIntegrationResourceRef } from "@/lib/platform/external/integrationResourceRefs";

/**
 * The author of an inbound event, already proven.
 *
 * `producerKey` is present on both kinds and is what reaches the canonical fact
 * as `source_key`. It is deliberately stable across credential rotation, so
 * provenance survives a rotation on either side.
 */
export type AttendanceIngestAuthor = {
    kind: "installation";
    /** `app_installations.id`. There is no producer row, and there will not be one. */
    installationId: string;
    orgId: string;
    producerKey: string;
    label: string;
    authority: NonHumanProducerAuthority;
};

/**
 * The columns that identify an author on an evidence row.
 *
 * `producer_id` is written NULL and stays in the shape deliberately: the table
 * keeps it as historical storage for events legacy producers authored before the
 * retirement, and the CHECK that only one author is ever set still holds. What
 * changed is that nothing can write it again.
 */
export function evidenceIdentityOf(author: AttendanceIngestAuthor): {
    producer_id: string | null;
    installation_id: string | null;
} {
    return { producer_id: null, installation_id: author.installationId };
}

export type CorrelationResult =
    | { ok: true; entityType: "child" | "location"; alloyId: string }
    | { ok: false; code: string; detail: string };

/**
 * Turn one of the author's external identifiers into an Alloy resource.
 *
 * `integration_resource_refs` is the only correlation owner. There is deliberately
 * no fallback to `attendance_integration_mappings`: a fallback would re-create the
 * dual authority this replaces, and would let a mapping made for one producer
 * authorize a different caller.
 *
 * Unknown never creates.
 */
export async function correlateExternalId(params: {
    supabase: SupabaseClient;
    author: AttendanceIngestAuthor;
    entityType: "child" | "location";
    externalId: string;
}): Promise<CorrelationResult> {
    const { supabase, author, entityType, externalId } = params;

    /*
     * ABSENT IS NOT UNKNOWN.
     *
     * "You sent no child identity" and "you sent a child id we do not know" are
     * different facts, and only the first tells an integrator their payload is
     * wrong. The distinction matters most for a door event, where attributing a
     * threshold crossing to whoever is scheduled in the room is the tempting
     * failure -- so a blank id is named as missing rather than folded into
     * unmapped.
     */
    if (!String(externalId ?? "").trim()) {
        return { ok: false, code: "external_id_missing", detail: `No ${entityType} identity was supplied.` };
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
        // the same thing it always did.
        const detail = ref.code === "ambiguous"
            ? `More than one active mapping claims "${externalId}".`
            : ref.code === "lookup_failed"
                ? `The mapping for "${externalId}" could not be read.`
                : `No active mapping for "${externalId}".`;
        return { ok: false, code: ref.code === "not_mapped" ? "unmapped_external_id" : ref.code, detail };
    }
    return { ok: true, entityType, alloyId: ref.alloyResourceId };
}
