/**
 * Communications V2 — communication health (PKG-09). PURE, no I/O.
 *
 * Computes the first-class Communication Health object (freeze §3.3): Last Contact, Last Read,
 * Unread, Response Rate, Engagement Score, Channel Preference, Consent Status — from canonical
 * message rows. Consumed by the flag-gated /health API and (later) the record tab + Command Center.
 */

export type HealthMessage = {
    direction?: string | null;
    created_at?: string | null;
    channel?: string | null;
    opened_at?: string | null;
    replied_at?: string | null;
};

export type CommunicationHealthInput = {
    messages: HealthMessage[];
    lastReadAt?: string | null;
    unreadCount?: number;
    consentStatus?: string | null;
    channelPreference?: string | null;
};

export type CommunicationHealth = {
    lastContactAt: string | null;
    lastReadAt: string | null;
    unreadCount: number;
    responseRate: number | null; // 0..1, null when no outbound
    engagementScore: number; // 0..100
    channelPreference: string | null;
    consentStatus: string;
};

function maxIso(values: (string | null | undefined)[]): string | null {
    let best: string | null = null;
    for (const v of values) {
        if (typeof v === "string" && v.length > 0 && (best === null || v > best)) best = v;
    }
    return best;
}

function inferChannelPreference(messages: HealthMessage[]): string | null {
    const counts = new Map<string, number>();
    for (const m of messages) {
        const c = typeof m.channel === "string" ? m.channel : null;
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = -1;
    for (const [c, n] of counts) {
        if (n > bestN) {
            best = c;
            bestN = n;
        }
    }
    return best;
}

export function computeCommunicationHealth(input: CommunicationHealthInput): CommunicationHealth {
    const msgs = input.messages ?? [];
    const outbound = msgs.filter((m) => m.direction === "outbound");
    const inbound = msgs.filter((m) => m.direction === "inbound");

    const responseRate =
        outbound.length > 0 ? Math.min(1, inbound.length / outbound.length) : null;
    const openRate =
        outbound.length > 0 ? outbound.filter((m) => !!m.opened_at).length / outbound.length : 0;
    const engagementScore = Math.round(100 * (0.5 * openRate + 0.5 * (responseRate ?? 0)));

    const unreadCount =
        typeof input.unreadCount === "number"
            ? input.unreadCount
            : inbound.length; // fallback: inbound count when not provided

    return {
        lastContactAt: maxIso(msgs.map((m) => m.created_at)),
        lastReadAt: input.lastReadAt ?? null,
        unreadCount,
        responseRate,
        engagementScore: Math.max(0, Math.min(100, engagementScore)),
        channelPreference: input.channelPreference ?? inferChannelPreference(msgs),
        consentStatus: input.consentStatus ?? "unknown",
    };
}
