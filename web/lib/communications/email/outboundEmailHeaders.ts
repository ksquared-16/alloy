/**
 * RFC threading headers on an outbound email, from the TypeScript side.
 *
 * WHY THIS EXISTS: the headers were implemented once, in the Python dispatcher
 * (`backend/app/services/communications/email_thread_headers.py`), and the
 * TypeScript delivery path — `deliverQueuedEmailHtml`, which the family-send
 * route PREFERS whenever Resend credentials are present in the Next process —
 * sent none of them and persisted no `email_message_id`. So on the path operator
 * sends actually take, outbound mail carried no `Message-ID`, and inbound
 * correlation by `In-Reply-To` could never match anything: there was nothing of
 * ours for a parent's client to echo.
 *
 * That is not a threading nicety. `resolveEmailThread` ranks `in_reply_to` above
 * everything else, so the strongest correlation evidence Alloy has was
 * structurally unavailable, and every reply fell through to the weakest rule —
 * endpoint provenance — which goes ambiguous the moment a parent has two
 * conversations open.
 *
 * This mirrors the Python module rather than replacing it. Both runtimes deliver
 * mail, so both must produce the same headers; `outboundEmailHeadersParity.test.ts`
 * runs a shared fixture list through this and the recorded Python behaviour, the
 * same arrangement `emailMessageIdParity.test.ts` already uses for the id format.
 *
 * Pure: values in, headers out. The I/O that reads conversation history lives
 * with the delivery call.
 */

/** Beyond this, clients gain nothing and headers get unwieldy. Mirrors MAX_REFERENCES. */
export const MAX_REFERENCES = 20;

/** One email message's threading facts, as canonical history holds them. */
export type ThreadHeaderHistoryRow = {
    /** The RFC Message-ID on that message. Rows without one are not evidence. */
    email_message_id?: string | null;
    /** `inbound` | `outbound`. */
    direction?: string | null;
};

export type OutboundThreadHeaders = {
    /** The Message-ID of the message being answered, or null on a first outbound. */
    inReplyTo: string | null;
    /** The chain, oldest first, or null when there is no history. */
    references: string | null;
};

/**
 * The `References` value for a reply, oldest first.
 *
 * Deduplicated while preserving order, with the message being answered LAST —
 * mail clients read the final entry as the immediate parent.
 *
 * The chain GROWS rather than being replaced. Replacing it splits a long
 * conversation in the parent's client even though Alloy still sees one thread.
 * When capped, both ends are kept: the root and the immediate ancestor are what
 * threading actually relies on.
 */
export function buildReferencesChain(
    priorMessageIds: readonly string[],
    inReplyTo: string | null
): string | null {
    const chain: string[] = [];
    for (const raw of priorMessageIds) {
        const mid = String(raw ?? "").trim();
        if (mid && !chain.includes(mid)) chain.push(mid);
    }
    if (inReplyTo && !chain.includes(inReplyTo)) chain.push(inReplyTo);
    if (chain.length === 0) return null;
    if (chain.length > MAX_REFERENCES) {
        const keepHead = Math.floor(MAX_REFERENCES / 2);
        return [...chain.slice(0, keepHead), ...chain.slice(-(MAX_REFERENCES - keepHead))].join(" ");
    }
    return chain.join(" ");
}

/**
 * Derive `In-Reply-To` and `References` from a conversation's email history,
 * which the caller supplies in ascending `created_at` order.
 *
 * `In-Reply-To` is the most recent INBOUND message, never our own last outbound:
 * naming our own message tells the parent's client this is a reply to ourselves,
 * which is both wrong and visibly odd in their thread view.
 *
 * Nothing is fabricated. A conversation with no inbound history yields a null
 * `In-Reply-To`, and a first outbound carries neither header — which is correct,
 * not a gap to fill.
 */
export function deriveOutboundThreadHeaders(
    history: readonly ThreadHeaderHistoryRow[]
): OutboundThreadHeaders {
    const prior: string[] = [];
    let latestInbound: string | null = null;
    for (const row of history) {
        const mid = String(row?.email_message_id ?? "").trim();
        if (!mid) continue;
        prior.push(mid);
        if (String(row?.direction ?? "").trim().toLowerCase() === "inbound") latestInbound = mid;
    }
    return { inReplyTo: latestInbound, references: buildReferencesChain(prior, latestInbound) };
}

/**
 * The header map for the provider, omitting anything absent.
 *
 * Omission is deliberate everywhere: a header that looks authoritative and
 * correlates to nothing is worse than no header, which is the same rule
 * `mintOutboundMessageId` follows when it refuses rather than inventing.
 */
export function outboundEmailHeaders(params: {
    messageId: string | null;
    inReplyTo: string | null;
    references: string | null;
}): Record<string, string> {
    const out: Record<string, string> = {};
    if (params.messageId) out["Message-ID"] = params.messageId;
    if (params.inReplyTo) out["In-Reply-To"] = params.inReplyTo;
    if (params.references) out["References"] = params.references;
    return out;
}
