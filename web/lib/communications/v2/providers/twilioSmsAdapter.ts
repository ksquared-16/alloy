/** Communications V2 — Twilio SMS adapter (PKG-06). Provider knowledge isolated here. */
import type { DeliveryEventType } from "@/lib/communications/v2/deliveryEvents";
import type { ProviderAdapter } from "./types";

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
};
