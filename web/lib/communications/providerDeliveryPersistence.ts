import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryEventType } from "@/lib/communications/v2/deliveryEvents";
import {
    messageReceiptFieldForEvent,
    recipientStateForEvent,
    resolveProviderEventId,
} from "@/lib/communications/v2/deliveryReceiptMapping";

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

/** Provider-neutral receipt record. Presence triggers append-only event + per-recipient persistence (P2). */
export type ProviderReceiptRecord = {
    provider: string; // "resend" | "twilio" (opaque)
    channel: string; // "email" | "sms"
    event_type: DeliveryEventType; // canonical vocabulary
    event_status?: string | null; // raw provider status string
    provider_event_id?: string | null; // provider's own event id; synthesized if absent (idempotency)
    occurred_at?: string; // event time (defaults to now)
    raw_payload?: Record<string, unknown>;
};

export type ProviderDeliveryApplyResult =
    | {
          ok: true;
          message_id: string;
          updated: string[];
          event_recorded?: boolean;
          event_idempotent?: boolean;
          recipient_updated?: boolean;
          receipt_error?: string;
      }
    | { ok: false; reason: string };

function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
    if (!err) return false;
    if (err.code === "23505") return true;
    return /duplicate key|unique constraint/i.test(err.message ?? "");
}

/**
 * Records an append-only delivery event (idempotent by provider event identity) and upserts the
 * per-recipient state for an outbound message. Best-effort: a receipt-persistence failure never
 * fails the (already-applied) message patch — it is reported in the result for logging.
 */
async function persistReceipt(
    supabase: SupabaseClient,
    args: { orgId: string; messageId: string; providerMessageId: string; receipt: ProviderReceiptRecord },
): Promise<{ event_recorded: boolean; event_idempotent: boolean; recipient_updated: boolean; error?: string }> {
    const { orgId, messageId, providerMessageId, receipt } = args;
    const occurredAt = receipt.occurred_at ?? new Date().toISOString();
    const nowIso = new Date().toISOString();
    const eventId = resolveProviderEventId(
        receipt.provider,
        providerMessageId,
        receipt.event_type,
        receipt.provider_event_id,
    );

    // 1) Idempotency precheck by (provider, provider_event_id).
    let idempotent = false;
    const { data: existing, error: exErr } = await supabase
        .from("communication_delivery_events")
        .select("id")
        .eq("provider", receipt.provider)
        .eq("provider_event_id", eventId)
        .limit(1)
        .maybeSingle();
    if (exErr) return { event_recorded: false, event_idempotent: false, recipient_updated: false, error: exErr.message };
    if (existing) idempotent = true;

    let eventRecorded = false;
    if (!idempotent) {
        const { error: insErr } = await supabase.from("communication_delivery_events").insert({
            org_id: orgId,
            message_id: messageId,
            event_type: receipt.event_type,
            provider: receipt.provider,
            channel: receipt.channel,
            provider_message_id: providerMessageId,
            provider_event_id: eventId,
            event_status: receipt.event_status ?? null,
            occurred_at: occurredAt,
            received_at: nowIso,
            payload: receipt.raw_payload ?? {},
            raw_payload: receipt.raw_payload ?? {},
            metadata: {},
        });
        if (insErr) {
            if (isUniqueViolation(insErr)) {
                idempotent = true; // race: another delivery of the same event landed first
            } else {
                return { event_recorded: false, event_idempotent: false, recipient_updated: false, error: insErr.message };
            }
        } else {
            eventRecorded = true;
        }
    }

    // 2) Per-recipient state. Idempotent transitions are safe to re-apply (same timestamps).
    const { field, status } = recipientStateForEvent(receipt.event_type);
    const recipUpdate: Record<string, unknown> = {
        last_event_at: occurredAt,
        provider: receipt.provider,
        channel: receipt.channel,
        provider_message_id: providerMessageId,
    };
    if (status) recipUpdate.status = status;
    if (field) recipUpdate[field] = occurredAt;

    const { error: recErr } = await supabase
        .from("communication_message_recipients")
        .update(recipUpdate)
        .eq("message_id", messageId);
    if (recErr) {
        return { event_recorded: eventRecorded, event_idempotent: idempotent, recipient_updated: false, error: recErr.message };
    }

    return { event_recorded: eventRecorded, event_idempotent: idempotent, recipient_updated: true };
}

/**
 * Locates an outbound canonical row by provider external id and merges delivery truth (no fake delivered_at).
 * When `patch.receipt` is supplied, also records an append-only delivery event (idempotent) and upserts
 * per-recipient state. Receipt persistence is gated on that field so legacy callers are unaffected.
 */
export async function applyOutboundProviderDeliveryPatch(params: {
    supabase: SupabaseClient;
    providerMessageId: string;
    patch: {
        status?: string;
        delivered_at?: string | null;
        opened_at?: string | null;
        clicked_at?: string | null;
        replied_at?: string | null;
        metadata_event?: Record<string, unknown>;
        receipt?: ProviderReceiptRecord;
    };
}): Promise<ProviderDeliveryApplyResult> {
    const pid = params.providerMessageId.trim();
    if (!pid) return { ok: false, reason: "missing_provider_message_id" };

    const { data: byCol, error: e1 } = await params.supabase
        .from("communication_messages")
        .select("id, org_id, direction, metadata, status, delivered_at, opened_at, clicked_at, replied_at")
        .eq("provider_message_id", pid)
        .maybeSingle();

    if (e1) return { ok: false, reason: e1.message };

    const row = byCol;
    if (!row || (row as { direction?: string }).direction !== "outbound") {
        return { ok: false, reason: "message_not_found_or_not_outbound" };
    }

    const id = String((row as { id: string }).id);
    const orgId = String((row as { org_id: string }).org_id);
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
    // First-touch receipt timestamps on the message (do not overwrite an existing value).
    const stampIfEmpty = (col: "opened_at" | "clicked_at" | "replied_at", val: string | null | undefined) => {
        if (val === undefined) return;
        const current = (row as Record<string, unknown>)[col];
        if (!current) {
            updates[col] = val;
            applied.push(col);
        }
    };
    stampIfEmpty("opened_at", params.patch.opened_at);
    stampIfEmpty("clicked_at", params.patch.clicked_at);
    stampIfEmpty("replied_at", params.patch.replied_at);

    const { error: upErr } = await params.supabase.from("communication_messages").update(updates).eq("id", id);
    if (upErr) return { ok: false, reason: upErr.message };

    if (!params.patch.receipt) {
        return { ok: true, message_id: id, updated: applied };
    }

    const rec = await persistReceipt(params.supabase, {
        orgId,
        messageId: id,
        providerMessageId: pid,
        receipt: params.patch.receipt,
    });
    return {
        ok: true,
        message_id: id,
        updated: applied,
        event_recorded: rec.event_recorded,
        event_idempotent: rec.event_idempotent,
        recipient_updated: rec.recipient_updated,
        ...(rec.error ? { receipt_error: rec.error } : {}),
    };
}

// Re-export so route handlers can build receipts from the canonical mapping in one import.
export { messageReceiptFieldForEvent };
