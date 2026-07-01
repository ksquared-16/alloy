// Communications V2 — Messaging Infrastructure P2.
// PURE provider→canonical receipt mapping (no supabase, no I/O) so it is fully unit-testable.
// Translates Resend email events + Twilio SMS statuses into the provider-neutral
// DELIVERY_EVENT_TYPES vocabulary and the communication_message_recipients state columns.

import type { DeliveryEventType } from "@/lib/communications/v2/deliveryEvents";

/** Resend webhook `type` → canonical event (null = no recipient-state mapping). */
export function resendTypeToCanonical(type: string): DeliveryEventType | null {
    switch (type.trim().toLowerCase()) {
        case "email.sent":
            return "sent";
        case "email.delivered":
            return "delivered";
        case "email.opened":
            return "opened";
        case "email.clicked":
            return "clicked";
        case "email.bounced":
            return "bounced";
        case "email.complained":
            return "complaint";
        case "email.failed":
            return "failed";
        default:
            // email.delivery_delayed and anything unknown: no recipient-state transition.
            return null;
    }
}

/** Twilio MessageStatus → canonical event (null = no recipient-state mapping). */
export function twilioStatusToCanonical(status: string): DeliveryEventType | null {
    switch (status.trim().toLowerCase()) {
        case "queued":
        case "accepted":
        case "scheduled":
            return "queued";
        case "sending":
        case "sent":
            return "sent";
        case "delivered":
            return "delivered";
        case "failed":
        case "undelivered":
            return "failed";
        default:
            return null;
    }
}

/** Per-recipient state transition for a canonical event: which timestamp column to stamp + the recipient.status. */
export function recipientStateForEvent(event: DeliveryEventType): {
    field: string | null;
    status: string | null;
} {
    switch (event) {
        case "queued":
            return { field: "queued_at", status: "queued" };
        case "sent":
            return { field: "sent_at", status: "sent" };
        case "delivered":
            return { field: "delivered_at", status: "delivered" };
        case "opened":
            return { field: "opened_at", status: "opened" };
        case "clicked":
            return { field: "clicked_at", status: "clicked" };
        case "bounced":
            return { field: "bounced_at", status: "bounced" };
        case "complaint":
            return { field: "complained_at", status: "complained" };
        case "failed":
            return { field: "failed_at", status: "failed" };
        case "replied":
            return { field: "replied_at", status: "replied" };
        default:
            // inbound / anything without a per-recipient column
            return { field: null, status: null };
    }
}

/** Which communication_messages receipt column (if any) a canonical event stamps. */
export function messageReceiptFieldForEvent(event: DeliveryEventType): "opened_at" | "clicked_at" | "replied_at" | null {
    if (event === "opened") return "opened_at";
    if (event === "clicked") return "clicked_at";
    if (event === "replied") return "replied_at";
    return null;
}

/**
 * Deterministic provider event id for idempotent ingestion.
 * Prefer the provider's own event id; otherwise synthesize from (provider, providerMessageId, event)
 * so a repeated callback for the same transition dedupes to one stored event.
 */
export function resolveProviderEventId(
    provider: string,
    providerMessageId: string,
    event: DeliveryEventType,
    explicit?: string | null,
): string {
    const e = (explicit ?? "").trim();
    if (e) return e;
    return `${provider}:${providerMessageId}:${event}`;
}
