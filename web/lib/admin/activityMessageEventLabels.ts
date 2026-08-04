/**
 * Channel-aware workflow_event titles for communication lifecycle events.
 * Uses payload.channel — never infers SMS from body/template.
 */

function readChannel(payload: Record<string, unknown>): string {
    const ch = payload.channel;
    return typeof ch === "string" ? ch.trim().toLowerCase() : "";
}

type MessageEventKind = "sent" | "received" | "queued" | "delivered" | "failed" | "blocked" | "deferred";

const CHANNEL_NOUNS: Record<string, string> = {
    email: "Email",
    sms: "SMS",
    in_app: "Message",
};

const KIND_VERBS: Record<MessageEventKind, string> = {
    sent: "sent",
    received: "received",
    queued: "queued",
    delivered: "delivered",
    failed: "failed",
    // Policy outcomes, worded apart from `failed` on purpose: nothing broke, the
    // platform declined to send. Conflating the two sends an operator chasing a
    // provider incident that never happened.
    blocked: "blocked",
    deferred: "deferred",
};

function channelPhrase(channel: string, kind: MessageEventKind): string | null {
    const noun = CHANNEL_NOUNS[channel];
    if (!noun) return null;
    return `${noun} ${KIND_VERBS[kind]}`;
}

export function resolveCommunicationMessageEventTitle(
    eventType: string | null,
    payload: Record<string, unknown>
): string | null {
    const et = (eventType ?? "").trim().toLowerCase();
    const ch = readChannel(payload);

    if (et === "message_sent") return channelPhrase(ch, "sent") ?? "Message sent";
    if (et === "message_received") return channelPhrase(ch, "received") ?? "Message received";
    if (et === "message_queued") return channelPhrase(ch, "queued") ?? "Message queued";
    // The SMS delivery worker emits `message_delivered` right after `message_sent`, so for SMS it is
    // always the newest event — leaving it unmapped is what surfaced the raw key to operators.
    if (et === "message_delivered") return channelPhrase(ch, "delivered") ?? "Message delivered";
    if (et === "message_failed") return channelPhrase(ch, "failed") ?? "Message failed";
    // Emitted by BOTH policy boundaries — the enqueue eligibility gate
    // (canonicalOutboundEnqueue) and dispatch revalidation
    // (communication_message_sender.py). Unmapped, a durable refusal reached the
    // operator as the raw key `message_blocked`, which is the same way
    // `message_delivered` was found above.
    if (et === "message_blocked") return channelPhrase(ch, "blocked") ?? "Message blocked";
    if (et === "message_deferred") return channelPhrase(ch, "deferred") ?? "Message deferred";

    return null;
}
