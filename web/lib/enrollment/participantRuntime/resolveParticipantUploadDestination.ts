/**
 * Which of THIS session's artifacts asks for the attachment being offered.
 *
 * ## The defect this closes
 *
 * The upload route resolved the ACTIVE artifact and looked the field up in that one schema. That was
 * adequate while attachments were discovered inside the artifact review — the artifact you were
 * reviewing was the active one by definition. It stopped being adequate the moment required evidence
 * moved ahead of preparation, because the parent is now asked for every required document across the
 * packet at once, and only one of the artifacts is active.
 *
 * Observed live: the immunization record on the CIS attached cleanly, and the Oregon Nonmedical
 * Exemption's two attachments were refused with "That is not an attachment on this document" — a
 * true sentence about the wrong document, and a dead end the parent could not act on.
 *
 * ## The authority boundary is unchanged
 *
 * The caller still names a field id and NOTHING else. What kind of document it is, what it is
 * called, and which entity it attaches to are still derived from a PINNED schema this session owns
 * — the search simply covers every artifact the session realized instead of one. A field id that
 * belongs to no artifact of this session still resolves to nothing, so a caller cannot reach a
 * document, a definition or an obligation that is not theirs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPublishedFormEnvelope } from "@/lib/public/forms/loadPublishedFormEnvelope";
import { uploadDestinationForField, type ParticipantUploadRequest } from "@/lib/enrollment/participantRuntime/participantUploadRequests";
import type { FormSchemaV1 } from "@/lib/forms/schema";

export type ParticipantUploadDestination = {
    readonly request: ParticipantUploadRequest;
    readonly formDefinitionId: string;
    readonly versionId: string | null;
};

export async function resolveParticipantUploadDestination(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly sessionId: string; readonly fieldId: string },
): Promise<ParticipantUploadDestination | null> {
    const { data: items } = await supabase
        .from("form_packet_session_items")
        .select("packet_item_id, resolved_form_definition_version_id, status")
        .eq("org_id", input.orgId)
        .eq("packet_session_id", input.sessionId);

    const rows = (items ?? []) as {
        packet_item_id?: string;
        resolved_form_definition_version_id?: string | null;
        status?: string | null;
    }[];
    if (rows.length === 0) return null;

    /*
     * The ACTIVE artifact first.
     *
     * Only an ordering, never a restriction: where two artifacts of one packet happen to carry the
     * same field id, the one the parent is working in is the one they meant. Everything else is
     * still reachable behind it.
     */
    const ordered = [...rows].sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));

    for (const row of ordered) {
        if (!row.packet_item_id) continue;
        const { data: packetItem } = await supabase
            .from("form_packet_items")
            .select("form_definition_id")
            .eq("org_id", input.orgId)
            .eq("id", row.packet_item_id)
            .maybeSingle();
        const formDefinitionId = (packetItem as { form_definition_id?: string } | null)?.form_definition_id;
        if (!formDefinitionId) continue;

        // D-94: the version this session is pinned to, never the definition's latest.
        const envelope = await loadPublishedFormEnvelope(
            supabase,
            input.orgId,
            formDefinitionId,
            row.resolved_form_definition_version_id ?? null,
        );
        if (!envelope) continue;

        const request = uploadDestinationForField(envelope.schemaJson as FormSchemaV1, input.fieldId);
        if (request) {
            return {
                request,
                formDefinitionId,
                versionId: row.resolved_form_definition_version_id ?? null,
            };
        }
    }
    return null;
}
