/** Communications V2 — Twilio SMS adapter (PKG-06). Provider knowledge isolated here. */
import type { DeliveryEventType } from "@/lib/communications/v2/deliveryEvents";
import type { ProviderAdapter, ProviderInboundNormalized } from "./types";

const TWILIO_STATUS_MAP: Record<string, DeliveryEventType> = {
    queued: "queued",
    sending: "sent",
    sent: "sent",
    delivered: "delivered",
    undelivered: "failed",
    failed: "failed",
    received: "inbound",
};

export const twilioSmsAdapter: ProviderAdapter = {
    provider: "twilio",
    channel: "sms",
    mapStatusEvent(rawEvent: string): DeliveryEventType | null {
        return TWILIO_STATUS_MAP[rawEvent.trim().toLowerCase()] ?? null;
    },
    normalizeInbound(payload: unknown): ProviderInboundNormalized | null {
        if (!payload || typeof payload !== "object") return null;
        const p = payload as Record<string, unknown>;
        // Twilio inbound webhook field names (From/To/Body).
        const from = typeof p.From === "string" ? p.From : null;
        const to = typeof p.To === "string" ? p.To : null;
        const body = typeof p.Body === "string" ? p.Body : null;
        if (!from || !to || body == null) return null;
        return { channel: "sms", fromAddress: from, toAddress: to, body };
    },
};
