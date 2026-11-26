/**
 * Rows that recorded the same provider delivery twice, kept as history.
 *
 * Migration 20260813100000 introduced inbound provider-identity uniqueness. It
 * deliberately did NOT delete pre-existing duplicates — a received communication
 * is immutable history even when it arrived twice — and instead moved the later
 * copies' provider identity into metadata so they fall outside the index.
 *
 * Those rows are still `direction = 'inbound'`, so any query that counts or
 * renders inbound messages will pick them up. Shown in a conversation they read
 * as the parent having sent the same thing twice; counted, they inflate unread.
 * That is the very duplication this slice removed, reappearing at the read layer.
 *
 * They are excluded from presentation. They are not deleted.
 */

/** Metadata key stamped by the backfill onto a superseded duplicate. */
export const SUPERSEDED_DUPLICATE_KEY = "superseded_duplicate_provider_message_id";

/** True when this row records a provider delivery already represented by another row. */
export function isSupersededDuplicateMessage(message: {
    metadata?: unknown;
    /** Callers pass whole message rows; this reads only `metadata`. Accepting the
     *  rest avoids an excess-property error on a shape that is only ever read. */
    [key: string]: unknown;
}): boolean {
    const metadata = message?.metadata;
    if (!metadata || typeof metadata !== "object") return false;
    const value = (metadata as Record<string, unknown>)[SUPERSEDED_DUPLICATE_KEY];
    return typeof value === "string" && value.trim().length > 0;
}

/** Conversation history without the duplicate copies of a message already present. */
export function withoutSupersededDuplicates<T extends { metadata?: unknown }>(
    messages: readonly T[]
): T[] {
    return messages.filter((m) => !isSupersededDuplicateMessage(m));
}
