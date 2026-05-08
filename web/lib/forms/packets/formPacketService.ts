import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import { loadPublishedFormEnvelope, type PublishedFormEnvelope } from "@/lib/public/forms/loadPublishedFormEnvelope";

export type PacketDefinitionItemRow = {
    id: string;
    sequence_index: number;
    form_definition_id: string;
    pinned_form_definition_version_id: string | null;
};

export type PacketSessionRow = {
    id: string;
    org_id: string;
    packet_definition_id: string;
    started_via_public_link_id: string;
    status: string;
    launch_context: Record<string, unknown>;
    crm_snapshot: Record<string, unknown>;
    shared_values: Record<string, unknown>;
    current_sequence_index: number;
};

export type PacketSessionItemRow = {
    id: string;
    packet_session_id: string;
    packet_item_id: string;
    sequence_index: number;
    status: string;
    form_submission_id: string | null;
};

export function shallowMergeSharedValues(
    existing: Record<string, unknown>,
    values: Record<string, unknown>
): Record<string, unknown> {
    return { ...existing, ...values };
}

export function pickLaunchContextForPacketSession(metadata: Record<string, unknown>): Record<string, unknown> {
    const keys = [
        "form_context_mode",
        "packet_definition_id",
        "source_entity_type",
        "source_entity_id",
        "prefill_enabled",
        "prefill_field_map",
        "lead_capture",
        "intake",
        "label",
    ] as const;
    const out: Record<string, unknown> = {};
    for (const k of keys) {
        if (k in metadata) out[k] = metadata[k];
    }
    return out;
}

export function crmSnapshotFromLaunchFks(fks: LaunchFkStamp): Record<string, unknown> {
    return {
        person_id: fks.person_id,
        customer_id: fks.customer_id,
        customer_member_id: fks.customer_member_id,
        opportunity_id: fks.opportunity_id,
    };
}

export async function listPacketDefinitionItems(
    supabase: SupabaseClient,
    orgId: string,
    packetDefinitionId: string
): Promise<{ data: PacketDefinitionItemRow[] | null; error: Error | null }> {
    const { data, error } = await supabase
        .from("form_packet_items")
        .select("id, sequence_index, form_definition_id, pinned_form_definition_version_id")
        .eq("org_id", orgId)
        .eq("packet_definition_id", packetDefinitionId)
        .order("sequence_index", { ascending: true });

    if (error) return { data: null, error: new Error(error.message) };
    return { data: (data ?? []) as PacketDefinitionItemRow[], error: null };
}

/** One session per public link (unique constraint). Materializes all session items (linear V1). */
export async function ensurePacketSessionForPublicLink(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        linkId: string;
        packetDefinitionId: string;
        linkMetadata: Record<string, unknown>;
        launchFks: LaunchFkStamp;
    }
): Promise<{ session: PacketSessionRow; items: PacketSessionItemRow[]; error: Error | null }> {
    const { orgId, linkId, packetDefinitionId, linkMetadata, launchFks } = input;

    const { data: existingSess } = await supabase
        .from("form_packet_sessions")
        .select("*")
        .eq("started_via_public_link_id", linkId)
        .maybeSingle();

    if (existingSess) {
        const sess = existingSess as PacketSessionRow;
        const { data: items } = await supabase
            .from("form_packet_session_items")
            .select("id, packet_session_id, packet_item_id, sequence_index, status, form_submission_id")
            .eq("packet_session_id", sess.id)
            .order("sequence_index", { ascending: true });
        return {
            session: sess,
            items: (items ?? []) as PacketSessionItemRow[],
            error: null,
        };
    }

    const { data: defItems, error: itemsErr } = await listPacketDefinitionItems(supabase, orgId, packetDefinitionId);
    if (itemsErr) return { session: null as never, items: [], error: itemsErr };
    if (!defItems?.length) {
        return { session: null as never, items: [], error: new Error("Packet definition has no steps") };
    }

    const launch_context = pickLaunchContextForPacketSession(linkMetadata);
    const crm_snapshot = crmSnapshotFromLaunchFks(launchFks);

    const { data: insertedSess, error: insErr } = await supabase
        .from("form_packet_sessions")
        .insert({
            org_id: orgId,
            packet_definition_id: packetDefinitionId,
            started_via_public_link_id: linkId,
            status: "in_progress",
            launch_context,
            crm_snapshot,
            shared_values: {},
            current_sequence_index: defItems[0].sequence_index,
            metadata: {},
        })
        .select("*")
        .single();

    if (insErr) {
        if (insErr.code === "23505") {
            const { data: raced } = await supabase
                .from("form_packet_sessions")
                .select("*")
                .eq("started_via_public_link_id", linkId)
                .maybeSingle();
            if (raced) {
                const sessR = raced as PacketSessionRow;
                const { data: itemsR } = await supabase
                    .from("form_packet_session_items")
                    .select("id, packet_session_id, packet_item_id, sequence_index, status, form_submission_id")
                    .eq("packet_session_id", sessR.id)
                    .order("sequence_index", { ascending: true });
                return { session: sessR, items: (itemsR ?? []) as PacketSessionItemRow[], error: null };
            }
        }
        return { session: null as never, items: [], error: new Error(insErr.message) };
    }

    const sess = insertedSess as PacketSessionRow;

    const sessionItemsPayload = defItems.map((di, idx) => ({
        org_id: orgId,
        packet_session_id: sess.id,
        packet_item_id: di.id,
        sequence_index: di.sequence_index,
        status: idx === 0 ? "active" : "pending",
    }));

    const { error: siErr } = await supabase.from("form_packet_session_items").insert(sessionItemsPayload);
    if (siErr) {
        return { session: null as never, items: [], error: new Error(siErr.message) };
    }

    const { data: loadedItems } = await supabase
        .from("form_packet_session_items")
        .select("id, packet_session_id, packet_item_id, sequence_index, status, form_submission_id")
        .eq("packet_session_id", sess.id)
        .order("sequence_index", { ascending: true });

    return { session: sess, items: (loadedItems ?? []) as PacketSessionItemRow[], error: null };
}

export function findActivePacketSessionItem(items: PacketSessionItemRow[]): PacketSessionItemRow | null {
    return items.find((i) => i.status === "active") ?? null;
}

export async function loadPacketDefinitionName(
    supabase: SupabaseClient,
    orgId: string,
    packetDefinitionId: string
): Promise<string | null> {
    const { data } = await supabase
        .from("form_packet_definitions")
        .select("name")
        .eq("id", packetDefinitionId)
        .eq("org_id", orgId)
        .maybeSingle();
    const name = (data as { name?: string } | null)?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
}

export async function resolveActiveStepEnvelope(
    supabase: SupabaseClient,
    orgId: string,
    activeItem: PacketSessionItemRow,
    definitionItems: PacketDefinitionItemRow[]
): Promise<{ envelope: PublishedFormEnvelope | null; error: Error | null }> {
    const defRow = definitionItems.find((d) => d.id === activeItem.packet_item_id);
    if (!defRow) return { envelope: null, error: new Error("Packet step definition missing") };
    const env = await loadPublishedFormEnvelope(supabase, orgId, defRow.form_definition_id, defRow.pinned_form_definition_version_id);
    if (!env) return { envelope: null, error: new Error("No published version for packet step form") };
    return { envelope: env, error: null };
}

export type AdvancePacketResult = {
    packet_complete: boolean;
    next_form_available: boolean;
    next_sequence_index: number | null;
};

export async function advancePacketSessionAfterSubmit(
    supabase: SupabaseClient,
    orgId: string,
    submissionId: string,
    submittedValues: Record<string, unknown>
): Promise<{ result: AdvancePacketResult | null; error: Error | null }> {
    const { data: row, error: findErr } = await supabase
        .from("form_packet_session_items")
        .select("id, packet_session_id, sequence_index, status")
        .eq("form_submission_id", submissionId)
        .maybeSingle();

    if (findErr) return { result: null, error: new Error(findErr.message) };
    if (!row) return { result: null, error: null };

    const itemId = (row as { id: string }).id;
    const packetSessionId = (row as { packet_session_id: string }).packet_session_id;
    const curSeq = (row as { sequence_index: number }).sequence_index;

    const { data: sessionRow, error: sessLoadErr } = await supabase
        .from("form_packet_sessions")
        .select("*")
        .eq("id", packetSessionId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (sessLoadErr) return { result: null, error: new Error(sessLoadErr.message) };
    const session = sessionRow as PacketSessionRow | null;
    if (!session) return { result: null, error: new Error("Packet session not found") };

    if (session.status !== "in_progress") {
        return {
            result: { packet_complete: true, next_form_available: false, next_sequence_index: null },
            error: null,
        };
    }

    const shared = shallowMergeSharedValues(
        (session.shared_values ?? {}) as Record<string, unknown>,
        submittedValues
    );

    const now = new Date().toISOString();

    const { error: upItemErr } = await supabase
        .from("form_packet_session_items")
        .update({ status: "submitted", submitted_at: now })
        .eq("id", itemId)
        .eq("org_id", orgId);

    if (upItemErr) return { result: null, error: new Error(upItemErr.message) };

    const { data: allItems, error: listErr } = await supabase
        .from("form_packet_session_items")
        .select("id, sequence_index, status")
        .eq("packet_session_id", packetSessionId)
        .eq("org_id", orgId)
        .order("sequence_index", { ascending: true });

    if (listErr) return { result: null, error: new Error(listErr.message) };

    const sorted = (allItems ?? []) as { id: string; sequence_index: number; status: string }[];
    const nextPending = sorted.find((i) => i.sequence_index > curSeq && i.status === "pending");

    if (nextPending) {
        const { error: actErr } = await supabase
            .from("form_packet_session_items")
            .update({ status: "active" })
            .eq("id", nextPending.id)
            .eq("org_id", orgId);

        if (actErr) return { result: null, error: new Error(actErr.message) };

        const { error: sessErr } = await supabase
            .from("form_packet_sessions")
            .update({
                shared_values: shared,
                current_sequence_index: nextPending.sequence_index,
                updated_at: now,
            })
            .eq("id", packetSessionId)
            .eq("org_id", orgId);

        if (sessErr) return { result: null, error: new Error(sessErr.message) };

        return {
            result: {
                packet_complete: false,
                next_form_available: true,
                next_sequence_index: nextPending.sequence_index,
            },
            error: null,
        };
    }

    const { error: doneErr } = await supabase
        .from("form_packet_sessions")
        .update({
            shared_values: shared,
            status: "completed",
            completed_at: now,
            updated_at: now,
        })
        .eq("id", packetSessionId)
        .eq("org_id", orgId);

    if (doneErr) return { result: null, error: new Error(doneErr.message) };

    return {
        result: {
            packet_complete: true,
            next_form_available: false,
            next_sequence_index: null,
        },
        error: null,
    };
}
