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
import type { ReadinessState } from "@/lib/communications/bindingReadiness";
import CommunicationsChannelDialog from "./CommunicationsChannelDialog";

export type CredentialOption = {
    key: string;
    channel: string;
    provider: string;
    label: string;
    description: string;
    available: boolean;
};

/** Only `ready` is affirmative. `verification_required` is deliberately not green —
 *  it is not working yet, and green would say otherwise. */
function toneFor(state: ReadinessState): string {
    switch (state) {
        case "ready":
            return "bg-emerald-600/10 text-emerald-800";
        case "verification_required":
            return "bg-amber-500/12 text-amber-900";
        case "disabled":
            return "bg-alloy-midnight/8 text-alloy-midnight/60";
        default:
            return "bg-alloy-ember/10 text-alloy-ember";
    }
}

function ReadinessRow({
    label,
    state,
    text,
    testId,
}: {
    label: string;
    state: ReadinessState;
    text: string;
    testId: string;
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
        </div>
    );
}

export default function OrganizationCommunicationsPage() {
    const [bindings, setBindings] = useState<BindingView[]>([]);
    const [credentialOptions, setCredentialOptions] = useState<CredentialOption[]>([]);
    const [locations, setLocations] = useState<OrgLocation[]>([]);
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

    const cards = useMemo(() => buildChannelCards(bindings, locations), [bindings, locations]);
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
                        Connect {card.channelLabel}
                    </ConfigurationPrimaryButton>
                )}
            </div>

            {card.connected ? (
                <>
                    <div className="mt-3 space-y-1.5">
                        <ReadinessRow
                            label="Sending"
                            state={card.sending.state}
                            text={card.sending.label}
                            testId={`communications-${card.channel}-sending`}
                        />
                        <ReadinessRow
                            label="Receiving"
                            state={card.receiving.state}
                            text={card.receiving.label}
                            testId={`communications-${card.channel}-receiving`}
                        />
                    </div>

                    <dl className="mt-3 space-y-1 border-t border-alloy-stone/25 pt-2.5">
                        {card.identity.map((line) => (
                            <div key={line.label} className="flex flex-wrap items-baseline gap-x-2">
                                <dt className="w-[68px] shrink-0 text-[11px] font-medium text-alloy-midnight/50">{line.label}</dt>
                                <dd
                                    className={`min-w-0 break-all text-[12px] ${line.value ? "text-alloy-midnight/85" : "italic text-alloy-midnight/45"}`}
                                    data-testid={`communications-${card.channel}-identity-${line.label.toLowerCase()}`}
                                >
                                    {line.value || line.placeholder}
                                </dd>
                            </div>
                        ))}
                    </dl>

                    {card.locations.length ? (
                        <div className="mt-3 border-t border-alloy-stone/25 pt-2.5" data-testid={`communications-${card.channel}-locations`}>
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[11px] font-semibold text-alloy-midnight/62">Locations</p>
                                <p className="text-[10px] text-alloy-midnight/45">
                                    {card.overrideCount === 0
                                        ? "All use the organization identity"
                                        : `${card.overrideCount} of ${card.locations.length} send as themselves`}
                                </p>
                            </div>
                            <ul className="mt-1 space-y-0.5">
                                {card.locations.map((loc) => (
                                    <li
                                        key={loc.locationId}
                                        className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5"
                                        data-testid={`communications-${card.channel}-location-${loc.locationId}`}
                                    >
                                        <span className="min-w-0 truncate text-[11px] text-alloy-midnight/75">{loc.label}</span>
                                        <span className="flex items-baseline gap-2">
                                            <span
                                                className={`text-[11px] ${loc.inherits ? "italic text-alloy-midnight/45" : "font-medium text-alloy-midnight/85"}`}
                                                data-testid={`communications-${card.channel}-location-${loc.locationId}-identity`}
                                            >
                                                {loc.inherits
                                                    ? loc.identity
                                                        ? "Uses organization identity"
                                                        : "Nothing to inherit yet"
                                                    : loc.identity}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onConfigureLocation(loc.locationId, !loc.inherits)}
                                                className="shrink-0 text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                                                data-testid={`communications-${card.channel}-location-${loc.locationId}-action`}
                                            >
                                                {loc.inherits ? "Give its own" : "Change"}
                                            </button>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {card.outstanding.length ? (
                        <div
                            className="mt-3 rounded-md border border-alloy-stone/25 bg-alloy-stone/[0.05] px-2.5 py-2"
                            data-testid={`communications-${card.channel}-outstanding`}
                        >
                            <p className="text-[11px] font-semibold text-alloy-midnight/62">Still needs setup</p>
                            <ul className="mt-1 space-y-0.5">
                                {card.outstanding.map((item) => (
                                    <li key={item} className="text-[11px] leading-snug text-alloy-midnight/70">
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
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
