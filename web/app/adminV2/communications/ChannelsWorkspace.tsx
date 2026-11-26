"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Globe, Mail, MessageCircle, Phone, Smartphone } from "lucide-react";

import Link from "next/link";

import CommunicationsStudioListRow from "@/app/adminV2/communications/CommunicationsStudioListRow";
import { COMMS_PANEL_SHELL_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    fetchCommunicationsBindingsCached,
    type CommunicationsBindingsPayload,
} from "@/lib/communications/communicationsBindingsCache";

type ChannelKey = "email" | "sms" | "in_app" | "push" | "voice";

const CHANNEL_DEFS: {
    key: ChannelKey;
    label: string;
    subtitle: string;
    icon: typeof Mail;
    configurable: boolean;
}[] = [
    { key: "email", label: "Email", subtitle: "Primary email settings and delivery", icon: Mail, configurable: true },
    { key: "sms", label: "SMS", subtitle: "Text message settings and delivery", icon: MessageCircle, configurable: true },
    { key: "in_app", label: "In-App", subtitle: "In-app notifications and messaging", icon: Globe, configurable: true },
    { key: "push", label: "Push", subtitle: "Mobile push notifications", icon: Smartphone, configurable: false },
    { key: "voice", label: "Voice", subtitle: "Voice call communication", icon: Phone, configurable: false },
];

function channelActive(channels: string[], key: ChannelKey): boolean {
    if (key === "push" || key === "voice") return false;
    if (key === "in_app") return true;
    return channels.map((c) => c.toLowerCase()).includes(key);
}

/**
 * Studio Channels - provider configuration inside the Communications product shell.
 * Reuses existing bindings API and CommunicationsSetupClient for Email/SMS configuration.
 */
export default function ChannelsWorkspace() {
    const [channelsAvailable, setChannelsAvailable] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ChannelKey | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { ok, json } = await fetchCommunicationsBindingsCached();
            const payload = json as CommunicationsBindingsPayload;
            if (ok && Array.isArray(payload.channels_available)) {
                setChannelsAvailable(payload.channels_available.map(String));
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selectedDef = useMemo(() => CHANNEL_DEFS.find((c) => c.key === selected) ?? null, [selected]);

    if (selected === "email" || selected === "sms") {
        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-channels-workspace="true">
                <header className="shrink-0 border-b border-alloy-stone/12 px-4 py-2.5">
                    <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                    >
                        &lt;- Channels
                    </button>
                    <h2 className="mt-1 text-[14px] font-semibold text-alloy-midnight">{selectedDef?.label} configuration</h2>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {/*
                     * Configuration has ONE home: /organization/communications. This tab used to
                     * embed a second copy of the setup client, which meant two surfaces could
                     * drift apart and an operator could not tell which one was authoritative.
                     * It points at the canonical surface instead of re-mounting it.
                     */}
                    <div className={`${COMMS_PANEL_SHELL_CLASS} mx-auto max-w-2xl px-4 py-4`}>
                        <p className="text-[13px] font-semibold text-alloy-midnight">
                            {selectedDef?.label} is configured in Organization
                        </p>
                        <p className="mt-1 text-[12px] leading-snug text-alloy-midnight/55">
                            Sending and receiving identities, readiness, and provider connection all live on one page so they
                            cannot disagree.
                        </p>
                        <Link
                            href="/organization/communications"
                            className="mt-3 inline-flex text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                            data-testid="channels-open-organization-communications"
                        >
                            Open Organization → Communications
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto bg-white" data-channels-workspace="true">
            <div className={`${COMMS_PANEL_SHELL_CLASS} mx-auto my-4 max-w-2xl overflow-hidden`}>
                <header className="border-b border-alloy-stone/12 px-4 py-3">
                    <h2 className="text-[13px] font-semibold text-alloy-midnight">Channels</h2>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Provider configuration and delivery readiness</p>
                </header>
                <ul className="divide-y divide-alloy-stone/12">
                    {CHANNEL_DEFS.map((ch) => {
                        const active = channelActive(channelsAvailable, ch.key);
                        const status = !ch.configurable ? "Coming soon" : loading ? "..." : active ? "Active" : "Not ready";
                        const tone = !ch.configurable ? "muted" : active ? "active" : "neutral";
                        const Icon = ch.icon;
                        return (
                            <li key={ch.key}>
                                <CommunicationsStudioListRow
                                    icon={<Icon className="h-4 w-4" aria-hidden strokeWidth={2} />}
                                    title={ch.label}
                                    subtitle={ch.subtitle}
                                    status={status}
                                    statusTone={tone}
                                    disabled={!ch.configurable}
                                    onClick={
                                        ch.configurable
                                            ? () => {
                                                  if (ch.key === "in_app") setSelected("in_app");
                                                  else setSelected(ch.key);
                                              }
                                            : undefined
                                    }
                                />
                            </li>
                        );
                    })}
                </ul>
            </div>

            {selected === "in_app" ? (
                <div className={`${COMMS_PANEL_SHELL_CLASS} mx-auto mb-4 max-w-2xl px-4 py-4`}>
                    <div className="flex items-start gap-3">
                        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-alloy-bend-pine" aria-hidden />
                        <div>
                            <p className="text-[13px] font-semibold text-alloy-midnight">In-App messaging</p>
                            <p className="mt-1 text-[12px] leading-snug text-alloy-midnight/55">
                                In-app notifications are active for record drawers and family workspaces. No separate provider binding is required.
                            </p>
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="mt-3 text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                            >
                                Back to channels
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
