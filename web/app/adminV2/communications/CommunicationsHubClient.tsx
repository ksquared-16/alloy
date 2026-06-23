"use client";

import { useState } from "react";
import Link from "next/link";

import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import TemplatesWorkspace from "@/app/adminV2/communications/TemplatesWorkspace";
import AnnouncementsWorkspace from "@/app/adminV2/communications/AnnouncementsWorkspace";

/**
 * Communications Hub shell (Phase 1 / B3).
 *
 * Permanent IA: [ Inbox ] [ Templates ] [ Announcements ] [ Preferences ].
 * - Inbox: links to the existing inbox surface (no send UI introduced here).
 * - Templates: the live Phase-1 workspace (flag: comms_v2_templates).
 * - Announcements / Preferences: placeholders for later phases.
 */

export type CommunicationsHubFlags = {
    templates: boolean;
    announcements: boolean;
    preferences: boolean;
};

type HubTab = "inbox" | "templates" | "announcements" | "preferences";

const TABS: { key: HubTab; label: string }[] = [
    { key: "inbox", label: "Inbox" },
    { key: "templates", label: "Templates" },
    { key: "announcements", label: "Announcements" },
    { key: "preferences", label: "Preferences" },
];

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
    return (
        <div
            data-comms-hub-placeholder={title.toLowerCase()}
            className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-alloy-stone/30 bg-white/60 p-10 text-center"
        >
            <div className="text-sm font-semibold text-alloy-midnight/80">{title}</div>
            <p className="mt-1 max-w-sm text-xs text-alloy-midnight/55">{note}</p>
        </div>
    );
}

function InboxEntryPanel() {
    return (
        <div
            data-comms-hub-inbox-entry="true"
            className="flex h-full flex-col items-center justify-center rounded-xl border border-alloy-stone/20 bg-white/60 p-10 text-center"
        >
            <div className="text-sm font-semibold text-alloy-midnight/80">Inbox</div>
            <p className="mt-1 max-w-sm text-xs text-alloy-midnight/55">
                Conversations and operational queues live in the full Inbox surface.
            </p>
            <Link
                href="/adminV2/messages"
                className="mt-4 rounded-lg bg-[#00A283] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#00916f]"
            >
                Open Inbox
            </Link>
        </div>
    );
}

export default function CommunicationsHubClient({ flags }: { flags: CommunicationsHubFlags }) {
    const [tab, setTab] = useState<HubTab>(flags.templates ? "templates" : "inbox");

    return (
        <main
            data-comms-hub="true"
            className="flex h-[calc(100dvh-3.75rem)] flex-col bg-[#F8F9FB] px-4 py-3"
        >
            <header className="mb-3 flex items-center justify-between gap-3">
                <h1 className="text-base font-semibold text-alloy-midnight">Communications</h1>
                <SettingsEntityTabBar
                    tabs={TABS}
                    activeKey={tab}
                    onSelect={setTab}
                    aria-label="Communications sections"
                />
            </header>

            <section className="min-h-0 flex-1">
                {tab === "inbox" && <InboxEntryPanel />}

                {tab === "templates" &&
                    (flags.templates ? (
                        <TemplatesWorkspace />
                    ) : (
                        <PlaceholderPanel title="Templates" note="Templates are not enabled for this workspace yet." />
                    ))}

                {tab === "announcements" &&
                    (flags.announcements ? (
                        <AnnouncementsWorkspace />
                    ) : (
                        <PlaceholderPanel
                            title="Announcements"
                            note="One-to-many announcements arrive in a later phase. The shell is reserved here."
                        />
                    ))}

                {tab === "preferences" && (
                    <PlaceholderPanel
                        title="Preferences"
                        note="Per-person communication preferences arrive in a later phase. The shell is reserved here."
                    />
                )}
            </section>
        </main>
    );
}
