import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPublishedFormEnvelope } from "@/lib/public/forms/loadPublishedFormEnvelope";
import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";
import {
    createEphemeralParticipantClient,
    type EphemeralSessionHolder,
} from "@/lib/enrollment/participantPreview/ephemeralParticipantClient";

/**
 * A packet session that exists only in this process.
 *
 * ## Why it mirrors `createPacketSession` rather than simplifying
 *
 * The runtime does not take "a packet definition" — it takes a SESSION, its ordered items, and the
 * Form version pinned to each. Handing it anything less faithful would produce a preview that
 * diverges from production in exactly the places that matter: which version's questions a family
 * sees, and which step is active. So the two reads that decide those — the definition's ordered
 * items, and `loadPublishedFormEnvelope` per step — are the SAME reads session realization does,
 * with the same pinned-version-wins rule (D-94). Only the writes are different: there are none.
 *
 * ## Fails closed on an unpublishable step, like the real thing
 *
 * `createPacketSession` refuses to create a session when a step has no published version, because
 * a parent would otherwise break partway through after answering questions. Preview refuses for
 * the same reason and says which step: an administrator previewing a packet they cannot send
 * should be told that, not shown a conversation that could never happen.
 */

export type PreviewBootstrap = {
    /** Client-shaped: real reads, in-memory writes for the three conversational tables. */
    readonly db: SupabaseClient;
    readonly holder: EphemeralSessionHolder;
    readonly session: PacketSessionRow;
    readonly packetName: string;
};

export type PreviewBootstrapResult =
    | { ok: true; value: PreviewBootstrap }
    | { ok: false; error: { code: string; message: string } };

type DefinitionItem = {
    id: string;
    sequence_index: number;
    form_definition_id: string;
    pinned_form_definition_version_id?: string | null;
};

export async function bootstrapPreviewSession(
    real: SupabaseClient,
    input: { orgId: string; packetDefinitionId: string },
): Promise<PreviewBootstrapResult> {
    const { orgId, packetDefinitionId } = input;

    const { data: defRow } = await real
        .from("form_packet_definitions")
        .select("name")
        .eq("id", packetDefinitionId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!defRow) return { ok: false, error: { code: "PACKET_NOT_FOUND", message: "Packet not found." } };

    const { data: itemRows, error: itemErr } = await real
        .from("form_packet_items")
        .select("id, sequence_index, form_definition_id, pinned_form_definition_version_id")
        .eq("org_id", orgId)
        .eq("packet_definition_id", packetDefinitionId)
        .order("sequence_index", { ascending: true });
    if (itemErr) return { ok: false, error: { code: "READ_FAILED", message: itemErr.message } };

    const defItems = (itemRows ?? []) as DefinitionItem[];
    if (!defItems.length) {
        return { ok: false, error: { code: "EMPTY_PACKET", message: "This packet has no steps to preview yet." } };
    }

    // Same resolution rule as session realization: a definition-level pin wins, otherwise the
    // currently published version. Read-only.
    const versionByItemId = new Map<string, string>();
    for (const di of defItems) {
        const envelope = await loadPublishedFormEnvelope(
            real,
            orgId,
            di.form_definition_id,
            di.pinned_form_definition_version_id ?? null,
        );
        if (!envelope) {
            return {
                ok: false,
                error: {
                    code: "STEP_NOT_PUBLISHED",
                    message:
                        `Step ${di.sequence_index + 1} has no published version, so a family could not ` +
                        `complete this packet yet. Publish it and preview again.`,
                },
            };
        }
        versionByItemId.set(di.id, envelope.formDefinitionVersionId);
    }

    const sessionId = `preview-${randomUUID()}`;
    const session: PacketSessionRow = {
        id: sessionId,
        org_id: orgId,
        packet_definition_id: packetDefinitionId,
        // Named rather than faked: no public link is minted, and nothing resolves this id.
        started_via_public_link_id: `preview-link-${randomUUID()}`,
        status: "in_progress",
        launch_context: { preview: true },
        // Generic family: preview begins with nothing on file, and says so, rather than
        // manufacturing "known information" that would misrepresent what Alloy actually reuses.
        crm_snapshot: {},
        shared_values: {},
        current_sequence_index: defItems[0]!.sequence_index,
        process_instance_id: null,
    };

    const holder: EphemeralSessionHolder = {
        row: session,
        tables: {
            form_packet_sessions: [session as unknown as Record<string, unknown>],
            form_packet_session_items: defItems.map((di, idx) => ({
                id: `preview-item-${di.id}`,
                org_id: orgId,
                packet_session_id: sessionId,
                packet_item_id: di.id,
                sequence_index: di.sequence_index,
                status: idx === 0 ? "active" : "pending",
                form_submission_id: null,
                resolved_form_definition_version_id: versionByItemId.get(di.id) ?? null,
            })),
            form_submissions: [],
        },
    };

    return {
        ok: true,
        value: {
            db: createEphemeralParticipantClient(real, holder),
            holder,
            session,
            packetName: String((defRow as { name?: string }).name ?? "Packet"),
        },
    };
}
