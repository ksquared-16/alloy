"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import QuickMessageModal from "@/app/adminV2/components/QuickMessageModal";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { dispatchInboxUnreadRefresh } from "@/lib/adminV2/inboxNavUnreadCache";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { resolveInboxEntityDrawerTarget } from "@/lib/communications/inboxEntityDrawerTarget";
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

const MODAL_THREAD_LIMIT = 20;

export function parseInboxFolderParam(raw: string | null | undefined): InboxFolder {
    const s = (raw ?? "").trim().toLowerCase();
    if (INBOX_FOLDERS.includes(s as InboxFolder)) return s as InboxFolder;
    return "inbox";
}

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

function InboxListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-0 p-2" aria-hidden>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="animate-pulse border-b border-alloy-stone/8 px-2 py-2.5">
                    <div className="h-3 w-2/3 rounded bg-alloy-stone/15" />
                    <div className="mt-2 h-2.5 w-full rounded bg-alloy-stone/10" />
                    <div className="mt-1 h-2.5 w-4/5 rounded bg-alloy-stone/10" />
                </div>
            ))}
        </div>
    );
}

export type InboxPanelProps = {
    layout: "page" | "modal";
    initialFolder?: InboxFolder;
    onClose?: () => void;
    composeOpen?: boolean;
    onComposeOpenChange?: (open: boolean) => void;
};

export default function InboxPanel({
    layout,
    initialFolder = "inbox",
    onClose,
    composeOpen: composeOpenProp,
    onComposeOpenChange,
}: InboxPanelProps) {
    const viewerTimeZone = useAdminViewerTimezone();
    const adminDrawer = useAdminDrawerOptional();
    const isModal = layout === "modal";

    const [folder, setFolder] = useState<InboxFolder>(initialFolder);
    const [threads, setThreads] = useState<InboxThreadListItem[]>([]);
    const [scheduledSends, setScheduledSends] = useState<InboxScheduledSendListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [archiving, setArchiving] = useState(false);
    const [composeOpenInternal, setComposeOpenInternal] = useState(false);

    const composeOpen = composeOpenProp ?? composeOpenInternal;
    const setComposeOpen = onComposeOpenChange ?? setComposeOpenInternal;

    const selectedThread = useMemo(
        () => threads.find((t) => t.id === selectedId) ?? null,
        [threads, selectedId]
    );

    const selectedDrawerTarget = useMemo(() => {
        if (!selectedThread) return null;
        return resolveInboxEntityDrawerTarget(
            selectedThread.entity_chip?.entity_type ?? selectedThread.primary_entity_type,
            selectedThread.entity_chip?.entity_id ?? selectedThread.primary_entity_id
        );
    }, [selectedThread]);

    const loadFolder = useCallback(
        async (f: InboxFolder) => {
            setLoading(true);
            setError(null);
            try {
                const limit = isModal ? MODAL_THREAD_LIMIT : 50;
                const compact = isModal ? "&compact=1" : "";
                const res = await fetch(
                    `/api/admin/inbox/threads?folder=${encodeURIComponent(f)}&limit=${limit}${compact}`,
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
                    if (isModal) return null;
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
        },
        [isModal]
    );

    useEffect(() => {
        void loadFolder(folder);
    }, [folder, loadFolder]);

    const onOpenRecord = useCallback(() => {
        if (!selectedDrawerTarget || !adminDrawer) return;
        adminDrawer.openDrawer({
            type: selectedDrawerTarget.drawerType,
            id: selectedDrawerTarget.entityId,
            opportunityWorkspaceContext: null,
        });
        onClose?.();
    }, [adminDrawer, onClose, selectedDrawerTarget]);

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

    const threadList = (
        <>
            {loading ? (
                <InboxListSkeleton rows={isModal ? 4 : 6} />
            ) : error ? (
                <p className="p-3 text-sm text-red-700/90">{error}</p>
            ) : folder === "scheduled" ? (
                scheduledSends.length === 0 ? (
                    <p className="p-3 text-sm text-alloy-midnight/55">No scheduled sends.</p>
                ) : (
                    scheduledSends.map((row) => (
                        <div key={row.id} className="border-b border-alloy-stone/8 px-3 py-2.5 text-sm">
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
                <p className="p-3 text-sm text-alloy-midnight/55">No conversations in this folder.</p>
            ) : (
                threads.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full border-b border-alloy-stone/8 px-3 py-2.5 text-left transition-colors ${
                            selectedId === t.id
                                ? "bg-[#00A283]/10 ring-1 ring-inset ring-[#00A283]/20"
                                : "hover:bg-alloy-stone/6"
                        }`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    {t.has_unread ? (
                                        <span
                                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#00A283]"
                                            aria-label="Unread"
                                        />
                                    ) : null}
                                    <span
                                        className={`truncate text-[13px] ${
                                            t.has_unread ? "font-semibold text-alloy-midnight" : "font-medium text-alloy-midnight/88"
                                        }`}
                                    >
                                        {t.contact_display ?? t.entity_chip?.label ?? "Conversation"}
                                    </span>
                                </div>
                                {t.family_display ? (
                                    <p className="truncate text-[10px] text-alloy-midnight/50">{t.family_display}</p>
                                ) : null}
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-alloy-midnight/58">
                                    {previewSnippet(t.last_message_preview)}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <span className="text-[9px] font-semibold uppercase text-alloy-midnight/40">
                                    {channelLabel(t.channel)}
                                </span>
                                <p className="text-[10px] text-alloy-midnight/45">
                                    {t.sort_at ? formatDateTimeForUserDisplay(t.sort_at, viewerTimeZone) : "—"}
                                </p>
                            </div>
                        </div>
                    </button>
                ))
            )}
        </>
    );

    const detailPanel = selectedThread ? (
        <div
            className={`flex shrink-0 flex-col border-t border-alloy-stone/12 bg-white/95 ${
                isModal ? "max-h-[38%] min-h-[9rem]" : ""
            }`}
        >
            <div className="flex items-center justify-between gap-2 border-b border-alloy-stone/10 px-3 py-2">
                <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-alloy-midnight">
                        {selectedThread.contact_display ??
                            selectedThread.entity_chip?.label ??
                            "Conversation"}
                    </h2>
                    <p className="text-[10px] text-alloy-midnight/50">{channelLabel(selectedThread.channel)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {selectedDrawerTarget && adminDrawer ? (
                        <button
                            type="button"
                            onClick={onOpenRecord}
                            className="rounded-md bg-[#00A283] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#009276]"
                        >
                            Open record
                        </button>
                    ) : null}
                    <button
                        type="button"
                        disabled={archiving}
                        onClick={() => onArchiveToggle(selectedThread, !selectedThread.is_archived)}
                        className="rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[10px] font-semibold text-alloy-midnight/75 hover:border-alloy-stone/35 disabled:opacity-50"
                    >
                        {selectedThread.is_archived ? "Unarchive" : "Archive"}
                    </button>
                </div>
            </div>
            <div className="overflow-y-auto px-3 py-2">
                <p className="text-[13px] leading-snug text-alloy-midnight/75">
                    {previewSnippet(selectedThread.last_message_preview)}
                </p>
                {!isModal ? (
                    <p className="mt-2 text-[11px] text-alloy-midnight/50">
                        Full message history and compose remain in record drawers for Sprint A.
                    </p>
                ) : null}
            </div>
        </div>
    ) : isModal ? (
        <div className="shrink-0 border-t border-alloy-stone/10 bg-alloy-stone/[0.03] px-3 py-2 text-center">
            <p className="text-[11px] text-alloy-midnight/50">Select a conversation to preview and open its record.</p>
        </div>
    ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <p className="text-sm text-alloy-midnight/55">Select a conversation</p>
        </div>
    );

    const folderNav = (
        <div
            className={`flex shrink-0 gap-1 overflow-x-auto border-b border-alloy-stone/12 bg-white/90 ${
                isModal ? "px-2 py-1.5" : "flex-col gap-0.5 border-r p-2 w-[11.5rem]"
            }`}
            aria-label="Inbox folders"
        >
            {INBOX_FOLDERS.map((f) => (
                <button
                    key={f}
                    type="button"
                    onClick={() => setFolder(f)}
                    className={
                        isModal
                            ? `shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                  folder === f
                                      ? "bg-[#00A283]/12 text-alloy-midnight ring-1 ring-[#00A283]/25"
                                      : "text-alloy-midnight/60 hover:bg-alloy-stone/8"
                              }`
                            : `rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                                  folder === f
                                      ? "bg-[#00A283]/12 text-alloy-midnight ring-1 ring-[#00A283]/25"
                                      : "text-alloy-midnight/70 hover:bg-alloy-stone/8"
                              }`
                    }
                >
                    {FOLDER_LABELS[f]}
                </button>
            ))}
        </div>
    );

    const rootClass = isModal
        ? "flex min-h-0 flex-1 flex-col bg-[#F8F9FB] text-alloy-midnight"
        : "flex h-[calc(100dvh-3.75rem)] min-h-[32rem] flex-col bg-[#F8F9FB] text-alloy-midnight";

    return (
        <div className={rootClass}>
            {!isModal ? (
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
            ) : null}

            {isModal ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    {folderNav}
                    <div className="min-h-0 flex-1 overflow-y-auto">{threadList}</div>
                    {folder !== "scheduled" ? detailPanel : null}
                </div>
            ) : (
                <div className="flex min-h-0 flex-1">
                    <nav className="flex shrink-0 flex-col border-r border-alloy-stone/12 bg-white/80">
                        {folderNav}
                    </nav>
                    <section className="flex w-[min(22rem,34vw)] shrink-0 flex-col border-r border-alloy-stone/12 bg-white/90">
                        <div className="border-b border-alloy-stone/10 px-3 py-2">
                            <p className="text-xs font-semibold text-alloy-midnight/55">{FOLDER_LABELS[folder]}</p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">{threadList}</div>
                    </section>
                    <div className="flex min-w-0 flex-1 flex-col bg-[#FAFBFC]">
                        {folder === "scheduled" ? (
                            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                                <p className="text-sm text-alloy-midnight/55">Scheduled sends list</p>
                            </div>
                        ) : (
                            detailPanel
                        )}
                    </div>
                </div>
            )}

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
