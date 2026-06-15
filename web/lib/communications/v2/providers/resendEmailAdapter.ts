/** Communications V2 — Resend email adapter (PKG-06). Provider knowledge isolated here. */
import type { DeliveryEventType } from "@/lib/communications/v2/deliveryEvents";
import type { ProviderAdapter, ProviderInboundNormalized } from "./types";

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
    normalizeInbound(payload: unknown): ProviderInboundNormalized | null {
        if (!payload || typeof payload !== "object") return null;
        const p = payload as Record<string, unknown>;
        const from = typeof p.from === "string" ? p.from : null;
        const to = typeof p.to === "string" ? p.to : Array.isArray(p.to) && typeof p.to[0] === "string" ? p.to[0] : null;
        const body = typeof p.text === "string" ? p.text : typeof p.html === "string" ? p.html : null;
        if (!from || !to || body == null) return null;
        return {
            channel: "email",
            fromAddress: from,
            toAddress: to,
            subject: typeof p.subject === "string" ? p.subject : null,
            body,
        };
    },
};
