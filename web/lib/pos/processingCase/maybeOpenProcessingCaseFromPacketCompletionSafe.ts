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
import { isPosConnectedSurface } from "@/lib/forms/binding/posConnectedMarker";
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
}): boolean {
    return isPosConnectedSurface({
        definitionMetadata: args.packetDefinitionMetadata,
        linkMetadata: args.packetSessionMetadata,
    });
}

export async function maybeOpenProcessingCaseFromPacketCompletionSafe(
    supabase: SupabaseClient,
    args: { orgId: string; packetSessionId: string }
): Promise<void> {
    try {
        if (!args.packetSessionId) return;

        const { data: session } = await supabase
            .from("form_packet_sessions")
            .select("id, packet_definition_id, metadata")
            .eq("org_id", args.orgId)
            .eq("id", args.packetSessionId)
            .maybeSingle();
        if (!session) return;
        const sessionRow = session as { packet_definition_id?: string | null; metadata?: unknown };

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
