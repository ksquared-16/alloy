/**
 * Card 22 — Thin delivery truth adapter: maps persisted message fields to canonical
 * {@link DeliveryState} for operator UI (Card 23). Pure functions — no I/O.
 *
 * Evidence available on messages API today: direction, channel, status, provider, sent_at
 * (see `threads/[threadId]/messages` route). Optional fields kept for forward compatibility
 * when clients pass richer shapes (e.g. provider_message_id).
 */

export type DeliveryState =
    | "queued"
    | "sent_to_provider"
    | "provider_accepted"
    | "delivered"
    | "failed"
    | "bounced"
    | "inbound_received";

/** Minimal shape for {@link mapToDeliveryState}; extend as UI/API pass more fields. */
export type CommunicationMessage = {
    direction?: string | null;
    channel?: string | null;
    status?: string | null;
    provider?: string | null;
    provider_message_id?: string | null;
    /**
     * May include `provider_webhook_events` from delivery webhooks; display logic still keys off
     * {@link delivered_at} and status — do not treat metadata alone as handset delivery proof.
     */
    metadata?: Record<string, unknown> | null;
    /** When set by API, indicates explicit delivery confirmation (webhook / reconciliation). */
    delivered_at?: string | null;
};

function str(v: unknown): string {
    return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * Maps a communication_messages-shaped row to a canonical delivery state for display only.
 * Does not change provider behavior or persistence.
 *
 * Rules (Card 22 slice):
 * - Inbound → inbound_received (inbound SMS may store DB status "delivered"; still show as Received).
 * - Failed / bounced from status when present.
 * - Email: provider_message_id → provider_accepted; without id, outbound email + sent infers provider_accepted
 *   (Resend path sets "sent" only after API acceptance; API may omit id until extended).
 * - SMS outbound "sent" → provider_accepted (Twilio SID path ≠ handset delivery; not delivered).
 * - delivered only with delivered_at or metadata delivery_confirmed, or in_app outbound sent (internal).
 */
export function mapToDeliveryState(message: CommunicationMessage): DeliveryState {
    const dir = str(message.direction);
    const rawStatus = str(message.status);

    if (dir === "inbound") {
        return "inbound_received";
    }

    if (rawStatus === "failed") {
        return "failed";
    }
    if (rawStatus === "bounced" || rawStatus.includes("bounce")) {
        return "bounced";
    }
    if (rawStatus === "queued") {
        return "queued";
    }

    const da = message.delivered_at;
    if (typeof da === "string" && da.trim() !== "") {
        return "delivered";
    }

    const meta = message.metadata;
    if (meta && meta["delivery_confirmed"] === true) {
        return "delivered";
    }

    const ch = str(message.channel);

    if (dir === "outbound" && rawStatus === "sent" && ch === "in_app") {
        return "delivered";
    }

    if (dir === "outbound" && rawStatus === "sent") {
        if (ch === "email") {
            return "provider_accepted";
        }
        if (ch === "sms") {
            return "provider_accepted";
        }
        return "sent_to_provider";
    }

    if (dir === "outbound" && rawStatus === "delivered") {
        return "provider_accepted";
    }

    return "sent_to_provider";
}

export type DeliveryStatePresentation = {
    label: string;
    subtext?: string;
    /** When true, use error/destructive styling in the drawer. */
    highlightFailure?: boolean;
};

/** Card 23 — stable operator copy keyed by canonical state. */
export function deliveryStatePresentation(state: DeliveryState): DeliveryStatePresentation {
    switch (state) {
        case "queued":
            return { label: "Queued" };
        case "sent_to_provider":
            return { label: "Sending…", subtext: "Handoff in progress" };
        case "provider_accepted":
            return { label: "Sent", subtext: "Provider accepted" };
        case "delivered":
            return { label: "Delivered" };
        case "failed":
            return { label: "Failed", highlightFailure: true };
        case "bounced":
            return { label: "Bounced", subtext: "Could not deliver to recipient", highlightFailure: true };
        case "inbound_received":
            return { label: "Received" };
    }
}
