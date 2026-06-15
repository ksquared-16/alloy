/**
 * Communications V2 — BOS communication intelligence (PKG-17). PURE, DETERMINISTIC, no I/O, no React.
 *
 * Deterministic signal layer that GROUNDS the BOS rail's review-first communication cards (summary,
 * recommended response, follow-up, missing-info, risk, read-receipt analysis, response likelihood).
 * The LLM-authored summary/draft reuse the EXISTING BOS infra (web/lib/adminV2/bos/communication/)
 * and the existing command rail — this package adds NO new embedded BOS UI (doctrine: reuse the rail,
 * never embed BOS in communication content). No auto-send: everything here is advisory input only.
 */

export type IntelMessage = {
    direction?: string | null;
    created_at?: string | null;
    opened_at?: string | null;
    replied_at?: string | null;
    channel?: string | null;
};

export type ConversationSignals = {
    total: number;
    inbound: number;
    outbound: number;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    awaitingResponse: boolean;
    openedNotReplied: number;
    sentNotOpened: number;
    responseRate: number;
    openRate: number;
};

function maxBy(messages: IntelMessage[], pick: (m: IntelMessage) => string | null | undefined): string | null {
    let best: string | null = null;
    for (const m of messages) {
        const v = pick(m);
        if (typeof v === "string" && (best === null || v > best)) best = v;
    }
    return best;
}

export function buildConversationSignals(messages: IntelMessage[]): ConversationSignals {
    const inbound = messages.filter((m) => m.direction === "inbound");
    const outbound = messages.filter((m) => m.direction === "outbound");
    const lastInboundAt = maxBy(inbound, (m) => m.created_at);
    const lastOutboundAt = maxBy(outbound, (m) => m.created_at);
    const awaitingResponse = lastInboundAt !== null && (lastOutboundAt === null || lastInboundAt > lastOutboundAt);
    const openedNotReplied = outbound.filter((m) => m.opened_at && !m.replied_at).length;
    const sentNotOpened = outbound.filter((m) => !m.opened_at).length;
    const responseRate = outbound.length > 0 ? Math.min(1, inbound.length / outbound.length) : 0;
    const openRate = outbound.length > 0 ? outbound.filter((m) => !!m.opened_at).length / outbound.length : 0;
    return {
        total: messages.length,
        inbound: inbound.length,
        outbound: outbound.length,
        lastInboundAt,
        lastOutboundAt,
        awaitingResponse,
        openedNotReplied,
        sentNotOpened,
        responseRate,
        openRate,
    };
}

/** Required fields that are absent/empty on a record. */
export function detectMissingInformation(fields: Record<string, unknown>, required: string[]): string[] {
    return required.filter((k) => {
        const v = fields[k];
        return v === null || v === undefined || v === "";
    });
}

export type RiskFlag = "awaiting_response" | "opened_not_replied" | "sla_overdue" | "stale_silence";

export function detectCommunicationRisk(input: {
    signals: ConversationSignals;
    slaState?: string | null;
    nowMs?: number;
    lastMessageMs?: number | null;
    staleHours?: number;
}): RiskFlag[] {
    const flags: RiskFlag[] = [];
    if (input.signals.awaitingResponse) flags.push("awaiting_response");
    if (input.signals.openedNotReplied > 0) flags.push("opened_not_replied");
    if (input.slaState === "overdue") flags.push("sla_overdue");
    const staleMs = (input.staleHours ?? 72) * 3_600_000;
    if (
        !input.signals.awaitingResponse &&
        typeof input.nowMs === "number" &&
        typeof input.lastMessageMs === "number" &&
        input.nowMs - input.lastMessageMs > staleMs
    ) {
        flags.push("stale_silence");
    }
    return flags;
}

export function analyzeReadReceipts(messages: IntelMessage[]): {
    openedNotReplied: number;
    sentNotOpened: number;
    replied: number;
} {
    const outbound = messages.filter((m) => m.direction === "outbound");
    return {
        openedNotReplied: outbound.filter((m) => m.opened_at && !m.replied_at).length,
        sentNotOpened: outbound.filter((m) => !m.opened_at).length,
        replied: outbound.filter((m) => !!m.replied_at).length,
    };
}

/** Deterministic 0..1 likelihood the family responds to the next outbound. */
export function estimateResponseLikelihood(signals: ConversationSignals): number {
    const score = 0.6 * signals.responseRate + 0.4 * signals.openRate;
    return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

export type FollowUpRecommendation = { action: string; reason: string };

export function recommendFollowUp(signals: ConversationSignals, riskFlags: RiskFlag[]): FollowUpRecommendation {
    if (riskFlags.includes("sla_overdue") || riskFlags.includes("awaiting_response")) {
        return { action: "respond_now", reason: "Family is awaiting a reply." };
    }
    if (riskFlags.includes("opened_not_replied")) {
        return { action: "send_follow_up", reason: "A message was opened but not replied to." };
    }
    if (riskFlags.includes("stale_silence")) {
        return { action: "re_engage", reason: "No recent activity on this conversation." };
    }
    return { action: "monitor", reason: "No follow-up needed right now." };
}
