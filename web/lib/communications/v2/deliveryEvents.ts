/**
 * Communications V2 — delivery event constants (PKG-03).
 *
 * Provider-NEUTRAL lifecycle event vocabulary + receipt column names for
 * migration 20260611130000_comms_v2_delivery_events_receipts.sql.
 *
 * No provider implementation here: `provider` on an event row is an opaque string.
 * No UI, no send behavior. Ingestion wiring (webhooks/worker) lands in PKG-07 / PKG-16.
 */

export const COMMS_V2_DELIVERY_EVENTS_TABLE = "communication_delivery_events" as const;

/** Canonical, provider-neutral event vocabulary (free text in DB to stay additive). */
export const DELIVERY_EVENT_TYPES = [
    "queued",
    "sent",
    "delivered",
    "opened",
    "clicked",
    "replied",
    "bounced",
    "failed",
    "complaint",
    "inbound",
] as const;
export type DeliveryEventType = (typeof DELIVERY_EVENT_TYPES)[number];

/** Receipt timestamp columns added to communication_messages in PKG-03. */
export const MESSAGE_RECEIPT_COLUMNS = ["opened_at", "clicked_at", "replied_at"] as const;
export type MessageReceiptColumn = (typeof MESSAGE_RECEIPT_COLUMNS)[number];

/** Provider-neutral shape for recording a delivery event (no provider-specific fields). */
export type DeliveryEventInput = {
    org_id: string;
    message_id: string;
    event_type: DeliveryEventType;
    /** Opaque provider tag (e.g. "resend", "twilio"); never branched on in the app layer. */
    provider?: string | null;
    occurred_at?: string;
    payload?: Record<string, unknown>;
};
