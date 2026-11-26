"use client";

import { ArrowRight, Mail, Megaphone, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ProcessingLandingActionCard from "@/app/adminV2/pos/ProcessingLandingActionCard";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import { useCommunicationsWorkspaceKpiOptional } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import {
    WorkspaceOverviewActionRow,
    WorkspaceOverviewActivityBand,
    WorkspaceOverviewInfoGrid,
    WorkspaceOverviewInfoPrimary,
    WorkspaceOverviewStack,
} from "@/components/workspace/WorkspaceOverviewLayout";
import { SurfaceHeaderKpiCard } from "@/components/presentation/workspace/WorkspaceHeader";
import type { WorkspaceHeaderKpiVm } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import {
    computeAnnouncementWorkspaceKpis,
    computeTemplateWorkspaceKpis,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";
import {
    conversationDisplayTitle,
    conversationQueueStatusPill,
    queueStatusPillClass,
    type ConversationSummary,
} from "@/lib/communications/v2/commandCenterViewModel";
import {
    getCommandCenterCacheSnapshot,
    subscribeCommandCenterCache,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import {
    getCommunicationsWarmAnnouncements,
    subscribeCommunicationsWorkspaceWarm,
} from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
import { relTime } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import { COMMS_FIXTURES_ENABLED, FIXTURE_CONVERSATIONS } from "@/app/adminV2/communications/fixtures";

type OverviewAnnouncementRow = {
    id: string;
    title: string;
    status: string;
    channels?: string[];
    updated_at: string | null;
};

function initialConversations(): ConversationSummary[] {
    if (COMMS_FIXTURES_ENABLED) return FIXTURE_CONVERSATIONS;
    return getCommandCenterCacheSnapshot()?.conversations ?? [];
}

const OVERVIEW_KPIS = (args: {
    needsReply: number;
    unread: number;
    scheduled: number;
    sent: number;
}): WorkspaceHeaderKpiVm[] => [
    { slot: 1, label: "Reply", icon: "message", accent: "pine", formattedValue: String(args.needsReply), status: "unknown", sourceKey: null, drillHref: null },
    { slot: 2, label: "Unread", icon: "bolt", accent: "ember", formattedValue: String(args.unread), status: "unknown", sourceKey: null, drillHref: null },
    { slot: 3, label: "Scheduled", icon: "calendar", accent: "stone", formattedValue: String(args.scheduled), status: "unknown", sourceKey: null, drillHref: null },
    { slot: 4, label: "Sent", icon: "book", accent: "blue", formattedValue: String(args.sent), status: "unknown", sourceKey: null, drillHref: null },
];

export default function CommunicationsOverviewLanding({
    onNavigateTab,
    onComposeNew,
}: {
    onNavigateTab: (tab: CommunicationsModalTab) => void;
    onComposeNew?: () => void;
}) {
    const kpiContext = useCommunicationsWorkspaceKpiOptional();
    const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);

    useEffect(() => {
        if (COMMS_FIXTURES_ENABLED) return;
        return subscribeCommandCenterCache(() => {
            const snap = getCommandCenterCacheSnapshot();
            if (snap) setConversations(snap.conversations);
        });
    }, []);

    useEffect(() => {
        if (COMMS_FIXTURES_ENABLED) return;
        return subscribeCommunicationsWorkspaceWarm(() => {
            /* warm cache updates flow through KPI context */
        });
    }, []);

    const inboxMetrics = kpiContext?.inbox.metrics;
    const announcementRows = kpiContext?.announcements.rows ?? [];
    const templateRows = kpiContext?.templates.rows ?? [];
    const announcementKpis = computeAnnouncementWorkspaceKpis(announcementRows);
    const templateKpis = computeTemplateWorkspaceKpis(templateRows);

    const needsReplyConversations = useMemo(() => {
        return conversations
            .filter((c) => {
                const pill = conversationQueueStatusPill(c);
                return pill.label === "Needs response" || pill.label === "Follow up" || pill.label === "Overdue";
            })
            .slice(0, 3);
    }, [conversations]);

    const warmAnnouncements = getCommunicationsWarmAnnouncements() ?? [];
    const recentAnnouncements: OverviewAnnouncementRow[] = (
        warmAnnouncements.length > 0
            ? warmAnnouncements
            : announcementRows.map((r) => ({
                  id: `${r.status}:${r.updated_at ?? "unknown"}`,
                  title: "Untitled",
                  status: r.status,
                  channels: [],
                  updated_at: r.updated_at,
              }))
    ).slice(0, 3);

    const overviewKpis = OVERVIEW_KPIS({
        needsReply: inboxMetrics?.requiresResponse ?? 0,
        unread: inboxMetrics?.unread ?? 0,
        scheduled: announcementKpis.scheduled,
        sent: announcementKpis.sentRecently + templateKpis.active,
    });

    return (
        <WorkspaceSurface data-comms-overview-landing="true">
            <WorkspaceOverviewStack>
                <WorkspaceOverviewActionRow>
                    <ProcessingLandingActionCard
                        tier="primary"
                        icon={<MessageSquare className="h-5 w-5" aria-hidden />}
                        title="Reply to Families"
                        description="Continue conversations and respond to messages."
                        cta="Open Inbox"
                        onClick={() => onNavigateTab("inbox")}
                        testId="comms-reply-families-card"
                    />
                    <ProcessingLandingActionCard
                        tier="secondary"
                        icon={<Megaphone className="h-5 w-5" aria-hidden />}
                        title="Send Announcement"
                        description="Broadcast updates to families and staff."
                        cta="Create Announcement"
                        onClick={() => onNavigateTab("announcements")}
                        testId="comms-announcement-card"
                    />
                    <ProcessingLandingActionCard
                        tier="tertiary"
                        icon={<Mail className="h-5 w-5" aria-hidden />}
                        title="Compose Message"
                        description="Send a new email or SMS to families."
                        cta="Compose"
                        onClick={() => (onComposeNew ? onComposeNew() : onNavigateTab("inbox"))}
                        testId="comms-compose-card"
                    />
                </WorkspaceOverviewActionRow>

                <WorkspaceOverviewActivityBand>
                        {overviewKpis.map((kpi) => (
                            <SurfaceHeaderKpiCard key={kpi.slot} kpi={kpi} variant="work-unit" density="compact" />
                        ))}
                </WorkspaceOverviewActivityBand>

                <WorkspaceOverviewInfoGrid>
                    <WorkspaceOverviewInfoPrimary>
                    <ContinuePanel title="Continue conversations" action="View all" onAction={() => onNavigateTab("inbox")}>
                        {needsReplyConversations.length === 0 ? (
                            <EmptyHint>No conversations need a reply right now.</EmptyHint>
                        ) : (
                            <ul className="space-y-1.5">
                                {needsReplyConversations.map((row) => {
                                    const pill = conversationQueueStatusPill(row);
                                    const at = row.last_message_at ?? row.last_activity_at ?? null;
                                    return (
                                        <li key={row.id}>
                                            <button
                                                type="button"
                                                onClick={() => onNavigateTab("inbox")}
                                                className="group flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-alloy-stone/[0.04]"
                                            >
                                                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-alloy-stone/30 text-[11px] font-bold text-alloy-midnight/55">
                                                    {(conversationDisplayTitle(row).trim()[0] ?? "?").toUpperCase()}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[13px] font-semibold text-alloy-midnight">
                                                        {conversationDisplayTitle(row)}
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-[11px] text-alloy-midnight/45">
                                                        {row.last_message_preview ?? "No preview"}
                                                    </span>
                                                    <span className={`mt-0.5 inline-flex text-[10px] font-semibold ${queueStatusPillClass(pill.tone)}`}>
                                                        {pill.label}
                                                    </span>
                                                    <span className="ml-2 text-[10px] text-alloy-midnight/35">{relTime(at)}</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </ContinuePanel>
                    </WorkspaceOverviewInfoPrimary>

                    <ContinuePanel title="Recent announcements" action="View all" onAction={() => onNavigateTab("announcements")}>
                        {recentAnnouncements.length === 0 ? (
                            <EmptyHint>Drafts and sent announcements appear here.</EmptyHint>
                        ) : (
                            <ul className="space-y-1.5">
                                {recentAnnouncements.map((row) => (
                                    <li
                                        key={row.id}
                                        className="flex items-start gap-3 rounded-lg px-2 py-2.5"
                                    >
                                        <span className="mt-1 h-8 w-0.5 shrink-0 rounded-full bg-alloy-midnight/25" aria-hidden />
                                        <span className="min-w-0 flex-1">
                                            <div className="truncate text-[13px] font-semibold text-alloy-midnight">{row.title}</div>
                                            <div className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                                {row.status === "scheduled" ? "Scheduled" : row.status === "draft" ? "Draft" : "Sent"}
                                                {row.updated_at ? ` - ${relTime(row.updated_at)}` : ""}
                                            </div>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ContinuePanel>

                    <section>
                        <header className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="text-[13px] font-semibold text-alloy-midnight/70">Quick navigation</h2>
                        </header>
                        <ul className="divide-y divide-alloy-stone/12 overflow-hidden rounded-xl bg-white shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
                            {[
                                { tab: "inbox" as const, label: "Inbox", hint: "View all conversations" },
                                { tab: "announcements" as const, label: "Announcements", hint: "Create or manage broadcasts" },
                                { tab: "templates" as const, label: "Templates", hint: "Manage message templates" },
                                { tab: "scheduled" as const, label: "Scheduled", hint: "View scheduled messages" },
                            ].map((item) => (
                                <li key={item.tab}>
                                    <button
                                        type="button"
                                        onClick={() => onNavigateTab(item.tab)}
                                        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-alloy-stone/[0.03]"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-[12px] font-medium text-alloy-midnight/70">{item.label}</span>
                                            <span className="block text-[10px] text-alloy-midnight/40">{item.hint}</span>
                                        </span>
                                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/25" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                </WorkspaceOverviewInfoGrid>
            </WorkspaceOverviewStack>
        </WorkspaceSurface>
    );
}

function ContinuePanel({
    title,
    action,
    onAction,
    children,
}: {
    title: string;
    action: string;
    onAction: () => void;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-alloy-stone/15 bg-white px-4 py-3">
            <header className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-alloy-midnight">{title}</h2>
                <button type="button" onClick={onAction} className="text-[11px] font-semibold text-alloy-bend-pine hover:underline">
                    {action} -&gt;
                </button>
            </header>
            {children}
        </section>
    );
}

function EmptyHint({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-lg border border-dashed border-alloy-stone/20 px-3 py-8 text-center text-[12px] text-alloy-midnight/45">
            {children}
        </div>
    );
}
