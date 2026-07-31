"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import QuickMessageModal from "@/app/adminV2/components/QuickMessageModal";
import type { QuickMessageModalSeed } from "@/app/adminV2/components/QuickMessageModal";
import InboxThreadMessageHistory from "@/components/adminV2/messaging/InboxThreadMessageHistory";
import InboxThreadReplyBox from "@/components/adminV2/messaging/InboxThreadReplyBox";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { dispatchInboxUnreadRefresh } from "@/lib/adminV2/inboxNavUnreadCache";
import {
    getInboxWarmCacheSnapshot,
    publishPanelCacheToWarm,
    subscribeInboxWarmCache,
} from "@/lib/adminV2/inboxWarmLoadCache";
import { formatMessagingDateTimeLocal } from "@/lib/adminV2/messaging/messagingLocalDateTime";
import { filterInboxThreadsBySearch } from "@/lib/adminV2/messaging/inboxThreadSearch";
import {
    inboxFoldersToPrefetch,
    isFolderCacheStale,
    mergeFolderCacheEntry,
    resolveSelectedThreadIdAfterFolderLoad,
    shouldShowFolderInitialLoading,
    type InboxFolderCacheEntry,
    type InboxFolderCacheState,
} from "@/lib/communications/inboxFolderCache";
import {
    INBOX_THREAD_MESSAGES_FETCH_LIMIT,
    parseInboxThreadMessagesResponse,
    type InboxThreadMessagesCacheEntry,
} from "@/lib/adminV2/messaging/inboxThreadMessagesCache";
import { resolveInboxEntityDrawerTarget } from "@/lib/communications/inboxEntityDrawerTarget";
import {
    formatMessagingThreadContextLine,
    formatMessagingThreadMetadataLine,
    shouldShowMessagingHouseholdFallback,
} from "@/lib/adminV2/messaging/messagingThreadContextLines";
import type {
    InboxFolder,
    InboxScheduledSendListItem,
    InboxThreadListItem,
    InboxThreadsListResponse,
} from "@/lib/communications/inboxThreadTypes";
import { INBOX_FOLDERS } from "@/lib/communications/inboxThreadTypes";
import { WS_QUEUE_RAIL } from "@/components/workspace/workspaceTokens";

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
    return t.length > 120 ? `${t.slice(0, 117)}…` : t;
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
    const adminDrawer = useAdminDrawerOptional();
    const isModal = layout === "modal";

    const [folder, setFolder] = useState<InboxFolder>(initialFolder);
    const [inboxSearchQuery, setInboxSearchQuery] = useState("");
    const [folderCache, setFolderCache] = useState<InboxFolderCacheState>(() => getInboxWarmCacheSnapshot());
    const [threads, setThreads] = useState<InboxThreadListItem[]>([]);
    const [scheduledSends, setScheduledSends] = useState<InboxScheduledSendListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [initialLoading, setInitialLoading] = useState(() => shouldShowFolderInitialLoading(getInboxWarmCacheSnapshot(), initialFolder));
    const [refreshingFolder, setRefreshingFolder] = useState<InboxFolder | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [archiving, setArchiving] = useState(false);
    const [threadMessagesCache, setThreadMessagesCache] = useState<Record<string, InboxThreadMessagesCacheEntry>>({});
    const [composeOpenInternal, setComposeOpenInternal] = useState(false);
    const [composeSeed, setComposeSeed] = useState<QuickMessageModalSeed | null>(null);
    const prefetchStarted = useRef(false);
    const folderCacheRef = useRef<InboxFolderCacheState>({});
    const loadingThreadMessageIds = useRef(new Set<string>());
    folderCacheRef.current = folderCache;

    const composeOpen = composeOpenProp ?? composeOpenInternal;
    const setComposeOpen = onComposeOpenChange ?? setComposeOpenInternal;

    const applyCacheEntry = useCallback((f: InboxFolder, entry: InboxFolderCacheEntry) => {
        if (f !== folder) return;
        setThreads(entry.threads);
        setScheduledSends(entry.scheduledSends);
        setError(entry.error);
        setSelectedId((prev) =>
            resolveSelectedThreadIdAfterFolderLoad({
                folder: f,
                threads: entry.threads,
                previousSelectedId: prev,
                autoSelectFirst: !isModal,
            })
        );
    }, [folder, isModal]);

    const fetchFolder = useCallback(
        async (f: InboxFolder, opts?: { background?: boolean; force?: boolean }) => {
            const background = opts?.background === true;
            const cached = folderCacheRef.current[f];
            if (!background && cached && !opts?.force) {
                applyCacheEntry(f, cached);
                setInitialLoading(false);
                if (isFolderCacheStale(cached)) {
                    void fetchFolder(f, { background: true, force: true });
                }
                return;
            }

            if (!background) {
                if (shouldShowFolderInitialLoading(folderCache, f)) {
                    setInitialLoading(true);
                } else if (cached) {
                    applyCacheEntry(f, cached);
                }
            } else {
                setRefreshingFolder(f);
            }

            try {
                const limit = isModal ? MODAL_THREAD_LIMIT : 50;
                const compact = isModal ? "&compact=1" : "";
                const res = await fetch(
                    `/api/admin/inbox/threads?folder=${encodeURIComponent(f)}&limit=${limit}${compact}`,
                    { credentials: "include" }
                );
                const json = (await res.json().catch(() => ({}))) as InboxThreadsListResponse & { error?: string };
                if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

                const entry: InboxFolderCacheEntry = {
                    threads: Array.isArray(json.threads) ? json.threads : [],
                    scheduledSends: Array.isArray(json.scheduled_sends) ? json.scheduled_sends : [],
                    fetchedAt: Date.now(),
                    error: null,
                };
                setFolderCache((prev) => {
                    const next = mergeFolderCacheEntry(prev, f, entry);
                    publishPanelCacheToWarm(next);
                    return next;
                });
                if (f === folder) applyCacheEntry(f, entry);
            } catch (e) {
                const message = e instanceof Error ? e.message : "Failed to load inbox";
                const entry: InboxFolderCacheEntry = {
                    threads: cached?.threads ?? [],
                    scheduledSends: cached?.scheduledSends ?? [],
                    fetchedAt: cached?.fetchedAt ?? Date.now(),
                    error: message,
                };
                setFolderCache((prev) => {
                    const next = mergeFolderCacheEntry(prev, f, entry);
                    publishPanelCacheToWarm(next);
                    return next;
                });
                if (f === folder) {
                    setError(message);
                    if (!cached) {
                        setThreads([]);
                        setScheduledSends([]);
                        setSelectedId(null);
                    }
                }
            } finally {
                if (!background) setInitialLoading(false);
                setRefreshingFolder((current) => (current === f ? null : current));
            }
        },
        [applyCacheEntry, folder, isModal]
    );

    useEffect(() => {
        const warm = getInboxWarmCacheSnapshot();
        if (warm[folder]) {
            applyCacheEntry(folder, warm[folder]!);
            setInitialLoading(false);
        }
        return subscribeInboxWarmCache(() => {
            const next = getInboxWarmCacheSnapshot();
            setFolderCache((prev) => ({ ...next, ...prev }));
            if (next[folder]) applyCacheEntry(folder, next[folder]!);
        });
    }, [applyCacheEntry, folder]);

    useEffect(() => {
        void fetchFolder(folder);
    }, [folder, fetchFolder]);

    useEffect(() => {
        if (prefetchStarted.current) return;
        prefetchStarted.current = true;
        for (const f of inboxFoldersToPrefetch()) {
            if (f === folder) continue;
            void fetchFolder(f, { background: true });
        }
    }, [fetchFolder, folder]);

    const selectedThread = useMemo(
        () => threads.find((t) => t.id === selectedId) ?? null,
        [threads, selectedId]
    );

    const filteredThreads = useMemo(
        () => (folder === "scheduled" ? threads : filterInboxThreadsBySearch(threads, inboxSearchQuery)),
        [folder, inboxSearchQuery, threads]
    );

    const openComposeForThread = useCallback((thread: InboxThreadListItem) => {
        const entityType = thread.primary_entity_type.trim().toLowerCase();
        const opportunityId = entityType === "opportunities" ? thread.primary_entity_id.trim() : null;
        setComposeSeed({
            personId: thread.reply_person_id ?? undefined,
            opportunityId,
            displayName: thread.contact_display ?? undefined,
            recordScoped: Boolean(opportunityId),
            defaultChannel: thread.channel.trim().toLowerCase() === "sms" ? "sms" : "email",
        });
        setComposeOpen(true);
    }, [setComposeOpen]);

    const selectedDrawerTarget = useMemo(() => {
        if (!selectedThread) return null;
        return resolveInboxEntityDrawerTarget(
            selectedThread.entity_chip?.entity_type ?? selectedThread.primary_entity_type,
            selectedThread.entity_chip?.entity_id ?? selectedThread.primary_entity_id
        );
    }, [selectedThread]);

    const refreshActiveFolder = useCallback(
        (opts?: { background?: boolean }) => {
            void fetchFolder(folder, { background: opts?.background ?? false, force: true });
        },
        [fetchFolder, folder]
    );

    const loadThreadMessages = useCallback(async (threadId: string, opts?: { force?: boolean }) => {
        if (loadingThreadMessageIds.current.has(threadId) && !opts?.force) return;

        setThreadMessagesCache((prev) => {
            const cached = prev[threadId];
            if (!opts?.force && cached && cached.messages.length > 0 && !cached.error && !cached.loading) {
                return prev;
            }
            return {
                ...prev,
                [threadId]: {
                    messages: cached?.messages ?? [],
                    fetchedAt: cached?.fetchedAt ?? 0,
                    error: null,
                    loading: true,
                },
            };
        });

        loadingThreadMessageIds.current.add(threadId);
        try {
            const res = await fetch(
                `/api/admin/communications/threads/${encodeURIComponent(threadId)}/messages?limit=${INBOX_THREAD_MESSAGES_FETCH_LIMIT}`,
                { credentials: "include" }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
            const messages = parseInboxThreadMessagesResponse(json);
            setThreadMessagesCache((prev) => ({
                ...prev,
                [threadId]: {
                    messages,
                    fetchedAt: Date.now(),
                    error: null,
                    loading: false,
                },
            }));
        } catch (e) {
            setThreadMessagesCache((prev) => ({
                ...prev,
                [threadId]: {
                    messages: prev[threadId]?.messages ?? [],
                    fetchedAt: Date.now(),
                    error: e instanceof Error ? e.message : "Failed to load messages",
                    loading: false,
                },
            }));
        } finally {
            loadingThreadMessageIds.current.delete(threadId);
        }
    }, []);

    useEffect(() => {
        if (!selectedThread?.id || folder === "scheduled") return;
        void loadThreadMessages(selectedThread.id);
    }, [folder, loadThreadMessages, selectedThread?.id]);

    const invalidateThreadMessages = useCallback((threadId: string) => {
        setThreadMessagesCache((prev) => {
            const next = { ...prev };
            delete next[threadId];
            return next;
        });
    }, []);

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
            refreshActiveFolder({ background: true });
            for (const f of inboxFoldersToPrefetch()) {
                if (f !== folder) void fetchFolder(f, { background: true, force: true });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Archive failed");
        } finally {
            setArchiving(false);
        }
    };

    const threadList = (
        <>
            {initialLoading ? (
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
                                {formatMessagingDateTimeLocal(row.scheduled_for)}
                            </p>
                        </div>
                    ))
                )
            ) : filteredThreads.length === 0 ? (
                <p className="p-3 text-sm text-alloy-midnight/55">
                    {inboxSearchQuery.trim() ? "No conversations match your search." : "No conversations in this folder."}
                </p>
            ) : (
                filteredThreads.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full border-b border-alloy-stone/8 px-3 py-3 text-left transition-colors ${
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
                                            t.has_unread
                                                ? "font-semibold text-alloy-midnight"
                                                : "font-medium text-alloy-midnight/88"
                                        }`}
                                    >
                                        {t.contact_display ?? "Conversation"}
                                    </span>
                                </div>
                                {t.context_display ? (
                                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/55">
                                        {t.context_display}
                                    </p>
                                ) : null}
                                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/58">
                                    {t.preview_lead ?? previewSnippet(t.last_message_preview)}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="text-[10px] text-alloy-midnight/45">
                                    {t.sort_at ? formatMessagingDateTimeLocal(t.sort_at) : "—"}
                                </p>
                            </div>
                        </div>
                    </button>
                ))
            )}
        </>
    );

    const detailPanel =
        folder === "scheduled" ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <p className="text-sm text-alloy-midnight/55">Select a scheduled send from the list.</p>
            </div>
        ) : !selectedThread ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <p className="text-sm text-alloy-midnight/55">Select a conversation</p>
                <p className="mt-1 text-[11px] text-alloy-midnight/45">Preview and reply on the right.</p>
            </div>
        ) : (
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-start justify-between gap-2 border-b border-alloy-stone/10 px-3.5 py-3">
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-alloy-midnight">
                            {selectedThread.contact_display ?? "Conversation"}
                        </h2>
                        {(() => {
                            const contextLine = formatMessagingThreadContextLine({
                                location: selectedThread.location_display,
                                status: selectedThread.status_display,
                                channel: selectedThread.channel,
                            });
                            const metadataLine = formatMessagingThreadMetadataLine({
                                children: selectedThread.related_children_display,
                                relatedContacts: selectedThread.related_contacts_display,
                            });
                            const showHousehold = shouldShowMessagingHouseholdFallback({
                                contactDisplay: selectedThread.contact_display,
                                householdDisplay: selectedThread.family_display,
                            });
                            return (
                                <>
                                    {contextLine ? (
                                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/55">
                                            {contextLine}
                                        </p>
                                    ) : null}
                                    {metadataLine ? (
                                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-alloy-midnight/50">
                                            {metadataLine}
                                        </p>
                                    ) : null}
                                    {showHousehold ? (
                                        <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/50">
                                            {selectedThread.family_display}
                                        </p>
                                    ) : null}
                                </>
                            );
                        })()}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
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
                <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
                    <InboxThreadMessageHistory
                        threadId={selectedThread.id}
                        cacheEntry={threadMessagesCache[selectedThread.id]}
                        scrollToLatestKey={`${selectedThread.id}:${threadMessagesCache[selectedThread.id]?.fetchedAt ?? 0}:${threadMessagesCache[selectedThread.id]?.messages.length ?? 0}`}
                    />
                </div>
                {selectedThread ? (
                    <InboxThreadReplyBox
                        key={selectedThread.id}
                        thread={selectedThread}
                        onAddRecipient={() => openComposeForThread(selectedThread)}
                        onSent={() => {
                            invalidateThreadMessages(selectedThread.id);
                            void loadThreadMessages(selectedThread.id, { force: true });
                            dispatchInboxUnreadRefresh();
                            refreshActiveFolder({ background: true });
                        }}
                        onScheduled={() => {
                            invalidateThreadMessages(selectedThread.id);
                            dispatchInboxUnreadRefresh();
                            refreshActiveFolder({ background: true });
                            setFolder("scheduled");
                        }}
                    />
                ) : null}
            </div>
        );

    const folderNav = (
        <div
            className={`flex shrink-0 gap-1 overflow-x-auto border-b border-alloy-stone/12 bg-white/90 ${
                isModal ? "px-2 py-1.5" : "w-[11.5rem] flex-col gap-0.5 border-r p-2"
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
                            ? `relative shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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
                    {refreshingFolder === f ? (
                        <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#00A283]/70" aria-hidden />
                    ) : null}
                </button>
            ))}
        </div>
    );

    const rootClass = isModal
        ? "flex min-h-0 flex-1 flex-col bg-[#F8F9FB] text-alloy-midnight"
        : "flex h-[calc(100dvh-3.75rem)] min-h-[32rem] flex-col bg-[#F8F9FB] text-alloy-midnight";

    const listColumn = (
        <section
            className={`flex min-h-0 flex-col bg-white/90 ${
                isModal ? `w-[min(18rem,52%)] shrink-0 ${WS_QUEUE_RAIL}` : `w-[min(22rem,34vw)] shrink-0 ${WS_QUEUE_RAIL}`
            }`}
        >
            {!isModal ? (
                <div className="border-b border-alloy-stone/10 px-3 py-2">
                    <p className="text-xs font-semibold text-alloy-midnight/55">{FOLDER_LABELS[folder]}</p>
                </div>
            ) : null}
            {folder !== "scheduled" ? (
                <div className="border-b border-alloy-stone/10 px-3 py-2">
                    <input
                        type="search"
                        value={inboxSearchQuery}
                        onChange={(e) => setInboxSearchQuery(e.target.value)}
                        placeholder="Search conversations…"
                        className="w-full rounded-lg border border-alloy-stone/18 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 focus:border-[#00A283]/35 focus:outline-none focus:ring-1 focus:ring-[#00A283]/20"
                        aria-label="Search inbox conversations"
                        data-adminv2-inbox-search="true"
                    />
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto">{threadList}</div>
        </section>
    );

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
                        onClick={() => {
                            setComposeSeed(null);
                            setComposeOpen(true);
                        }}
                        className="rounded-md bg-[#00A283] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#009276]"
                    >
                        Compose New
                    </button>
                </header>
            ) : null}

            {isModal ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    {folderNav}
                    <div className="flex min-h-0 flex-1">
                        {listColumn}
                        <div className="flex min-w-0 flex-1 flex-col bg-[#FAFBFC]">{detailPanel}</div>
                    </div>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1">
                    <nav className="flex shrink-0 flex-col border-r border-alloy-stone/12 bg-white/80">{folderNav}</nav>
                    {listColumn}
                    <div className="flex min-w-0 flex-1 flex-col bg-[#FAFBFC]">{detailPanel}</div>
                </div>
            )}

            <QuickMessageModal
                open={composeOpen}
                seed={composeSeed}
                onClose={() => {
                    setComposeOpen(false);
                    setComposeSeed(null);
                    dispatchInboxUnreadRefresh();
                    refreshActiveFolder({ background: true });
                }}
            />
        </div>
    );
}
