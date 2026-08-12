/**
 * The Organization Communications surface, as a product answers it.
 *
 * The old settings page showed storage: a list of provider-binding rows with
 * `scope`, a secret-ref indicator, and "composer outbound readiness". That is the
 * database's shape, and it makes an administrator learn Alloy's internals to
 * answer questions that are actually about their school.
 *
 * This model answers five questions instead, and nothing else:
 *
 *   1. What channels are connected?
 *   2. What identity will Alloy send and receive as?
 *   3. Is sending ready?
 *   4. Is receiving ready?
 *   5. What still needs setup?
 *
 * The unit is therefore the CHANNEL, not the binding row. An organization has
 * Email and SMS; that several binding rows may sit behind one channel is storage
 * detail. Where a channel has more than one, the one that speaks for it is the
 * one the runtime would actually pick — primary first, then best readiness — so
 * the card never advertises a spare while the working one is broken, nor the
 * reverse.
 *
 * Deliberately absent from every output of this file: `secret_ref`, `scope`,
 * `location_id`, binding ids as operator-facing text, database constraint names,
 * and the phrase "composer". Pure — values in, view model out.
 */

import { readinessLabel, type ReadinessState } from "./bindingReadiness";

export type ChannelKey = "email" | "sms";

export type DirectionView = {
    state: ReadinessState;
    /** "Ready", "Verification required", … — never a raw status string. */
    label: string;
    /** One operator sentence. Safe to render verbatim. */
    detail: string;
};

/** A named piece of the channel's identity — "From", "Replies", "Number". */
export type IdentityLine = {
    label: string;
    value: string;
    /** Shown when the value is absent but the concept still matters. */
    placeholder?: string;
};

export type ChannelCard = {
    channel: ChannelKey;
    /** "Email" / "SMS". */
    channelLabel: string;
    /** "Resend" / "Twilio" — the provider as a person would name it, or null. */
    providerLabel: string | null;
    connected: boolean;
    sending: DirectionView;
    receiving: DirectionView;
    identity: IdentityLine[];
    /** Question 5. Empty when the channel is fully working. */
    outstanding: string[];
    /** Whether this channel is switched on. */
    enabled: boolean;
    /** Opaque id for the configure dialog. Never rendered as text. */
    primaryBindingId: string | null;
    /** Every binding behind this channel, for the configure dialog. */
    bindingIds: string[];
    /** More than one row behind this channel — the dialog says so, the card does not. */
    additionalCount: number;
};

/** The binding shape this model consumes — exactly what the bindings route emits. */
export type BindingView = {
    id: string;
    channel: string;
    provider?: string | null;
    status?: string | null;
    is_primary?: boolean | null;
    display_label?: string | null;
    inbound_address?: string | null;
    inbound_to_e164?: string | null;
    from_email?: string | null;
    receiving_domain?: string | null;
    sending_domain?: string | null;
    credential_key?: string | null;
    credential_configured?: boolean;
    readiness?: {
        send: { state: ReadinessState; detail: string };
        receive: { state: ReadinessState; detail: string };
    };
};

const CHANNEL_LABELS: Record<ChannelKey, string> = { email: "Email", sms: "SMS" };

/** Providers named the way their own product names itself. */
const PROVIDER_LABELS: Record<string, string> = { resend: "Resend", twilio: "Twilio" };

/** Which readiness is "better" when choosing the row that speaks for a channel. */
const READINESS_RANK: Record<ReadinessState, number> = {
    ready: 5,
    verification_required: 4,
    setup_required: 3,
    provider_unavailable: 2,
    disabled: 1,
};

function providerLabelFor(provider: string | null | undefined): string | null {
    const p = String(provider ?? "").trim().toLowerCase();
    if (!p) return null;
    return PROVIDER_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

function view(direction: { state: ReadinessState; detail: string } | undefined): DirectionView {
    const state = direction?.state ?? "setup_required";
    return {
        state,
        label: readinessLabel(state),
        detail: direction?.detail ?? "Not set up yet.",
    };
}

/**
 * Score a binding for "who speaks for this channel".
 *
 * Primary wins first because that is the row the runtime prefers, so the card
 * describes what would actually happen. Readiness breaks ties — between two
 * non-primary rows, the working one is the more truthful face of the channel.
 */
function score(b: BindingView): number {
    const primary = b.is_primary ? 1000 : 0;
    const send = READINESS_RANK[b.readiness?.send.state ?? "setup_required"] ?? 0;
    const receive = READINESS_RANK[b.readiness?.receive.state ?? "setup_required"] ?? 0;
    return primary + send * 10 + receive;
}

function identityLinesFor(channel: ChannelKey, b: BindingView | null): IdentityLine[] {
    if (channel === "email") {
        return [
            {
                label: "From",
                value: b?.from_email?.trim() || "",
                placeholder: "Using the default sending address",
            },
            {
                label: "Replies",
                value: b?.inbound_address?.trim() || "",
                placeholder: "No reply address set",
            },
        ];
    }
    return [
        {
            label: "Number",
            value: b?.inbound_to_e164?.trim() || "",
            placeholder: "No number set",
        },
    ];
}

/**
 * Question 5 — what still needs setup.
 *
 * Only non-ready directions contribute, and each contributes the sentence the
 * readiness model already wrote. Nothing is composed here: a second phrasing of
 * the same condition is a second chance to say something untrue.
 */
function outstandingFor(b: BindingView | null, connected: boolean): string[] {
    if (!connected) return ["Not connected yet."];
    const out: string[] = [];
    if (b?.readiness && b.readiness.send.state !== "ready") out.push(`Sending — ${b.readiness.send.detail}`);
    if (b?.readiness && b.readiness.receive.state !== "ready") out.push(`Receiving — ${b.readiness.receive.detail}`);
    return out;
}

/**
 * Build one card per channel — always both, always in a stable order.
 *
 * A channel with no binding is rendered as "Not connected" rather than omitted:
 * an administrator asking "what channels are connected?" is equally served by
 * learning that SMS is not, and an absent card answers nothing.
 */
export function buildChannelCards(bindings: BindingView[]): ChannelCard[] {
    return (["email", "sms"] as const).map((channel) => {
        const rows = bindings.filter((b) => String(b.channel ?? "").trim().toLowerCase() === channel);
        const ranked = [...rows].sort((a, b) => score(b) - score(a));
        const face = ranked[0] ?? null;
        const connected = rows.length > 0;

        return {
            channel,
            channelLabel: CHANNEL_LABELS[channel],
            providerLabel: providerLabelFor(face?.provider),
            connected,
            sending: view(face?.readiness?.send),
            receiving: view(face?.readiness?.receive),
            identity: identityLinesFor(channel, face),
            outstanding: outstandingFor(face, connected),
            enabled: String(face?.status ?? "").trim().toLowerCase() !== "disabled",
            primaryBindingId: face?.id ?? null,
            bindingIds: ranked.map((b) => b.id),
            additionalCount: Math.max(0, rows.length - 1),
        };
    });
}

/**
 * The one-line answer to "how are communications?", for the page header.
 *
 * Deliberately conservative: anything less than both directions ready on every
 * connected channel is reported as needing attention. A summary that rounds up
 * is how a broken receive path stays invisible.
 */
export function summarizeChannels(cards: ChannelCard[]): { label: string; needsAttention: boolean } {
    const connected = cards.filter((c) => c.connected);
    if (connected.length === 0) return { label: "No channels connected", needsAttention: true };
    const allReady = connected.every((c) => c.sending.state === "ready" && c.receiving.state === "ready");
    if (allReady) {
        return {
            label: connected.length === cards.length ? "Email and SMS ready" : `${connected[0]!.channelLabel} ready`,
            needsAttention: false,
        };
    }
    return { label: "Setup incomplete", needsAttention: true };
}
