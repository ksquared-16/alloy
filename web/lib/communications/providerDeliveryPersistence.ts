import type { SupabaseClient } from "@supabase/supabase-js";

function appendWebhookEvent(
    existing: Record<string, unknown> | null | undefined,
    event: Record<string, unknown>,
): Record<string, unknown> {
    const base = existing && typeof existing === "object" ? { ...existing } : {};
    const prev = Array.isArray(base.provider_webhook_events) ? [...(base.provider_webhook_events as unknown[])] : [];
    prev.push({ received_at: new Date().toISOString(), ...event });
    base.provider_webhook_events = prev.slice(-30);
    return base;
}

export type ProviderDeliveryApplyResult =
    | { ok: true; message_id: string; updated: string[] }
    | { ok: false; reason: string };

/**
 * Locates an outbound canonical row by provider external id and merges delivery truth (no fake delivered_at).
 */
export async function applyOutboundProviderDeliveryPatch(params: {
    supabase: SupabaseClient;
    providerMessageId: string;
    patch: {
        status?: string;
        delivered_at?: string | null;
        metadata_event?: Record<string, unknown>;
    };
}): Promise<ProviderDeliveryApplyResult> {
    const pid = params.providerMessageId.trim();
    if (!pid) return { ok: false, reason: "missing_provider_message_id" };

    const { data: byCol, error: e1 } = await params.supabase
        .from("communication_messages")
        .select("id, org_id, direction, metadata, status, delivered_at")
        .eq("provider_message_id", pid)
        .maybeSingle();

    if (e1) return { ok: false, reason: e1.message };

    const row = byCol;
    if (!row || (row as { direction?: string }).direction !== "outbound") {
        return { ok: false, reason: "message_not_found_or_not_outbound" };
    }

    const id = String((row as { id: string }).id);
    const meta = (row as { metadata?: Record<string, unknown> | null }).metadata;
    let nextMeta: Record<string, unknown> = meta && typeof meta === "object" ? { ...meta } : {};
    if (params.patch.metadata_event) {
        nextMeta = appendWebhookEvent(nextMeta, params.patch.metadata_event);
    }

    const updates: Record<string, unknown> = {
        metadata: nextMeta,
    };
    const applied: string[] = ["metadata"];

    if (params.patch.status) {
        updates.status = params.patch.status;
        applied.push("status");
    }
    if (params.patch.delivered_at !== undefined) {
        updates.delivered_at = params.patch.delivered_at;
        applied.push("delivered_at");
    }

    const { error: upErr } = await params.supabase.from("communication_messages").update(updates).eq("id", id);
    if (upErr) return { ok: false, reason: upErr.message };

    return { ok: true, message_id: id, updated: applied };
}
