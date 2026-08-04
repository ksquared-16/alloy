import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCommunicationMessageEventTitle } from "@/lib/admin/activityMessageEventLabels";

type WorkflowEventRow = {
    id: string;
    occurred_at: string;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    action_type: string | null;
    payload: unknown;
};

// Delivery/failure events need the channel backfilled too, or an SMS reads as a generic
// "Message delivered" instead of "SMS delivered".
const MESSAGE_EVENT_TYPES = new Set([
    "message_sent",
    "message_received",
    "message_queued",
    "message_delivered",
    "message_failed",
    // Policy outcomes carry a channel too — and the channel IS the finding when
    // one channel is refused and another goes out, which is exactly the case the
    // Tour certification hit: email queued, SMS blocked.
    "message_blocked",
    "message_deferred",
]);

function readPayloadRecord(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    return payload as Record<string, unknown>;
}

function readChannel(payload: Record<string, unknown>): string {
    const direct = payload.channel;
    if (typeof direct === "string" && direct.trim()) return direct.trim().toLowerCase();
    const meta = payload.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const nested = (meta as Record<string, unknown>).channel;
        if (typeof nested === "string" && nested.trim()) return nested.trim().toLowerCase();
    }
    return "";
}

/**
 * Attach canonical `communication_messages.channel` to message lifecycle workflow_events when missing.
 */
export async function enrichActivityEventsWithCommunicationChannels(
    supabase: SupabaseClient,
    orgId: string,
    rows: WorkflowEventRow[]
): Promise<WorkflowEventRow[]> {
    if (!rows.length) return rows;

    const messageIds = new Set<string>();
    for (const row of rows) {
        const et = (row.event_type ?? "").trim().toLowerCase();
        if (!MESSAGE_EVENT_TYPES.has(et)) continue;
        const payload = readPayloadRecord(row.payload);
        if (readChannel(payload)) continue;
        const id = payload.communication_message_id;
        if (id != null && String(id).trim()) messageIds.add(String(id).trim());
    }

    if (messageIds.size === 0) return rows;

    const { data, error } = await supabase
        .from("communication_messages")
        .select("id, channel, metadata")
        .eq("org_id", orgId)
        .in("id", [...messageIds]);

    if (error || !data?.length) return rows;

    const channelByMessageId = new Map<string, string>();
    for (const row of data) {
        const id = String((row as { id?: string }).id ?? "").trim();
        const ch = String((row as { channel?: string }).channel ?? "").trim().toLowerCase();
        if (!id || !ch) continue;
        channelByMessageId.set(id, ch);
    }

    return rows.map((row) => {
        const et = (row.event_type ?? "").trim().toLowerCase();
        if (!MESSAGE_EVENT_TYPES.has(et)) return row;
        const payload = readPayloadRecord(row.payload);
        if (readChannel(payload)) return row;
        const messageId = payload.communication_message_id != null ? String(payload.communication_message_id).trim() : "";
        const channel = messageId ? channelByMessageId.get(messageId) : undefined;
        if (!channel) return row;
        return {
            ...row,
            payload: {
                ...payload,
                channel,
            },
        };
    });
}

/** Test helper — title after enrichment semantics. */
export function activityEventDisplayTitle(eventType: string | null, payload: Record<string, unknown>): string {
    return resolveCommunicationMessageEventTitle(eventType, payload) ?? eventType ?? "Event";
}
