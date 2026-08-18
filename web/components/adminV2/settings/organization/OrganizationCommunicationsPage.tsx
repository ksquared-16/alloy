"use client";

/**
 * `/organization/communications` — the one Communications configuration surface.
 *
 * Built on the canonical Organization chrome (`ConfigurationContext`,
 * `ConfigurationDetailCard`, the Bend Pine button set) so it reads as a member of
 * the `/organization/*` family rather than a settings page that wandered in.
 *
 * The card is a CHANNEL, not a binding row, and everything it says is product
 * vocabulary. `secret_ref`, `scope`, `location_id`, raw constraint text and the
 * word "composer" appear nowhere — see `organizationCommunicationsModel.ts`,
 * which is where that guarantee is made and tested.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, MessageSquare, Plus } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    fetchCommunicationsBindingsCached,
    invalidateCommunicationsBindingsCache,
} from "@/lib/communications/communicationsBindingsCache";
import {
    buildChannelCards,
    summarizeChannels,
    type BindingView,
    type ChannelCard,
    type ChannelKey,
    type OrgLocation,
} from "@/lib/communications/organizationCommunicationsModel";
import type { ProviderConnectionState, ReadinessState } from "@/lib/communications/bindingReadiness";
import MailRoutingSetupPanel from "@/components/adminV2/settings/organization/MailRoutingSetupPanel";
import type { LocationHierarchy } from "@/lib/communications/locationHierarchy";

/** Exactly what the bindings route emits under `provider_accounts`. */
type ProviderAccountRow = {
    channel: string;
    provider: string;
    label: string | null;
    owner: "organization" | "platform";
    connected: boolean;
};
import CommunicationsChannelDialog from "./CommunicationsChannelDialog";

export type CredentialOption = {
    key: string;
    channel: string;
    provider: string;
    /** Product name of the connection, e.g. "Resend — this deployment's connection". */
    label: string;
    description: string;
    /** The deployment holds this credential. Presence only — never a value. */
    available: boolean;
    /**
     * Whether choosing this connection makes REAL EXTERNAL DELIVERY possible.
     * The question an administrator needs answered before clicking Connect.
     */
    externalSendCapable: boolean;
};

/** Only `ready` is affirmative. `verification_required` is deliberately not green —
 *  it is not working yet, and green would say otherwise. */
function toneFor(state: ReadinessState): string {
    switch (state) {
        case "ready":
            return "bg-emerald-600/10 text-emerald-800";
        case "verification_required":
        // Not green, and not red either. Nothing is broken: a step at the
        // organization's OWN mail provider has not been done yet, and until mail
        // actually arrives Alloy has no way to know whether it has.
        case "routing_setup_required":
        // Alloy is ready and waiting on someone else's forwarding rule. Amber,
        // not red: nothing is broken, and nothing more is owed inside Alloy.
        case "awaiting_routed_email":
            return "bg-amber-500/12 text-amber-900";
        case "disabled":
            return "bg-alloy-midnight/8 text-alloy-midnight/60";
        default:
            return "bg-alloy-ember/10 text-alloy-ember";
    }
}

/** Only a working connection is affirmative. `none_approved` is amber, not red:
 *  nothing is broken, something has not been provisioned yet — by someone else. */
function connectionToneFor(state: ProviderConnectionState): string {
    switch (state) {
        case "configured":
            return "bg-emerald-600/10 text-emerald-800";
        case "none_approved":
            return "bg-amber-500/12 text-amber-900";
        default:
            return "bg-alloy-ember/10 text-alloy-ember";
    }
}

function ReadinessRow({
    label,
    state,
    text,
    testId,
    value,
    valueNote,
    action,
}: {
    label: string;
    state: ReadinessState;
    text: string;
    testId: string;
    /** What this direction actually uses today — an address, a number. */
    value?: string | null;
    /** What the value does NOT yet mean. Keeps a configured address from
     *  reading as a working one. */
    valueNote?: string | null;
    /** The one next step for this direction, when there is one. */
    action?: { label: string; onClick: () => void } | null;
}) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-testid={testId}>
            <span className="w-[68px] shrink-0 text-[11px] font-medium text-alloy-midnight/50">{label}</span>
            <span
                className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${toneFor(state)}`}
                data-testid={`${testId}-state`}
            >
                {text}
            </span>
            {value ? (
                <span className="min-w-0 break-all text-[12px] text-alloy-midnight/85" data-testid={`${testId}-value`}>
                    {value}
                </span>
            ) : null}
            {value && valueNote ? (
                <span className="shrink-0 text-[11px] italic text-alloy-midnight/50" data-testid={`${testId}-note`}>
                    {valueNote}
                </span>
            ) : null}
            {action ? (
                <button
                    type="button"
                    onClick={action.onClick}
                    className="shrink-0 text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                    data-testid={`${testId}-action`}
                >
                    {action.label}
                </button>
            ) : null}
        </div>
    );
}

/**
 * The one next step for a direction — the question "what should I do next?"
 * answered in the operator's words, or nothing when the answer is "nothing".
 */
function nextActionLabel(channel: ChannelKey, direction: "sending" | "receiving", state: ReadinessState): string | null {
    if (state === "ready" || state === "disabled") return null;
    if (direction === "sending") {
        return state === "verification_required" ? "Verify domain" : "Set up sending";
    }
    // The routing rule lives at the organization's own mail provider, not in
    // Alloy and not at Resend. "Set up replies" pointed administrators at the
    // wrong place for the one state where the work is genuinely theirs.
    if (state === "routing_setup_required") return "Set up mail routing";
    // Deliberately NO action. The destination exists and the rule is theirs to
    // add at their own mail provider — offering "Set up mail routing" again would
    // send an administrator to redo work they have already done.
    if (state === "awaiting_routed_email") return null;
    return channel === "email" ? "Set up replies" : "Set up receiving";
}

export default function OrganizationCommunicationsPage() {
    const [bindings, setBindings] = useState<BindingView[]>([]);
    const [credentialOptions, setCredentialOptions] = useState<CredentialOption[]>([]);
    const [locations, setLocations] = useState<OrgLocation[]>([]);
    const [hierarchy, setHierarchy] = useState<LocationHierarchy | undefined>(undefined);
    const [providerAccounts, setProviderAccounts] = useState<ProviderAccountRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [dialogChannel, setDialogChannel] = useState<ChannelKey | null>(null);
    const [dialogMode, setDialogMode] = useState<"connect" | "configure">("configure");
    /** Null = the organization default. Otherwise the location being given its own identity. */
    const [dialogLocationId, setDialogLocationId] = useState<string | null>(null);

    const load = useCallback(async (options?: { force?: boolean }) => {
        setLoading(true);
        setErr(null);
        try {
            const { ok, status, json } = await fetchCommunicationsBindingsCached({ force: options?.force });
            if (!ok) throw new Error(json.error ?? `HTTP ${status}`);
            setBindings((Array.isArray(json.bindings) ? json.bindings : []) as BindingView[]);
            const creds = (json as { credential_options?: CredentialOption[] }).credential_options;
            setCredentialOptions(Array.isArray(creds) ? creds : []);
            const locs = (json as { locations?: OrgLocation[] }).locations;
            setLocations(Array.isArray(locs) ? locs : []);
            const tree = (json as { location_hierarchy?: LocationHierarchy }).location_hierarchy;
            setHierarchy(tree && Array.isArray(tree.sites) ? tree : undefined);
            const accts = (json as { provider_accounts?: ProviderAccountRow[] }).provider_accounts;
            setProviderAccounts(Array.isArray(accts) ? accts : []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not load communications settings");
            setBindings([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const cards = useMemo(
        () => buildChannelCards(bindings, locations, hierarchy, providerAccounts),
        [bindings, locations, hierarchy, providerAccounts],
    );
    const summary = useMemo(() => summarizeChannels(cards), [cards]);

    const openDialog = (channel: ChannelKey, mode: "connect" | "configure", locationId: string | null = null) => {
        setDialogChannel(channel);
        setDialogMode(mode);
        setDialogLocationId(locationId);
    };

    const onSaved = async () => {
        invalidateCommunicationsBindingsCache();
        setDialogChannel(null);
        await load({ force: true });
    };

    const activeCard = cards.find((c) => c.channel === dialogChannel) ?? null;

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="organization-communications-page">
            <ConfigurationContext
                eyebrow="Organization"
                title="Communications"
                subtitle="How families reach this organization, and how it reaches them."
                titleIcon={<Mail className="h-5 w-5" strokeWidth={2} />}
                testId="organization-communications-context"
            >
                <p
                    className="border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/52"
                    data-testid="organization-communications-summary"
                >
                    <strong
                        className={summary.needsAttention ? "font-semibold text-alloy-ember" : "font-semibold text-emerald-800"}
                    >
                        {summary.label}
                    </strong>
                    {" · "}
                    Sending and receiving are set up separately — one can work while the other does not.
                </p>
            </ConfigurationContext>

            {/*
             * The canonical Organization body: ConfigurationShell owns the column
             * geometry, and `main` bounds the width. An earlier revision used a
             * hand-rolled wrapper and the floating BOS rail overlaid the right-hand
             * card — every Configure button on it silently ate its own clicks.
             * Browser certification caught it; reuse of the real shell fixes it.
             */}
            <ConfigurationShell testId="organization-communications-shell">
                <main
                    className="mx-auto min-w-0 max-w-[1480px] pb-3"
                    data-testid="organization-communications-workspace"
                >
                    {loading ? (
                        <p className="text-xs text-alloy-midnight/50" aria-busy="true">
                            Loading…
                        </p>
                    ) : (
                        <div className="grid auto-rows-fr items-stretch gap-2.5 md:grid-cols-2">
                            {err ? (
                                <p
                                    className="text-xs text-alloy-ember md:col-span-2"
                                    data-testid="organization-communications-error"
                                >
                                    {err}
                                </p>
                            ) : null}

                            {cards.map((card) => (
                                <ChannelPanel
                                    key={card.channel}
                                    card={card}
                                    onConnect={() => openDialog(card.channel, "connect")}
                                    onConfigure={() => openDialog(card.channel, "configure")}
                                    onConfigureLocation={(locationId, hasOwn) =>
                                        openDialog(card.channel, hasOwn ? "configure" : "connect", locationId)
                                    }
                                />
                            ))}
                        </div>
                    )}
                </main>
            </ConfigurationShell>

            {activeCard ? (
                <CommunicationsChannelDialog
                    card={activeCard}
                    mode={dialogMode}
                    locationId={dialogLocationId}
                    locations={locations}
                    bindings={bindings.filter(
                        (b) => String(b.channel ?? "").toLowerCase() === activeCard.channel,
                    )}
                    credentialOptions={credentialOptions.filter((c) => c.channel === activeCard.channel)}
                    onClose={() => setDialogChannel(null)}
                    onSaved={onSaved}
                />
            ) : null}
        </div>
    );
}

/**
 * Schools, with their rooms nested underneath.
 *
 * Rooms are collapsed by default and deliberately carry NO action. A room cannot
 * be given its own identity yet — the runtime cannot select one room truthfully
 * for an outbound message, and a control the runtime ignores is worse than no
 * control. Rooms are still listed, showing what they inherit, because a tenant
 * with twenty rooms and no way to see them cannot tell inheritance from absence.
 *
 * Collapsed-by-default is what keeps this compact for an organization with many
 * rooms: the default view is one line per school, not one line per room.
 */
function SchoolHierarchy({
    card,
    onConfigureLocation,
}: {
    card: ChannelCard;
    onConfigureLocation: (locationId: string, hasOwn: boolean) => void;
}) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const roomTotal =
        card.schools.reduce((n, s) => n + s.rooms.length, 0) + card.unparentedRooms.length;

    return (
        <div className="mt-3 border-t border-alloy-stone/25 pt-2.5" data-testid={`communications-${card.channel}-locations`}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold text-alloy-midnight/62">Schools and rooms</p>
                <p className="text-[10px] text-alloy-midnight/45" data-testid={`communications-${card.channel}-hierarchy-summary`}>
                    {card.overrideCount === 0
                        ? `All ${card.schools.length} schools use the organization identity`
                        : `${card.overrideCount} of ${card.schools.length} schools send as themselves`}
                    {roomTotal ? ` · ${roomTotal} rooms` : ""}
                </p>
            </div>

            <ul className="mt-1 space-y-0.5">
                {card.schools.map((school) => {
                    const open = expanded[school.locationId] ?? false;
                    return (
                        <li key={school.locationId} data-testid={`communications-${card.channel}-school-${school.locationId}`}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                <span className="flex min-w-0 items-baseline gap-1">
                                    {school.rooms.length ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpanded((prev) => ({ ...prev, [school.locationId]: !open }))
                                            }
                                            aria-expanded={open}
                                            className="shrink-0 rounded px-0.5 text-[10px] text-alloy-midnight/50 hover:text-alloy-midnight"
                                            data-testid={`communications-${card.channel}-school-${school.locationId}-toggle`}
                                        >
                                            {open ? "▾" : "▸"} {school.rooms.length}
                                        </button>
                                    ) : (
                                        <span className="w-[18px] shrink-0" aria-hidden />
                                    )}
                                    <span className="min-w-0 truncate text-[11px] font-medium text-alloy-midnight/80">
                                        {school.label}
                                    </span>
                                </span>
                                <span className="flex items-baseline gap-2">
                                    <span
                                        className={`text-[11px] ${school.inherits ? "italic text-alloy-midnight/45" : "font-medium text-alloy-midnight/85"}`}
                                        data-testid={`communications-${card.channel}-location-${school.locationId}-identity`}
                                    >
                                        {school.inherits
                                            ? school.identity
                                                ? "Uses organization identity"
                                                : "Nothing to inherit yet"
                                            : school.identity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onConfigureLocation(school.locationId, !school.inherits)}
                                        className="shrink-0 text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                                        data-testid={`communications-${card.channel}-location-${school.locationId}-action`}
                                    >
                                        {school.inherits ? "Give its own" : "Change"}
                                    </button>
                                </span>
                            </div>

                            {open && school.rooms.length ? (
                                <ul
                                    className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-alloy-stone/30 pl-2"
                                    data-testid={`communications-${card.channel}-school-${school.locationId}-rooms`}
                                >
                                    {school.rooms.map((room) => (
                                        <li
                                            key={room.roomId}
                                            className="flex flex-wrap items-baseline justify-between gap-x-2"
                                            data-testid={`communications-${card.channel}-room-${room.roomId}`}
                                        >
                                            <span className="min-w-0 truncate text-[11px] text-alloy-midnight/70">
                                                {room.label}
                                            </span>
                                            <span
                                                className="text-[11px] italic text-alloy-midnight/45"
                                                data-testid={`communications-${card.channel}-room-${room.roomId}-identity`}
                                            >
                                                {room.source === "school"
                                                    ? `Uses ${room.inheritedFrom} identity`
                                                    : room.source === "organization"
                                                      ? "Uses organization identity"
                                                      : "Nothing to inherit yet"}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    );
                })}
            </ul>

            {card.unparentedRooms.length ? (
                <div className="mt-1.5" data-testid={`communications-${card.channel}-unparented-rooms`}>
                    <p className="text-[10px] text-alloy-midnight/45">Not under a school</p>
                    <ul className="mt-0.5 space-y-0.5">
                        {card.unparentedRooms.map((room) => (
                            <li
                                key={room.roomId}
                                className="flex flex-wrap items-baseline justify-between gap-x-2"
                                data-testid={`communications-${card.channel}-room-${room.roomId}`}
                            >
                                <span className="min-w-0 truncate text-[11px] text-alloy-midnight/70">{room.label}</span>
                                <span className="text-[11px] italic text-alloy-midnight/45">
                                    {room.identity ? "Uses organization identity" : "Nothing to inherit yet"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

function ChannelPanel({
    card,
    onConnect,
    onConfigure,
    onConfigureLocation,
}: {
    card: ChannelCard;
    onConnect: () => void;
    onConfigure: () => void;
    onConfigureLocation: (locationId: string, hasOwn: boolean) => void;
}) {
    const Icon = card.channel === "email" ? Mail : MessageSquare;
    return (
        <ConfigurationDetailCard testId={`communications-channel-${card.channel}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-alloy-bend-pine/[0.10] text-[#007d68]"
                        aria-hidden
                    >
                        <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                        <h2 className="config-typo-workspace-title" data-testid={`communications-channel-${card.channel}-title`}>
                            {card.channelLabel}
                        </h2>
                        <p className="text-[11px] text-alloy-midnight/52" data-testid={`communications-channel-${card.channel}-provider`}>
                            {card.providerLabel ?? "Not connected"}
                        </p>
                    </div>
                </div>
                {card.connected ? (
                    <ConfigurationSecondaryButton
                        onClick={onConfigure}
                        data-testid={`communications-configure-${card.channel}`}
                    >
                        Configure
                    </ConfigurationSecondaryButton>
                ) : (
                    <ConfigurationPrimaryButton onClick={onConnect} data-testid={`communications-connect-${card.channel}`}>
                        <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={2.5} />
                        {/* Name the provider, not the channel. "Connect Email" is a
                            category; "Connect Resend" is the thing the administrator
                            is about to do, in the vocabulary of the account they
                            already have. */}
                        Connect {card.channel === "email" ? "Resend" : "Twilio"}
                    </ConfigurationPrimaryButton>
                )}
            </div>

            {card.connected ? (
                <>
                    <div className="mt-3 space-y-1.5">
                        {/* The provider connection is its own fact. "No account to
                            send through" and "no From address set" are different
                            problems with different owners, and collapsing them into
                            one readiness row is what made a missing deployment
                            credential look like something an admin had misconfigured. */}
                        <div
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                            data-testid={`communications-${card.channel}-provider-connection`}
                        >
                            <span className="w-[68px] shrink-0 text-[11px] font-medium text-alloy-midnight/50">
                                Connection
                            </span>
                            <span
                                className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${connectionToneFor(card.providerConnection)}`}
                                data-testid={`communications-${card.channel}-provider-connection-state`}
                            >
                                {card.providerConnectionLabel}
                            </span>
                            {card.providerAccount ? (
                                <span
                                    className="min-w-0 truncate text-[12px] text-alloy-midnight/85"
                                    data-testid={`communications-${card.channel}-provider-account`}
                                >
                                    {card.providerAccount.providerLabel}
                                    {card.providerAccount.label ? ` · ${card.providerAccount.label}` : ""}
                                    {card.providerAccount.owner === "platform" ? " · managed by Alloy" : ""}
                                </span>
                            ) : null}
                        </div>
                        <ReadinessRow
                            label="Sending"
                            state={card.sending.state}
                            text={card.sending.label}
                            testId={`communications-${card.channel}-sending`}
                            value={card.identity.find((l) => l.label === "From" || l.label === "Number")?.value || null}
                            action={
                                nextActionLabel(card.channel, "sending", card.sending.state)
                                    ? { label: nextActionLabel(card.channel, "sending", card.sending.state)!, onClick: onConfigure }
                                    : null
                            }
                        />
                        <ReadinessRow
                            label="Receiving"
                            state={card.receiving.state}
                            /* Email receiving says "Connected", not "Ready": it is a
                               statement about mail having actually arrived, and
                               "Ready" reads as a capability rather than an
                               observation. SMS keeps the shared vocabulary. */
                            text={
                                card.channel === "email" && card.receiving.state === "ready"
                                    ? "Connected"
                                    : card.receiving.label
                            }
                            testId={`communications-${card.channel}-receiving`}
                            value={card.identity.find((l) => l.label === "Replies")?.value || null}
                            // An address on this row is NOT proof that mail reaches
                            // Alloy. Showing "kelly@…" beside "Setup required" read
                            // as though Alloy were already collecting that mailbox —
                            // it is not, and it never reads a staff mailbox at all.
                            valueNote={
                                card.channel === "email" && card.receiving.state !== "ready"
                                    ? "Not routed to Alloy"
                                    : null
                            }
                            action={
                                nextActionLabel(card.channel, "receiving", card.receiving.state)
                                    ? { label: nextActionLabel(card.channel, "receiving", card.receiving.state)!, onClick: onConfigure }
                                    : null
                            }
                        />
                    </div>

                    {/* The From/Replies list moved INTO the Sending and Receiving rows.
                        Showing an address twice, once as a value and once as a
                        readiness detail, made the card longer without answering
                        anything the rows do not. */}

                    {/* The routing setup lives on the card, not behind another
                        dialog: "Routing setup required" is a truthful state and a
                        useless instruction on its own, because the fix is in a
                        system Alloy cannot see. Shown only for Email, and only
                        while receiving is not yet proven. */}
                    {card.channel === "email" && card.receiving.state !== "ready" && card.connected ? (
                        <MailRoutingSetupPanel
                            bindingId={card.primaryBindingId}
                            visibleAddress={card.identity.find((l) => l.label === "Replies")?.value || null}
                        />
                    ) : null}

                    {card.schools.length || card.unparentedRooms.length ? (
                        <SchoolHierarchy card={card} onConfigureLocation={onConfigureLocation} />
                    ) : null}

                    {/* The "Still needs setup" paragraph list used to live here. It
                        restated, at length, what the three rows above already say —
                        and it was where deployment and credential mechanics leaked
                        onto a page an administrator reads every day. Each row now
                        carries its own next action; the detail belongs in the setup
                        flow, not permanently on the card. */}
                </>
            ) : (
                <p className="mt-3 text-[12px] leading-snug text-alloy-midnight/58">
                    {card.channel === "email"
                        ? "Connect email so families can be written to, and so their replies come back into Alloy."
                        : "Connect SMS so families can be texted, and so their replies come back into Alloy."}
                </p>
            )}
        </ConfigurationDetailCard>
    );
}
