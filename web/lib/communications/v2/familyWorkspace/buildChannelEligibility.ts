// UI-5A — per-person × channel availability (address + provider binding + passive opt-in read).
import type { ChannelEligibility } from "./types";

function optInIsExplicitFalse(metadata: Record<string, unknown> | null | undefined, key: string): boolean {
    if (!metadata) return false;
    return metadata[key] === false;
}

function channelElig(args: {
    channel: "email" | "sms";
    address: string | null;
    providerChannels: ReadonlyArray<"email" | "sms" | "in_app">;
    archived: boolean;
    metadata: Record<string, unknown> | null | undefined;
}): ChannelEligibility {
    const hasAddress = !!args.address;
    const providerBound = args.providerChannels.includes(args.channel);
    const optInFalse = optInIsExplicitFalse(args.metadata, `${args.channel}_opt_in`);
    const available = hasAddress && providerBound && !args.archived && !optInFalse;

    let unavailableReason: string | null = null;
    if (!available) {
        if (args.archived) unavailableReason = "Person archived";
        else if (!hasAddress) unavailableReason = args.channel === "email" ? "No email on file" : "No phone on file";
        else if (!providerBound) unavailableReason = args.channel === "email" ? "Email not configured" : "SMS not configured";
        else if (optInFalse) unavailableReason = "Opt-in not recorded";
    }

    // 5A consent is passive: never enforced, surfaced as "unset"; canSend mirrors availability.
    return {
        hasAddress,
        providerBound,
        available,
        unavailableReason,
        marketing: "unset",
        transactional: "unset",
        canSendTransactional: available,
        canSendMarketing: available,
    };
}

export function buildChannelEligibility(input: {
    email: string | null;
    phone: string | null;
    archived: boolean;
    providerChannels: ReadonlyArray<"email" | "sms" | "in_app">;
    metadata?: Record<string, unknown> | null;
}): { email: ChannelEligibility; sms: ChannelEligibility } {
    return {
        email: channelElig({ channel: "email", address: input.email, providerChannels: input.providerChannels, archived: input.archived, metadata: input.metadata }),
        sms: channelElig({ channel: "sms", address: input.phone, providerChannels: input.providerChannels, archived: input.archived, metadata: input.metadata }),
    };
}
