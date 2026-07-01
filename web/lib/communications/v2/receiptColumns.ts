// Communications V2 — Messaging Infrastructure P1.
// Column contracts for the ADDITIVE receipt-column migration
// (20260613120000_comms_v2_receipt_columns.sql). These extend the existing
// communication_delivery_events (PKG-03) and communication_message_recipients (PKG-04)
// tables — no new tables. Kept in sync with the migration by commsV2ReceiptColumnsSchema.test.ts.

/** Columns added to communication_delivery_events for provider/recipient identity + idempotency. */
export const DELIVERY_EVENT_EXTRA_COLUMNS = [
    "recipient_id",
    "channel",
    "provider_message_id",
    "provider_event_id",
    "event_status",
    "received_at",
    "raw_payload",
    "metadata",
] as const;

/** Columns added to communication_message_recipients for per-recipient delivery state + linkage. */
export const MESSAGE_RECIPIENT_DELIVERY_COLUMNS = [
    "recipient_key",
    "channel",
    "provider",
    "provider_message_id",
    "queued_at",
    "sent_at",
    "bounced_at",
    "complained_at",
    "failed_at",
    "last_event_at",
] as const;

/** Idempotency: a delivery event is unique per (provider, provider_event_id) when the provider supplies one. */
export const DELIVERY_EVENT_IDEMPOTENCY_INDEX = "uq_comm_delivery_events_provider_event";

export type DeliveryEventExtraColumn = (typeof DELIVERY_EVENT_EXTRA_COLUMNS)[number];
export type MessageRecipientDeliveryColumn = (typeof MESSAGE_RECIPIENT_DELIVERY_COLUMNS)[number];
