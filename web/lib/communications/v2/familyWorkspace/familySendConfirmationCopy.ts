/**
 * Shared operator-facing titles/copy for family-send confirmation + success.
 * Presentation only — not a second send authority.
 */

export function buildFamilySendAckTitle(input: {
    tourInvitation?: boolean;
}): string {
    return input.tourInvitation ? "Tour invitation sent" : "Message sent";
}

export function buildFamilySendConfirmChannelLine(input: {
    channel: "email" | "sms";
    recipientLabel: string;
}): string {
    const channelLabel = input.channel === "sms" ? "SMS" : "Email";
    const to = input.recipientLabel.trim();
    return to ? `${channelLabel} to ${to}` : channelLabel;
}
