"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    COMMS_EMPTY_STATE_CLASS,
    COMMS_LIBRARY_ROW_CLASS,
    COMMS_LIBRARY_ROW_SELECTED_CLASS,
    COMMS_PANEL_SHELL_CLASS,
    CommsLibraryListReserve,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import { useCommunicationsWorkspaceKpiOptional } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import { formatMessagingDateTimeLocal } from "@/lib/adminV2/messaging/messagingLocalDateTime";
import type { InboxScheduledSendListItem } from "@/lib/communications/inboxThreadTypes";
import {
    getCommunicationsWarmAnnouncements,
    subscribeCommunicationsWorkspaceWarm,
} from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
import { relTime } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";

type ScheduledAnnouncementRow = {
    id: string;
    title: string;
    status: string;
    channels: string[];
    updated_at: string | null;
};

function channelLabel(ch: string): string {
    const c = ch.trim().toLowerCase();
    if (c === "email") return "Email";
    if (c === "sms") return "SMS";
    if (c === "in_app") return "In-app";
    return ch || "-";
}

/**
 * Scheduled workspace - presentation shell for pending outbound messages and scheduled announcements.
 * Uses existing inbox scheduled folder API and warm announcement cache only.
 */
export default function ScheduledWorkspace() {
    const kpiContext = useCommunicationsWorkspaceKpiOptional();
    const [scheduledSends, setScheduledSends] = useState<InboxScheduledSendListItem[]>([]);
    const [announcements, setAnnouncements] = useState<ScheduledAnnouncementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [selectedSendId, setSelectedSendId] = useState<string | null>(null);
    const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null);

    const loadScheduled = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/inbox/threads?folder=scheduled&compact=1", { credentials: "include" });
            if (!res.ok) throw new Error(`Failed to load scheduled sends (${res.status})`);
            const data = (await res.json()) as { scheduled_sends?: InboxScheduledSendListItem[] };
            setScheduledSends(Array.isArray(data.scheduled_sends) ? data.scheduled_sends : []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load scheduled messages");
            setScheduledSends([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const syncAnnouncements = useCallback(() => {
        const warm = getCommunicationsWarmAnnouncements();
        const rows = (warm ?? kpiContext?.announcements.rows ?? []) as ScheduledAnnouncementRow[];
        const next = rows.filter((r) => (r.status ?? "").toLowerCase() === "scheduled");
        // IDEMPOTENT: keep the previous array reference when the scheduled set is unchanged. Without
        // this, every call produced a new array → a re-render → (if `kpiContext.announcements.rows`
        // churns) a new `syncAnnouncements` identity → the effect re-ran → setState → a React
        // max-update-depth render loop (the residual half of the scheduled-workspace loop).
        setAnnouncements((prev) =>
            prev.length === next.length &&
            prev.every((p, i) => p.id === next[i]!.id && p.status === next[i]!.status)
                ? prev
                : next,
        );
    }, [kpiContext?.announcements.rows]);

    // Load the scheduled sends ONCE. Keep this network fetch OFF the announcements-sync effect: that
    // effect's `syncAnnouncements` changes identity whenever `kpiContext.announcements.rows` gets a new
    // reference, and coupling the two here re-ran `loadScheduled` on every such change — a runaway
    // `/inbox/threads?folder=scheduled` fetch loop (~140 requests on open). `loadScheduled` is stable.
    useEffect(() => {
        void loadScheduled();
    }, [loadScheduled]);

    // Announcements are a cheap, in-memory warm-cache projection. Subscribe ONCE (via a ref to the
    // latest sync) so the subscription itself never re-runs on `syncAnnouncements` identity churn; a
    // separate cheap effect re-syncs when the source rows change. With the idempotent setter above, a
    // re-sync that finds no change is a no-op — no render loop.
    const syncRef = useRef(syncAnnouncements);
    syncRef.current = syncAnnouncements;
    useEffect(() => {
        syncRef.current();
        return subscribeCommunicationsWorkspaceWarm(() => syncRef.current());
    }, []);
    useEffect(() => {
        syncAnnouncements();
    }, [syncAnnouncements]);

    const selectedSend = useMemo(
        () => scheduledSends.find((s) => s.id === selectedSendId) ?? null,
        [scheduledSends, selectedSendId]
    );
    const selectedAnnouncement = useMemo(
        () => announcements.find((a) => a.id === selectedAnnouncementId) ?? null,
        [announcements, selectedAnnouncementId]
    );

    return (
        <div
            className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden"
            data-scheduled-workspace="true"
        >
            <div className={`${COMMS_PANEL_SHELL_CLASS} m-3 mr-0 flex min-h-0 flex-col overflow-hidden`}>
                <header className="shrink-0 border-b border-alloy-stone/12 px-4 py-3">
                    <h2 className="text-[13px] font-semibold text-alloy-midnight">Scheduled messages</h2>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                        Pending outbound sends and scheduled announcements
                    </p>
                </header>

                {loading ? (
                    <CommsLibraryListReserve label="Loading scheduled messages..." />
                ) : err ? (
                    <p className="p-4 text-[12px] text-alloy-ember">{err}</p>
                ) : scheduledSends.length === 0 && announcements.length === 0 ? (
                    <div className="p-4">
                        <div className={COMMS_EMPTY_STATE_CLASS}>No scheduled messages yet.</div>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {announcements.length > 0 ? (
                            <section className="mb-3">
                                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    Announcements
                                </p>
                                <ul>
                                    {announcements.map((row) => {
                                        const selected = selectedAnnouncementId === row.id;
                                        return (
                                            <li key={row.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedAnnouncementId(row.id);
                                                        setSelectedSendId(null);
                                                    }}
                                                    className={`${COMMS_LIBRARY_ROW_CLASS} ${selected ? COMMS_LIBRARY_ROW_SELECTED_CLASS : ""}`}
                                                >
                                                    <span className="text-[12px] font-semibold text-alloy-midnight">{row.title}</span>
                                                    <span className="text-[10px] text-alloy-midnight/45">
                                                        {row.channels.map(channelLabel).join(" - ") || "No channels"}
                                                        {row.updated_at ? ` - ${relTime(row.updated_at)}` : ""}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ) : null}

                        {scheduledSends.length > 0 ? (
                            <section>
                                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    Outbound sends
                                </p>
                                <ul>
                                    {scheduledSends.map((row) => {
                                        const selected = selectedSendId === row.id;
                                        return (
                                            <li key={row.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSendId(row.id);
                                                        setSelectedAnnouncementId(null);
                                                    }}
                                                    className={`${COMMS_LIBRARY_ROW_CLASS} ${selected ? COMMS_LIBRARY_ROW_SELECTED_CLASS : ""}`}
                                                >
                                                    <span className="text-[12px] font-semibold text-alloy-midnight">
                                                        {row.contact_display ?? "Recipient"}
                                                    </span>
                                                    <span className="line-clamp-2 text-[10px] text-alloy-midnight/45">
                                                        {channelLabel(row.channel)} - {row.body_preview}
                                                    </span>
                                                    <span className="text-[10px] text-alloy-midnight/40">
                                                        {formatMessagingDateTimeLocal(row.scheduled_for)}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ) : null}
                    </div>
                )}
            </div>

            <aside className="m-3 ml-0 flex min-h-0 flex-col overflow-hidden">
                <div className={`${COMMS_PANEL_SHELL_CLASS} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                    <header className="shrink-0 border-b border-alloy-stone/12 px-4 py-3">
                        <h3 className="text-[12px] font-semibold text-alloy-midnight">Details</h3>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {selectedAnnouncement ? (
                            <div className="space-y-2 text-[12px]">
                                <p className="font-semibold text-alloy-midnight">{selectedAnnouncement.title}</p>
                                <p className="text-alloy-midnight/55">
                                    Scheduled announcement - {selectedAnnouncement.channels.map(channelLabel).join(", ") || "-"}
                                </p>
                                <p className="text-[11px] text-alloy-midnight/45">
                                    Edit and send from the Announcements workspace.
                                </p>
                            </div>
                        ) : selectedSend ? (
                            <div className="space-y-2 text-[12px]">
                                <p className="font-semibold text-alloy-midnight">{selectedSend.contact_display ?? "Recipient"}</p>
                                <p className="text-alloy-midnight/55">{channelLabel(selectedSend.channel)}</p>
                                {selectedSend.subject_snapshot ? (
                                    <p className="font-medium text-alloy-midnight/70">{selectedSend.subject_snapshot}</p>
                                ) : null}
                                <p className="whitespace-pre-wrap text-alloy-midnight/60">{selectedSend.body_preview}</p>
                                <p className="text-[11px] text-alloy-midnight/45">
                                    Scheduled for {formatMessagingDateTimeLocal(selectedSend.scheduled_for)}
                                </p>
                            </div>
                        ) : (
                            <p className="text-[12px] text-alloy-midnight/50">Select a scheduled item to preview details.</p>
                        )}
                    </div>
                </div>
            </aside>
        </div>
    );
}
