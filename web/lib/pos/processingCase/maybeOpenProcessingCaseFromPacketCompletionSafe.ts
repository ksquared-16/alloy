/**
 * POS-FP1b — best-effort, marker-gated on-ramp from packet completion.
 *
 * On a POS-connected packet completing, open one Processing Case with the packet
 * session as the primary source. Legacy / unmarked packets are untouched.
 *
 * Best-effort: this NEVER throws and must NEVER break packet completion (mirrors
 * the `emit*Safe` pattern and the FP1 form on-ramp). Any failure is logged + swallowed.
 *
 * Reuses the FP1 Processing Case service (idempotent, one primary) — no new runtime.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPosConnectedMetadata, isPosConnectedSurface } from "@/lib/forms/binding/posConnectedMarker";
import { makeProcessingCaseDbDeps } from "./processingCaseDb";
import { openProcessingCaseFromSource } from "./openProcessingCaseFromSource";

/**
 * Pure decision: should a POS-connected case be opened for this packet?
 * Marker may live on the packet definition metadata and/or the session metadata.
 * Exposed for unit testing without a database.
 */
export function shouldOpenProcessingCaseForPacket(args: {
    packetDefinitionMetadata?: unknown;
    packetSessionMetadata?: unknown;
    /**
     * The metadata of the public link this session was started from.
     *
     * `isPosConnectedSurface` has always accepted a LINK as a marker home; this decision simply
     * never read one, so the only reachable marker was the packet DEFINITION's — written once at
     * creation, with no update route. An organisation that had already built its enrollment packet
     * could never turn Processing on for it.
     *
     * MEASURED on the certification stack: both enrollment packet definitions carry only
     * `{"created_via":"adminV2_packet_definitions"}`. So every completed enrollment packet reached
     * the end of this check and opened nothing — the family's whole return, reviewed and signed,
     * with no case for an operator to act on and no proposals to commit.
     */
    publicLinkMetadata?: unknown;
}): boolean {
    return (
        isPosConnectedSurface({
            definitionMetadata: args.packetDefinitionMetadata,
            linkMetadata: args.packetSessionMetadata,
        }) || isPosConnectedMetadata(args.publicLinkMetadata)
    );
}

export async function maybeOpenProcessingCaseFromPacketCompletionSafe(
    supabase: SupabaseClient,
    args: { orgId: string; packetSessionId: string }
): Promise<void> {
    try {
        if (!args.packetSessionId) return;

        const { data: session } = await supabase
            .from("form_packet_sessions")
            .select("id, packet_definition_id, metadata, started_via_public_link_id")
            .eq("org_id", args.orgId)
            .eq("id", args.packetSessionId)
            .maybeSingle();
        if (!session) return;
        const sessionRow = session as {
            packet_definition_id?: string | null;
            metadata?: unknown;
            started_via_public_link_id?: string | null;
        };

        // The third marker home the doctrine already allows, and the only one an operator-launched
        // enrollment packet can actually carry.
        let publicLinkMetadata: unknown = undefined;
        if (sessionRow.started_via_public_link_id) {
            const { data: link } = await supabase
                .from("form_public_links")
                .select("metadata")
                .eq("org_id", args.orgId)
                .eq("id", sessionRow.started_via_public_link_id)
                .maybeSingle();
            publicLinkMetadata = (link as { metadata?: unknown } | null)?.metadata;
        }

        let packetDefinitionMetadata: unknown = undefined;
        if (sessionRow.packet_definition_id) {
            const { data: def } = await supabase
                .from("form_packet_definitions")
                .select("metadata")
                .eq("org_id", args.orgId)
                .eq("id", sessionRow.packet_definition_id)
                .maybeSingle();
            packetDefinitionMetadata = (def as { metadata?: unknown } | null)?.metadata;
        }

        if (
            !shouldOpenProcessingCaseForPacket({
                packetDefinitionMetadata,
                packetSessionMetadata: sessionRow.metadata,
                publicLinkMetadata,
            })
        ) {
            return;
        }

        const deps = makeProcessingCaseDbDeps(supabase);
        await openProcessingCaseFromSource(deps, {
            orgId: args.orgId,
            sourceKind: "form_packet_session",
            sourceId: args.packetSessionId,
        });
    } catch (e) {
        console.warn(
            "[maybeOpenProcessingCaseFromPacketCompletionSafe]",
            e instanceof Error ? e.message : e
        );
    }
}
