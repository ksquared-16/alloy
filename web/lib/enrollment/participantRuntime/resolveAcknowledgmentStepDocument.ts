/**
 * The document a family is being asked to READ on the session's current step, if any.
 *
 * ## Why one resolver rather than two
 *
 * Two surfaces need this answer — the route that streams the document on its own, and the artifact
 * review that a parent signs from. If they resolved it separately they could disagree, and the
 * disagreement would be invisible: the parent would read one thing and sign another. One function,
 * one answer.
 *
 * ## What it refuses to do
 *
 * It takes no document id from anywhere but the step's own stored configuration. A participant
 * cannot name a document, and neither can a caller — the session's active item names its packet
 * item, and the packet item names the file. That is the same anchoring every sibling participant
 * route uses, and it is the reason a token cannot be turned into a reader for another org's files.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readPacketStepConfig } from "@/lib/forms/packets/packetStepKind";

export type AcknowledgmentStepDocument = {
    readonly documentId: string;
    /** What the family is told they are agreeing to. */
    readonly stepLabel: string | null;
    readonly requiresSignature: boolean;
};

/**
 * @returns the acknowledgment document for the active step, or null when the step is not an
 * acknowledgment — which is the ordinary case and not an error.
 */
export async function resolveAcknowledgmentStepDocument(
    supabase: SupabaseClient,
    input: { orgId: string; sessionId: string },
): Promise<AcknowledgmentStepDocument | null> {
    const { data: item } = await supabase
        .from("form_packet_session_items")
        .select("packet_item_id")
        .eq("org_id", input.orgId)
        .eq("packet_session_id", input.sessionId)
        .eq("status", "active")
        .maybeSingle();
    const packetItemId = (item as { packet_item_id?: string } | null)?.packet_item_id;
    if (!packetItemId) return null;

    const { data: packetItem } = await supabase
        .from("form_packet_items")
        .select("metadata")
        .eq("org_id", input.orgId)
        .eq("id", packetItemId)
        .maybeSingle();

    const config = readPacketStepConfig((packetItem as { metadata?: unknown } | null)?.metadata);
    if (config.kind !== "document_acknowledgment" || !config.acknowledgmentDocumentId) return null;

    return {
        documentId: config.acknowledgmentDocumentId,
        stepLabel: config.label,
        requiresSignature: config.requiresSignature,
    };
}
