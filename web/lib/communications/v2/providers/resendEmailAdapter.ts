/** Communications V2 — Resend email adapter (PKG-06). Provider knowledge isolated here. */
import type { DeliveryEventType } from "@/lib/communications/v2/deliveryEvents";
import type { ProviderAdapter } from "./types";

const RESEND_EVENT_MAP: Record<string, DeliveryEventType> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.bounced": "bounced",
    "email.complained": "complaint",
};

export const resendEmailAdapter: ProviderAdapter = {
    provider: "resend",
    channel: "email",
    mapStatusEvent(rawEvent: string): DeliveryEventType | null {
        return RESEND_EVENT_MAP[rawEvent.trim().toLowerCase()] ?? null;
    },
};
