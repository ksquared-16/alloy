"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import QuickMessageModal from "@/app/adminV2/components/QuickMessageModal";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { dispatchInboxUnreadRefresh } from "@/lib/adminV2/inboxNavUnreadCache";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import type {
    InboxFolder,
    InboxScheduledSendListItem,
    InboxThreadListItem,
    InboxThreadsListResponse,
} from "@/lib/communications/inboxThreadTypes";
import { INBOX_FOLDERS } from "@/lib/communications/inboxThreadTypes";

const FOLDER_LABELS: Record<InboxFolder, string> = {
    inbox: "Inbox",
    unread: "Unread",
    sent: "Sent",
    scheduled: "Scheduled",
    archived: "Archived",
};

function channelLabel(ch: string): string {
    const c = ch.trim().toLowerCase();
    if (c === "email") return "Email";
    if (c === "sms") return "SMS";
    if (c === "in_app") return "Internal";
    return ch || "—";
}

function previewSnippet(preview: InboxThreadListItem["last_message_preview"]): string {
    if (!preview?.body) return "No message preview";
    const t = preview.body.replace(/\s+/g, " ").trim();
    return t.length > 100 ? `${t.slice(0, 97)}…` : t;
}

function parseFolderParam(raw: string | null): InboxFolder {
    const s = (raw ?? "").trim().toLowerCase();
    if (INBOX_FOLDERS.includes(s as InboxFolder)) return s as InboxFolder;
    return "inbox";
}

export default function InboxClient() {
    const searchParams = useSearchParams();
    const viewerTimeZone = useAdminViewerTimezone();
    const initialFolder = parseFolderParam(searchParams.get("folder"));

    const [folder, setFolder] = useState<InboxFolder>(initialFolder);
    const [threads, setThreads] = useState<InboxThreadListItem[]>([]);
    const [scheduledSends, setScheduledSends] = useState<InboxScheduledSendListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [archiving, setArchiving] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);

    const selectedThread = useMemo(
        () => threads.find((t) => t.id === selectedId) ?? null,
        [threads, selectedId]
    );

    const loadFolder = useCallback(async (f: InboxFolder) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/inbox/threads?folder=${encodeURIComponent(f)}&limit=50`,
                { credentials: "include" }
            );
            const json = (await res.json().catch(() => ({}))) as InboxThreadsListResponse & { error?: string };
            if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            setThreads(Array.isArray(json.threads) ? json.threads : []);
            setScheduledSends(Array.isArray(json.scheduled_sends) ? json.scheduled_sends : []);
            setSelectedId((prev) => {
                if (f === "scheduled") return null;
                const list = json.threads ?? [];
                if (prev && list.some((t) => t.id === prev)) return prev;
                return list[0]?.id ?? null;
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load inbox");
            setThreads([]);
            setScheduledSends([]);
            setSelectedId(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadFolder(folder);
    }, [folder, loadFolder]);

    const onArchiveToggle = async (thread: InboxThreadListItem, archived: boolean) => {
        setArchiving(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/inbox/threads/${encodeURIComponent(thread.id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            dispatchInboxUnreadRefresh();
            await loadFolder(folder);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Archive failed");
        } finally {
            setArchiving(false);
        }
    };

    return (
        <div className="flex h-[calc(100dvh-3.75rem)] min-h-[32rem] flex-col bg-[#F8F9FB] text-alloy-midnight">
            <header className="flex shrink-0 items-center justify-between border-b border-alloy-stone/15 bg-white/95 px-5 py-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Admin V2 · Communications
                    </p>
                    <h1 className="text-lg font-semibold text-alloy-midnight">Inbox</h1>
                </div>
                <button
                    type="button"
                    onClick={() => setComposeOpen(true)}
                    className="rounded-md bg-[#00A283] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#009276]"
                >
                    Compose
                </button>
            </header>

            <div className="flex min-h-0 flex-1">
                <nav
                    className="flex w-[11.5rem] shrink-0 flex-col gap-0.5 border-r border-alloy-stone/12 bg-white/80 p-2"
                    aria-label="Inbox folders"
                >
                    {INBOX_FOLDERS.map((f) => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFolder(f)}
                            className={`rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                                folder === f
                                    ? "bg-[#00A283]/12 text-alloy-midnight ring-1 ring-[#00A283]/25"
                                    : "text-alloy-midnight/70 hover:bg-alloy-stone/8"
                            }`}
                        >
                            {FOLDER_LABELS[f]}
                        </button>
                    ))}
                    <div className="mt-3 border-t border-alloy-stone/10 pt-2 opacity-50">
                        <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Coming soon
                        </p>
                        {["Email", "SMS", "Internal"].map((label) => (
                            <div
                                key={label}
                                className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-alloy-midnight/45"
                                title="Channel filters coming in a future release"
                            >
                                {label}
                            </div>
                        ))}
                    </div>
                </nav>

                <section className="flex w-[min(22rem,34vw)] shrink-0 flex-col border-r border-alloy-stone/12 bg-white/90">
                    <div className="border-b border-alloy-stone/10 px-3 py-2">
                        <p className="text-xs font-semibold text-alloy-midnight/55">{FOLDER_LABELS[folder]}</p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {loading ? (
                            <p className="p-4 text-sm text-alloy-midnight/55">Loading…</p>
                        ) : error ? (
                            <p className="p-4 text-sm text-red-700/90">{error}</p>
                        ) : folder === "scheduled" ? (
                            scheduledSends.length === 0 ? (
                                <p className="p-4 text-sm text-alloy-midnight/55">No scheduled sends.</p>
                            ) : (
                                scheduledSends.map((row) => (
                                    <div
                                        key={row.id}
                                        className="border-b border-alloy-stone/8 px-3 py-3 text-sm"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="rounded bg-alloy-stone/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-alloy-midnight/60">
                                                {channelLabel(row.channel)}
                                            </span>
                                            <span className="text-[11px] text-alloy-midnight/45">{row.status}</span>
                                        </div>
                                        <p className="mt-1 font-medium text-alloy-midnight/85">
                                            {row.contact_display ?? "Recipient"}
                                        </p>
                                        <p className="mt-0.5 line-clamp-2 text-[12px] text-alloy-midnight/60">
                                            {row.body_preview}
                                        </p>
                                        <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                            {formatDateTimeForUserDisplay(row.scheduled_for, viewerTimeZone)}
                                        </p>
                                    </div>
                                ))
                            )
                        ) : threads.length === 0 ? (
                            <p className="p-4 text-sm text-alloy-midnight/55">No conversations in this folder.</p>
                        ) : (
                            threads.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedId(t.id)}
                                    className={`w-full border-b border-alloy-stone/8 px-3 py-3 text-left transition-colors ${
                                        selectedId === t.id ? "bg-[#00A283]/8" : "hover:bg-alloy-stone/6"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                {t.has_unread ? (
                                                    <span
                                                        className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#00A283]"
                                                        aria-label="Unread"
                                                    />
                                                ) : null}
                                                <span className="truncate font-medium text-alloy-midnight/88">
                                                    {t.contact_display ?? t.entity_chip?.label ?? "Conversation"}
                                                </span>
                                            </div>
                                            {t.family_display ? (
                                                <p className="truncate text-[11px] text-alloy-midnight/50">
                                                    {t.family_display}
                                                </p>
                                            ) : null}
                                            {t.entity_chip ? (
                                                <span className="mt-1 inline-block max-w-full truncate rounded bg-alloy-stone/10 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/65">
                                                    {t.entity_chip.label}
                                                </span>
                                            ) : null}
                                            <p className="mt-1 line-clamp-2 text-[12px] text-alloy-midnight/58">
                                                {previewSnippet(t.last_message_preview)}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <span className="text-[10px] font-semibold uppercase text-alloy-midnight/40">
                                                {channelLabel(t.channel)}
                                            </span>
                                            <p className="text-[10px] text-alloy-midnight/45">
                                                {t.sort_at
                                                    ? formatDateTimeForUserDisplay(t.sort_at, viewerTimeZone)
                                                    : "—"}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </section>

                <div className="flex min-w-0 flex-1">
                    <section className="flex min-w-0 flex-1 flex-col bg-[#FAFBFC]">
                        {folder === "scheduled" ? (
                            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                                <p className="text-sm font-medium text-alloy-midnight/70">Scheduled sends</p>
                                <p className="mt-2 max-w-sm text-sm text-alloy-midnight/55">
                                    Full scheduling edit and conversation detail ship in a later sprint. This folder
                                    lists pending outbound messages from Task Assist and tour scheduling.
                                </p>
                            </div>
                        ) : !selectedThread ? (
                            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                                <p className="text-sm text-alloy-midnight/55">Select a conversation</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between border-b border-alloy-stone/12 bg-white/90 px-4 py-3">
                                    <div>
                                        <h2 className="text-base font-semibold text-alloy-midnight">
                                            {selectedThread.contact_display ??
                                                selectedThread.entity_chip?.label ??
                                                "Conversation"}
                                        </h2>
                                        <p className="text-[12px] text-alloy-midnight/50">
                                            {channelLabel(selectedThread.channel)}
                                            {selectedThread.family_display
                                                ? ` · ${selectedThread.family_display}`
                                                : ""}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={archiving}
                                        onClick={() =>
                                            onArchiveToggle(selectedThread, !selectedThread.is_archived)
                                        }
                                        className="rounded-md border border-alloy-stone/20 bg-white px-2.5 py-1 text-[12px] font-semibold text-alloy-midnight/75 hover:border-alloy-stone/35 disabled:opacity-50"
                                    >
                                        {selectedThread.is_archived ? "Unarchive" : "Archive"}
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4">
                                    <div className="mx-auto max-w-xl rounded-xl border border-alloy-stone/12 bg-white p-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                            Thread preview (Sprint A)
                                        </p>
                                        <p className="mt-2 text-sm text-alloy-midnight/70">
                                            {previewSnippet(selectedThread.last_message_preview)}
                                        </p>
                                        <p className="mt-3 text-[12px] text-alloy-midnight/50">
                                            Full message history and compose remain in record drawers for Sprint A.
                                            Open the linked record to reply.
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </section>

                    <aside className="hidden w-[14rem] shrink-0 border-l border-alloy-stone/12 bg-white/85 p-4 xl:block">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Context
                        </p>
                        {selectedThread && folder !== "scheduled" ? (
                            <div className="mt-3 space-y-3 text-sm">
                                {selectedThread.entity_chip ? (
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase text-alloy-midnight/40">
                                            Record
                                        </p>
                                        <p className="mt-1 font-medium text-alloy-midnight/80">
                                            {selectedThread.entity_chip.label}
                                        </p>
                                        <p className="text-[11px] text-alloy-midnight/45">
                                            {selectedThread.entity_chip.entity_type}
                                        </p>
                                    </div>
                                ) : null}
                                <div>
                                    <p className="text-[10px] font-semibold uppercase text-alloy-midnight/40">
                                        Participants
                                    </p>
                                    <p className="mt-1 text-alloy-midnight/70">
                                        {selectedThread.contact_display ?? "—"}
                                    </p>
                                </div>
                                <p className="text-[11px] leading-relaxed text-alloy-midnight/45">
                                    Related activity and full communication history will appear here in a later sprint.
                                </p>
                            </div>
                        ) : (
                            <p className="mt-3 text-[12px] text-alloy-midnight/45">
                                Select a conversation to see record context.
                            </p>
                        )}
                    </aside>
                </div>
            </div>

            <QuickMessageModal
                open={composeOpen}
                seed={null}
                onClose={() => {
                    setComposeOpen(false);
                    dispatchInboxUnreadRefresh();
                    void loadFolder(folder);
                }}
            />
        </div>
    );
}
