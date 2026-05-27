/**
 * Channel-aware workflow_event titles for communication lifecycle events.
 * Uses payload.channel — never infers SMS from body/template.
 */

function readChannel(payload: Record<string, unknown>): string {
    const ch = payload.channel;
    return typeof ch === "string" ? ch.trim().toLowerCase() : "";
}

function channelPhrase(channel: string, kind: "sent" | "received" | "queued"): string | null {
    if (channel === "email") {
        if (kind === "sent") return "Email sent";
        if (kind === "received") return "Email received";
        return "Email queued";
    }
    if (channel === "sms") {
        if (kind === "sent") return "SMS sent";
        if (kind === "received") return "SMS received";
        return "SMS queued";
    }
    if (channel === "in_app") {
        if (kind === "sent") return "Message sent";
        if (kind === "received") return "Message received";
        return "Message queued";
    }
    return null;
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

    return null;
}
