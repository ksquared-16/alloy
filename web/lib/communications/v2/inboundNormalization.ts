/**
 * Communications V2 — inbound normalization (PKG-07).
 *
 * PURE, provider-neutral helpers that turn an adapter-normalized inbound payload
 * (see providers/types ProviderInboundNormalized) into a canonical communication_messages
 * draft, plus reply-matching for receipt (replied_at) updates. No I/O, no route, no DB.
 *
 * The webhook route + actual persistence are deferred to a real-gate-validated step; inbound
 * email also needs a chosen receiving provider (not established in the repo). This module is the
 * testable core those wrappers will consume. Final wiring should reuse the canonical
 * `@/lib/communications/recipientKey` util in place of the local key normalizer below.
 */

import type { ProviderInboundNormalized } from "@/lib/communications/v2/providers/types";

export type InboundMessageDraft = {
    channel: "email" | "sms";
    direction: "inbound";
    status: "received";
    from_address: string;
    to_address: string;
    subject: string | null;
    body: string;
    body_format: "plain" | "html";
    recipient_key: string;
};

/** Person-first thread key for the EXTERNAL party (the inbound sender). Pure, local approximation. */
export function normalizeInboundRecipientKey(channel: "email" | "sms", address: string): string {
    const a = address.trim();
    return channel === "email" ? a.toLowerCase() : a;
}

function looksLikeHtml(body: string): boolean {
    return /<[a-z][\s\S]*>/i.test(body);
}

/** Build a canonical inbound message draft from an adapter-normalized payload. */
export function buildInboundMessageDraft(n: ProviderInboundNormalized): InboundMessageDraft {
    return {
        channel: n.channel,
        direction: "inbound",
        status: "received",
        from_address: n.fromAddress,
        to_address: n.toAddress,
        subject: n.subject ?? null,
        body: n.body,
        body_format: n.channel === "email" && looksLikeHtml(n.body) ? "html" : "plain",
        recipient_key: normalizeInboundRecipientKey(n.channel, n.fromAddress),
    };
}

export type OutboundLite = {
    id: string;
    direction?: string | null;
    replied_at?: string | null;
    created_at?: string | null;
};

/**
 * Given a thread's messages, select the most-recent OUTBOUND message not yet marked replied,
 * so an inbound reply can set its replied_at. Returns null if none.
 */
export function selectOutboundToMarkReplied(messages: OutboundLite[]): string | null {
    const candidates = messages
        .filter((m) => m.direction === "outbound" && !m.replied_at)
        .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    return candidates.length > 0 ? candidates[0].id : null;
}
