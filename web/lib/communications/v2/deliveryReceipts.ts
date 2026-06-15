/**
 * Communications V2 — receipt-state adapter (PKG-03).
 *
 * PURE, provider-neutral mapping from a communication_messages-shaped row to a canonical
 * receipt state for operator display. No I/O, no provider branching, no UI. Composes with
 * (does NOT replace) the existing web/lib/communications/deliveryStateAdapter.ts; the UI swap
 * happens later in PKG-11 / PKG-13.
 */

export const RECEIPT_STATES = [
    "queued",
    "sent",
    "delivered",
    "opened",
    "clicked",
    "replied",
    "failed",
    "bounced",
] as const;
export type ReceiptState = (typeof RECEIPT_STATES)[number];

/** Minimal row shape; extend as APIs pass more fields. */
export type ReceiptMessageRow = {
    status?: string | null;
    sent_at?: string | null;
    delivered_at?: string | null;
    opened_at?: string | null;
    clicked_at?: string | null;
    replied_at?: string | null;
};

function has(v: unknown): boolean {
    return typeof v === "string" && v.trim().length > 0;
}

/**
 * Highest-progress receipt state for an outbound message.
 * Terminal failure (failed/bounced) takes precedence; otherwise
 * replied > clicked > opened > delivered > sent > queued.
 */
export function receiptStateFromMessage(row: ReceiptMessageRow): ReceiptState {
    const s = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
    if (s.includes("bounce")) return "bounced";
    if (s.includes("fail")) return "failed";
    if (has(row.replied_at)) return "replied";
    if (has(row.clicked_at)) return "clicked";
    if (has(row.opened_at)) return "opened";
    if (has(row.delivered_at)) return "delivered";
    if (has(row.sent_at) || s === "sent" || s === "sent_to_provider" || s === "provider_accepted") return "sent";
    return "queued";
}

/** Ordinal position of a receipt state (for "most advanced" comparisons). */
export function receiptStateRank(state: ReceiptState): number {
    const ladder: ReceiptState[] = ["queued", "sent", "delivered", "opened", "clicked", "replied"];
    const i = ladder.indexOf(state);
    return i === -1 ? ladder.length : i; // failed/bounced sort after the ladder
}
