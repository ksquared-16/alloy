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

import { readinessLabel, type ProviderConnectionState, type ReadinessState } from "./bindingReadiness";
import type { LocationHierarchy } from "./locationHierarchy";

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
    /**
     * The provider connection, reported SEPARATELY from send and receive.
     *
     * Previously the card showed only two readiness rows, so "we have no account
     * to send through" and "you have not set a From address" arrived looking like
     * the same kind of problem. They are not: one is fixed here, the other is not
     * fixable here at all.
     */
    providerConnection: ProviderConnectionState;
    /** Product wording for the state above. Never storage vocabulary. */
    providerConnectionLabel: string;
    /**
     * The account this channel is actually using, and who owns it.
     *
     * "Connected" without an account name left an administrator unable to say
     * WHICH Twilio account was sending their texts, whether it was theirs, or how
     * to change it. Null when nothing is connected.
     */
    providerAccount: ProviderAccountView | null;
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
    /** Every active location, flat. Retained for consumers that index by id. */
    locations: LocationIdentityRow[];
    /** How many locations send as themselves. */
    overrideCount: number;
    /**
     * The same locations as the organization actually reads them: schools, each
     * with its rooms nested underneath.
     *
     * Schools and rooms were previously one flat peer list, so a room sat beside
     * its own school as though they were the same kind of thing. They are not: a
     * school can have its own identity, a room inherits one.
     */
    schools: SchoolIdentityRow[];
    /** Rooms whose school is missing or inactive. Shown, never dropped. */
    unparentedRooms: RoomIdentityRow[];
};

/** Who owns the connection an administrator is looking at. */
export type ProviderAccountView = {
    /** "Resend" / "Twilio", as a person would name it. */
    providerLabel: string;
    /** The account's own name, when it has one. */
    label: string | null;
    /**
     * `organization` — connected on this page, and replaceable here.
     * `platform` — provisioned for the deployment; real, working, and not
     * changeable by this administrator. Saying so beats leaving them to guess.
     */
    owner: "organization" | "platform";
    connected: boolean;
};

/** The binding shape this model consumes — exactly what the bindings route emits. */
export type OrgLocation = { id: string; label: string };

/** One location's row under a channel — its own identity, or inheritance. */
export type LocationIdentityRow = {
    locationId: string;
    label: string;
    /** True when this location has no identity of its own. */
    inherits: boolean;
    /** The location's own identity, or the inherited organization one. */
    identity: string;
    /** Which of those two the value above is. Drives the "Uses …" wording. */
    source: "location" | "organization" | "none";
    sending: DirectionView | null;
    receiving: DirectionView | null;
    /** Opaque handle for the configure dialog. Null when inheriting. */
    bindingId: string | null;
};

/**
 * A room, and what it sends as today.
 *
 * There is deliberately no `bindingId` and no action. A room cannot be given its
 * own identity yet — see `ROOM_IDENTITY_FUTURE_GATE` in `locationHierarchy.ts`.
 * The runtime cannot select one room truthfully for an outbound message, so a
 * control here would be ignored on every send. The room is still SHOWN, with what
 * it inherits, because hiding it would misrepresent the organization.
 */
export type RoomIdentityRow = {
    roomId: string;
    label: string;
    /** The identity this room actually sends as, inherited. */
    identity: string;
    /** Which ancestor supplies it. Rooms are never `room`. */
    source: "school" | "organization" | "none";
    /** The school's label, when the identity comes from the school. */
    inheritedFrom: string | null;
};

/** A school/centre row, with its rooms nested beneath it. */
export type SchoolIdentityRow = LocationIdentityRow & {
    rooms: RoomIdentityRow[];
};

export type BindingView = {
    id: string;
    channel: string;
    location_id?: string | null;
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
        /** Absent on payloads written before the connection state existed. */
        providerConnection?: ProviderConnectionState;
    };
};

const CHANNEL_LABELS: Record<ChannelKey, string> = { email: "Email", sms: "SMS" };

/** Providers named the way their own product names itself. */
const PROVIDER_LABELS: Record<string, string> = { resend: "Resend", twilio: "Twilio" };

/**
 * Which readiness is "better" when choosing the row that speaks for a channel.
 *
 * `routing_setup_required` ranks just under `verification_required`: both mean
 * "configured and not working yet", and neither is broken — but the routing one
 * is further from done, because the outstanding step is at the organization's own
 * mail provider rather than at Alloy or the provider console.
 *
 * The map is exhaustive over `ReadinessState` by type, which is what caught this:
 * widening the union without adding a rank left the lookup returning `undefined`,
 * and a binding with an unranked state would have scored `NaN` and could have
 * become the face of the channel over a working one.
 */
const READINESS_RANK: Record<ReadinessState, number> = {
    ready: 5,
    verification_required: 4,
    // Both mean "configured, not working yet". Awaiting a routed email is
    // FURTHER along than needing setup — Alloy has a destination and is waiting
    // on someone else's forwarding rule.
    awaiting_routed_email: 3.75,
    routing_setup_required: 3.5,
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

/** The single address or number this row sends and receives as, in plain text. */
function identityValueFor(channel: ChannelKey, b: BindingView | null): string {
    if (!b) return "";
    if (channel === "email") return (b.from_email ?? b.inbound_address ?? "").trim();
    return (b.inbound_to_e164 ?? "").trim();
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
export function buildChannelCards(
    bindings: BindingView[],
    locations: OrgLocation[] = [],
    hierarchy?: LocationHierarchy,
    providerAccounts: {
        channel: string;
        provider: string;
        label: string | null;
        owner: "organization" | "platform";
        connected: boolean;
    }[] = [],
): ChannelCard[] {
    return (["email", "sms"] as const).map((channel) => {
        const rows = bindings.filter((b) => String(b.channel ?? "").trim().toLowerCase() === channel);
        // The card speaks for the ORGANIZATION default, so a location override
        // must never become the face of the channel — otherwise an admin with one
        // location override would see it presented as the organization's identity.
        // A retired override is excluded from BOTH sides: it is not the location's
        // identity any more, and it must never be mistaken for the organization's.
        const orgRows = rows.filter((b) => !(b.location_id ?? "").trim());
        const ranked = [...(orgRows.length ? orgRows : rows)].sort((a, b) => score(b) - score(a));
        const face = ranked[0] ?? null;
        const connected = rows.length > 0;

        const orgIdentity = identityValueFor(channel, face);
        const locationRows: LocationIdentityRow[] = locations.map((loc) => {
            // Only an ACTIVE binding is an override. A RETIRED one keeps its
            // location so the identity can never broaden to the organization (see
            // `locationOverrideRemoval.ts`), but the location inherits — so it must
            // read as inheritance here, not as a location identity that is broken.
            const own = rows.find(
                (b) =>
                    (b.location_id ?? "").trim() === loc.id &&
                    String(b.status ?? "").trim().toLowerCase() === "active",
            );
            if (!own) {
                return {
                    locationId: loc.id,
                    label: loc.label,
                    inherits: true,
                    identity: orgIdentity,
                    source: orgIdentity ? "organization" : "none",
                    sending: null,
                    receiving: null,
                    bindingId: null,
                };
            }
            return {
                locationId: loc.id,
                label: loc.label,
                inherits: false,
                identity: identityValueFor(channel, own),
                source: "location",
                sending: view(own.readiness?.send),
                receiving: view(own.readiness?.receive),
                bindingId: own.id,
            };
        });

        // Nest the same rows the flat list already computed, so a school cannot
        // read one way in the list and another in the hierarchy.
        const byId = new Map(locationRows.map((r) => [r.locationId, r]));
        const schools: SchoolIdentityRow[] = (hierarchy?.sites ?? []).flatMap((site) => {
            const row = byId.get(site.id);
            if (!row) return [];
            // A room follows its SCHOOL when the school sends as itself, and the
            // organization otherwise. That is the fallback the resolver performs,
            // stated in the UI rather than a second, drifting copy of it.
            const rooms: RoomIdentityRow[] = site.rooms.map((room) => {
                const fromSchool = !row.inherits && Boolean(row.identity);
                const identity = fromSchool ? row.identity : orgIdentity;
                return {
                    roomId: room.id,
                    label: room.label,
                    identity,
                    source: identity ? (fromSchool ? "school" : "organization") : "none",
                    inheritedFrom: fromSchool ? row.label : null,
                };
            });
            return [{ ...row, rooms }];
        });

        const unparentedRooms: RoomIdentityRow[] = (hierarchy?.unparented ?? []).map((room) => ({
            roomId: room.id,
            label: room.label,
            identity: orgIdentity,
            source: orgIdentity ? "organization" : "none",
            inheritedFrom: null,
        }));

        const providerConnection: ProviderConnectionState =
            face?.readiness?.providerConnection ?? "not_connected";

        return {
            channel,
            channelLabel: CHANNEL_LABELS[channel],
            providerLabel: providerLabelFor(face?.provider),
            connected,
            providerConnection,
            providerConnectionLabel: providerConnectionLabelFor(providerConnection),
            providerAccount: (() => {
                // Prefer the organization's own account: when both exist, the one
                // the administrator can act on is the one worth naming.
                const forChannel = providerAccounts.filter((a) => a.channel === channel);
                const chosen = forChannel.find((a) => a.owner === "organization") ?? forChannel[0];
                if (!chosen) return null;
                return {
                    providerLabel: providerLabelFor(chosen.provider) ?? chosen.provider,
                    label: chosen.label,
                    owner: chosen.owner,
                    connected: chosen.connected,
                };
            })(),
            sending: view(face?.readiness?.send),
            receiving: view(face?.readiness?.receive),
            identity: identityLinesFor(channel, face),
            outstanding: outstandingFor(face, connected),
            enabled: String(face?.status ?? "").trim().toLowerCase() !== "disabled",
            primaryBindingId: face?.id ?? null,
            bindingIds: ranked.map((b) => b.id),
            additionalCount: Math.max(0, orgRows.length - 1),
            locations: locationRows,
            overrideCount: locationRows.filter((l) => !l.inherits).length,
            schools,
            unparentedRooms,
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

/**
 * Product wording for a provider connection state.
 *
 * `none_approved` names the person who has to act. An administrator reading
 * "Unavailable" would keep trying to fix it here; there is nothing here to fix.
 */
export function providerConnectionLabelFor(state: ProviderConnectionState): string {
    switch (state) {
        case "configured":
            return "Connected";
        case "invalid_credential":
            return "Credentials rejected";
        case "unavailable":
            return "Could not reach provider";
        // `none_approved` used to read "Needs an Alloy administrator". That was
        // true only while a credential could live nowhere but the deployment.
        // An organization now connects its own account, so the honest label is
        // the same one an unconnected channel gets — and the card offers Connect.
        case "none_approved":
        default:
            return "Not connected";
    }
}
