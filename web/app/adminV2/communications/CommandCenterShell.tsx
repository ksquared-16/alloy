"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
    groupConversationsByQueue,
    computeCommandCenterMetrics,
    applyQueueFilters,
    visibleCommandCenterQueues,
    flattenVisibleConversationIds,
    resolveCommandCenterSelection,
    conversationDisplayTitle,
    conversationDisplayRecipient,
    conversationDisplaySubtitle,
    conversationUnreadCount,
    conversationQueueStatusPill,
    queueStatusPillClass,
    resolveCommandCenterHealthDisplay,
    type ConversationSummary,
    type CommandCenterFilters,
} from "@/lib/communications/v2/commandCenterViewModel";
import {
    getCommandCenterCacheSnapshot,
    getCommandCenterFirstConversationWarm,
    getCommandCenterWarmSelectedConversationId,
    prefetchCommandCenterConversations,
    subscribeCommandCenterCache,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import { buildCommandCenterRecordLinks, type CommandCenterRecordLink } from "@/lib/communications/v2/commandCenterRecordLinks";
import { fetchCommandCenterThreadMessages, type CommandCenterTimelineMessage } from "@/lib/communications/v2/commandCenterThreadMessages";
import { relTime } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import FamilyCommunicationWorkspaceView from "@/app/adminV2/communications/FamilyCommunicationWorkspaceView";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import type { FamilyCommunicationWorkspaceVM, RecipientGroup, ComposerChannel } from "@/lib/communications/v2/familyWorkspace/types";
import { toggleRecipientSelection } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import {
    COMMS_FIXTURES_ENABLED,
    FIXTURE_CONVERSATIONS,
    FIXTURE_MESSAGES,
    FIXTURE_FAMILY_DETAILS,
    type FixtureFamilyDetail,
} from "@/app/adminV2/communications/fixtures";

/**
 * Communications V2 — Command Center body (UI-4H final visual lock). Renders INSIDE the
 * existing modal shell; the BOS rail is the shell's and is untouched.
 * Layout: Queue (~25%) | Conversation (~32%) | Composer (~43%).
 *   - Conversation column = compact Family Snapshot band + conversation history (chat).
 *   - Composer = top-anchored, full-height, message body the dominant surface.
 * Presentation only; fixture mode kept; no data/route/outer-geometry/BOS/flag change.
 */
type TimelineMessage = CommandCenterTimelineMessage;

function mapLiveEvents(events: FamilyCommunicationWorkspaceVM["timelineEvents"]): TimelineMessage[] {
    return events.map((e) => ({
        id: e.id,
        direction: e.direction,
        channel: e.channel,
        body: e.body,
        created_at: e.createdAt,
        kind: e.kind,
        opened_at: e.openedAt,
        replied_at: e.repliedAt,
        thread_id: e.threadId,
        status: e.status,
    }));
}

function initialWorkspaceFromWarm(): {
    messages: TimelineMessage[];
    liveChildren: string[] | null;
    liveRecipientGroups: RecipientGroup[] | null;
    selectedRecipientIds: string[];
} | null {
    const warm = getCommandCenterFirstConversationWarm();
    if (!warm) return null;
    if (warm.workspace) {
        const threadMsgs = warm.threadMessages?.length
            ? warm.threadMessages
            : mapLiveEvents(warm.workspace.messages.length ? warm.workspace.messages : warm.workspace.timelineEvents);
        return {
            messages: threadMsgs,
            liveChildren: warm.workspace.children.map((c) => c.name),
            liveRecipientGroups: warm.workspace.recipientGroups,
            selectedRecipientIds: warm.workspace.selectedRecipients,
        };
    }
    if (warm.threadMessages) {
        return {
            messages: warm.threadMessages,
            liveChildren: null,
            liveRecipientGroups: null,
            selectedRecipientIds: [],
        };
    }
    return null;
}

function initialConversations(): ConversationSummary[] {
    if (COMMS_FIXTURES_ENABLED) return FIXTURE_CONVERSATIONS;
    return getCommandCenterCacheSnapshot()?.conversations ?? [];
}

function initialSelectedId(): string | null {
    if (COMMS_FIXTURES_ENABLED) return FIXTURE_CONVERSATIONS[0]?.id ?? null;
    return getCommandCenterWarmSelectedConversationId();
}

function initialLoading(): boolean {
    if (COMMS_FIXTURES_ENABLED) return false;
    return !getCommandCenterCacheSnapshot();
}

function initialHydratingWorkspace(): boolean {
    if (COMMS_FIXTURES_ENABLED) return false;
    if (getCommandCenterFirstConversationWarm()) return false;
    return Boolean(getCommandCenterCacheSnapshot()?.conversations.length);
}

const attnAccent = (a: string | null | undefined): { rail: string; tint: string; dot: string } => {
    switch (a) {
        case "awaiting_parent_reply": return { rail: "border-l-[#e0a32e]", tint: "bg-[#fdf9f0]", dot: "bg-[#e0a32e]" };
        case "needs_follow_up": return { rail: "border-l-[#e0a32e]", tint: "bg-[#fdf9f0]", dot: "bg-[#e0a32e]" };
        case "documents_missing": return { rail: "border-l-[#d9772e]", tint: "bg-[#fdf3ec]", dot: "bg-[#d9772e]" };
        case "re_enrollment_outreach": return { rail: "border-l-[#00A283]", tint: "bg-[#f0faf6]", dot: "bg-[#00A283]" };
        case "waitlist_update": return { rail: "border-l-[#5b9aa0]", tint: "bg-[#f3f8f8]", dot: "bg-[#5b9aa0]" };
        default: return { rail: "border-l-alloy-stone/30", tint: "bg-white", dot: "bg-alloy-stone/40" };
    }
};





const LIVE_WORKSPACE = isCommsV2FlagEnabled("comms_v2_live_workspace");
const ASSIGNMENT_ENABLED = isCommsV2FlagEnabled("comms_v2_assignment");

const warmWorkspaceSeed = initialWorkspaceFromWarm();

export default function CommandCenterShell() {
    const adminDrawer = useAdminDrawerOptional();
    const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
    const [loading, setLoading] = useState(initialLoading);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<CommandCenterFilters>({});
    const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
    const [messages, setMessages] = useState<TimelineMessage[]>(
        COMMS_FIXTURES_ENABLED
            ? (FIXTURE_MESSAGES[FIXTURE_CONVERSATIONS[0]?.id ?? ""] ?? [])
            : (warmWorkspaceSeed?.messages ?? [])
    );
    const [liveWorkspaceVm, setLiveWorkspaceVm] = useState<FamilyCommunicationWorkspaceVM | null>(null);
    const [assignBusy, setAssignBusy] = useState(false);
    const [liveChildren, setLiveChildren] = useState<string[] | null>(warmWorkspaceSeed?.liveChildren ?? null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [liveRecipientGroups, setLiveRecipientGroups] = useState<RecipientGroup[] | null>(
        warmWorkspaceSeed?.liveRecipientGroups ?? null
    );
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(
        warmWorkspaceSeed?.selectedRecipientIds ?? []
    );
    const [subjectDraft, setSubjectDraft] = useState("");
    const [bodyDraft, setBodyDraft] = useState("");
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [hydratingWorkspace, setHydratingWorkspace] = useState(initialHydratingWorkspace);

    const loadLive = useCallback(async (customerId: string, threadId: string, resetSelection = false) => {
        try {
            const qs = `customer_id=${encodeURIComponent(customerId)}&thread_id=${encodeURIComponent(threadId)}`;
            const res = await fetch(`/api/admin/communications/family-workspace?${qs}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { workspace?: FamilyCommunicationWorkspaceVM };
            const vm = data.workspace;
            if (!vm) return null;
            let msgs = mapLiveEvents(vm.messages.length ? vm.messages : vm.timelineEvents);
            if (msgs.length === 0) {
                msgs = await fetchCommandCenterThreadMessages(threadId);
            }
            setLiveWorkspaceVm(vm);
            setMessages(msgs);
            setLiveChildren(vm.children.map((c) => c.name));
            setLiveRecipientGroups(vm.recipientGroups);
            if (resetSelection) setSelectedRecipientIds(vm.selectedRecipients);
            return vm;
        } catch {
            return null;
        }
    }, []);

    const loadConversations = useCallback(async (opts?: { background?: boolean }) => {
        if (COMMS_FIXTURES_ENABLED) return;
        if (!opts?.background) {
            setLoading(true);
            setError(null);
        }
        try {
            const snap = await prefetchCommandCenterConversations();
            setConversations(snap.conversations);
            if (snap.error) setError(snap.error);
            else setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load conversations");
        } finally {
            if (!opts?.background) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (COMMS_FIXTURES_ENABLED) return;
        return subscribeCommandCenterCache(() => {
            const snap = getCommandCenterCacheSnapshot();
            if (snap) setConversations(snap.conversations);
            const warm = getCommandCenterFirstConversationWarm();
            if (!warm) return;
            const seeded = initialWorkspaceFromWarm();
            if (!seeded) return;
            setSelectedId((prev) => prev ?? warm.conversationId);
            setMessages(seeded.messages);
            setLiveChildren(seeded.liveChildren);
            setLiveRecipientGroups(seeded.liveRecipientGroups);
            setSelectedRecipientIds(seeded.selectedRecipientIds);
            setHydratingWorkspace(false);
        });
    }, []);

    useEffect(() => {
        void loadConversations({ background: !!getCommandCenterCacheSnapshot() });
        if (LIVE_WORKSPACE && COMMS_FIXTURES_ENABLED) {
            const c = FIXTURE_FAMILY_DETAILS[FIXTURE_CONVERSATIONS[0]?.id ?? ""]?.customerId;
            const tid = FIXTURE_CONVERSATIONS[0]?.id;
            if (c && tid) void loadLive(c, tid, true);
        }
    }, [loadConversations, loadLive]);

    const openConversation = useCallback(async (id: string) => {
        setSelectedId(id);
        setSelectedThreadId(null);
        setSubjectDraft("");
        setBodyDraft("");
        setLiveWorkspaceVm(null);
        const conv = conversations.find((c) => c.id === id);
        const warm = getCommandCenterFirstConversationWarm();
        if (warm?.conversationId === id) {
            const seeded = initialWorkspaceFromWarm();
            if (seeded) {
                setMessages(seeded.messages);
                setLiveChildren(seeded.liveChildren);
                setLiveRecipientGroups(seeded.liveRecipientGroups);
                setSelectedRecipientIds(seeded.selectedRecipientIds);
                if (warm.workspace) setLiveWorkspaceVm(warm.workspace);
                return;
            }
        }
        setHydratingWorkspace(true);
        try {
            if (COMMS_FIXTURES_ENABLED) {
                const liveCustomerId = LIVE_WORKSPACE ? FIXTURE_FAMILY_DETAILS[id]?.customerId : undefined;
                if (liveCustomerId) {
                    await loadLive(liveCustomerId, id, true);
                    return;
                }
                setMessages(FIXTURE_MESSAGES[id] ?? []);
                setLiveChildren(null);
                return;
            }
            setMessages([]);
            const liveCustomerId = LIVE_WORKSPACE ? conv?.customer_id : undefined;
            if (liveCustomerId) {
                const vm = await loadLive(liveCustomerId, id, true);
                if (!vm && conv?.last_message_preview) {
                    setMessages(await fetchCommandCenterThreadMessages(id));
                }
                return;
            }
            setMessages(await fetchCommandCenterThreadMessages(id));
        } finally {
            setHydratingWorkspace(false);
        }
    }, [loadLive, conversations]);

    const claim = useCallback(
        async (id: string) => {
            if (COMMS_FIXTURES_ENABLED) return;
            setAssignBusy(true);
            try {
                await fetch(`/api/admin/communications/conversations/${id}/assign`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "claim" }),
                });
                await loadConversations();
            } finally {
                setAssignBusy(false);
            }
        },
        [loadConversations]
    );

    const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
    const selectedCustomerId = useMemo(() => {
        if (COMMS_FIXTURES_ENABLED && selectedId) return FIXTURE_FAMILY_DETAILS[selectedId]?.customerId ?? null;
        return selected?.customer_id ?? null;
    }, [selected, selectedId]);

    const openThread = useCallback(
        async (threadId: string) => {
            if (!LIVE_WORKSPACE) return;
            setSelectedThreadId(threadId);
            const cust = selectedCustomerId;
            if (cust) await loadLive(cust, threadId);
        },
        [loadLive, selectedCustomerId]
    );

    const recordLinks = useMemo((): CommandCenterRecordLink[] => {
        if (!selected) return [];
        const childLinks =
            liveWorkspaceVm?.children.map((c) => ({ id: c.id, name: c.name })) ??
            selected.child_links ??
            null;
        return buildCommandCenterRecordLinks(selected, childLinks);
    }, [selected, liveWorkspaceVm]);

    const openRecordLink = useCallback(
        (link: CommandCenterRecordLink) => {
            adminDrawer?.openDrawer({ type: link.type, id: link.id });
        },
        [adminDrawer]
    );

    const composerChannels = useMemo(
        () => ({
            email: liveWorkspaceVm?.composerDraft.availableChannels.email ?? true,
            sms: liveWorkspaceVm?.composerDraft.availableChannels.sms ?? false,
            note: false,
        }),
        [liveWorkspaceVm]
    );

    const runFamilySend = useCallback(
        async (confirm: boolean) => {
            if (!LIVE_WORKSPACE) return;
            const cust = selectedCustomerId;
            if (!cust || selectedRecipientIds.length === 0 || !bodyDraft.trim()) return;
            setSending(true);
            setSendError(null);
            try {
                const res = await fetch("/api/admin/communications/family-send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        customer_id: cust,
                        recipient_person_ids: selectedRecipientIds,
                        channel: "email",
                        subject: subjectDraft,
                        body: bodyDraft,
                        reply_to_thread_id: selectedThreadId,
                        confirm,
                    }),
                });
                const data = (await res.json()) as (FamilySendResult & { error?: string });
                if (!res.ok) {
                    setSendError(data.error ?? "Send failed");
                    return;
                }
                setSendResult(data);
                if (confirm) {
                    await loadLive(cust, selectedThreadId ?? selectedId ?? "", false);
                }
            } catch {
                setSendError("Send failed");
            } finally {
                setSending(false);
            }
        },
        [loadLive, selectedCustomerId, selectedRecipientIds, subjectDraft, bodyDraft, selectedThreadId]
    );

    const filtered = useMemo(() => applyQueueFilters(conversations, filters), [conversations, filters]);
    const grouped = useMemo(() => groupConversationsByQueue(filtered), [filtered]);
    const queueSections = useMemo(() => visibleCommandCenterQueues(grouped), [grouped]);
    const visibleIds = useMemo(() => flattenVisibleConversationIds(queueSections), [queueSections]);
    const metrics = useMemo(() => computeCommandCenterMetrics(filtered), [filtered]);
    const detail: FixtureFamilyDetail | undefined = selected ? FIXTURE_FAMILY_DETAILS[selected.id] : undefined;
    const childNames = useMemo(
        () =>
            LIVE_WORKSPACE && liveChildren
                ? liveChildren
                : detail
                  ? detail.children.split(/\s*[&,]\s*/).map((s) => s.trim()).filter(Boolean)
                  : [],
        [detail, liveChildren]
    );
    const liveChannel: ComposerChannel = "email";

    useEffect(() => {
        if (loading) return;
        const nextId = resolveCommandCenterSelection(selectedId, visibleIds);
        if (nextId && nextId !== selectedId) {
            void openConversation(nextId);
        } else if (!nextId && selectedId) {
            setSelectedId(null);
            setMessages([]);
            setLiveChildren(null);
            setLiveRecipientGroups(null);
        }
    }, [loading, visibleIds, selectedId, openConversation]);

    const timelineMessageCount = useMemo(
        () => messages.filter((m) => !m.kind || m.kind === "message").length,
        [messages]
    );
    const health = useMemo(
        () =>
            computeCommunicationHealth({
                messages: messages
                    .filter((m) => !m.kind || m.kind === "message")
                    .map((m) => ({ direction: m.direction, created_at: m.created_at, channel: m.channel, opened_at: m.opened_at, replied_at: m.replied_at })),
                unreadCount: selected?.unread ?? undefined,
            }),
        [messages, selected]
    );
    const healthDisplay = useMemo(
        () => resolveCommandCenterHealthDisplay(selected, timelineMessageCount, health.engagementScore),
        [selected, timelineMessageCount, health.engagementScore]
    );

    const kpis = [
        { label: "Needs reply", value: metrics.requiresResponse, dot: "bg-[#e0a32e]", tone: "text-[#9a6b16]", status: metrics.requiresResponse > 0 ? "awaiting response" : "all caught up", statusTone: "text-[#9a6b16]" },
        { label: "Overdue", value: metrics.slaAtRisk, dot: "bg-alloy-ember", tone: "text-alloy-ember", status: metrics.slaAtRisk > 0 ? "act now" : "none overdue", statusTone: metrics.slaAtRisk > 0 ? "text-alloy-ember" : "text-[#0f6b4a]" },
        { label: "Unread", value: metrics.unread, dot: "bg-[#00A283]", tone: "text-[#0f6b4a]", status: metrics.unread > 0 ? "new inbound" : "caught up", statusTone: "text-[#0f6b4a]" },
        { label: "Unclassified", value: metrics.unclassified, dot: "bg-alloy-stone/50", tone: "text-alloy-midnight", status: metrics.unclassified > 0 ? "needs triage" : "all classified", statusTone: "text-alloy-midnight/45" },
    ];

    const revealReady =
        COMMS_FIXTURES_ENABLED ||
        (!loading && !hydratingWorkspace && (filtered.length === 0 || selected != null));

    return (
        <div data-cc-shell="communications-command-center" className="relative flex min-h-0 flex-1 flex-col gap-2.5 bg-white p-2.5">
            {!revealReady ? (
                <div
                    data-cc-loading-overlay
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/95 backdrop-blur-[1px]"
                    aria-busy="true"
                    aria-label="Loading Command Center"
                >
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00A283]/25 border-t-[#00A283]" />
                    <div className="text-center">
                        <p className="text-sm font-semibold text-alloy-midnight">Loading Command Center</p>
                        <p className="mt-1 max-w-xs text-xs text-alloy-midnight/50">Preparing queue and first conversation…</p>
                    </div>
                </div>
            ) : null}
            {/* KPI strip — max 4, compact */}
            <div data-cc-metrics className="flex flex-wrap gap-2">
                {kpis.map((k) => (
                    <div key={k.label} className="flex min-w-[170px] items-center gap-3 rounded-xl border border-alloy-stone/12 bg-white px-3.5 py-2 shadow-[0_1px_2px_rgba(20,30,25,0.05)]">
                        <span className={`h-8 w-1.5 shrink-0 rounded-full ${k.dot}`} />
                        <span className={`text-xl font-semibold leading-none tabular-nums ${k.tone}`}>{k.value}</span>
                        <span className="min-w-0 leading-tight">
                            <span className="block text-[12px] font-semibold text-alloy-midnight">{k.label}</span>
                            <span className={`block truncate text-[10px] font-medium ${k.statusTone}`}>{k.status}</span>
                        </span>
                    </div>
                ))}
            </div>

            {error ? <div className="text-[11px] text-alloy-ember">{error}</div> : null}

            {/* Outer split — queue ~25% | workspace ~75%. Outer modal/BOS geometry untouched. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,25%)_minmax(0,1fr)] gap-2.5">
                {/* QUEUE */}
                <aside data-cc-column="queue" aria-label="Communication queue" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-alloy-stone/12 bg-white shadow-[0_1px_3px_rgba(20,30,25,0.05)]">
                    <div className="shrink-0 border-b border-alloy-stone/12 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-alloy-midnight">Communication queue</span>
                            <span className="text-[11px] tabular-nums text-alloy-midnight/45">{filtered.length} families</span>
                        </div>
                        <div data-cc-filters className="mt-2 flex items-center gap-1.5">
                            <div className="relative shrink-0">
                                <select
                                    aria-label="Channel filter"
                                    value={filters.channel ?? ""}
                                    onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value || null }))}
                                    className="appearance-none rounded-md border border-alloy-stone/20 bg-white py-1 pl-2 pr-6 text-[11px] text-alloy-midnight shadow-sm focus:outline-none focus:ring-1 focus:ring-[#00A283]/30"
                                >
                                    <option value="">All channels</option>
                                    <option value="email">Email</option>
                                    <option value="sms">SMS</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-alloy-midnight/40" />
                            </div>
                            <input
                                aria-label="Search families"
                                value={filters.search ?? ""}
                                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || null }))}
                                placeholder="Search…"
                                className="min-w-0 flex-1 rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#00A283]/30"
                            />
                            {loading ? <span className="shrink-0 text-[10px] text-alloy-midnight/45">…</span> : null}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-2.5 py-2.5">
                        {queueSections.map((q) => {
                            const items = q.items;
                            const acc = attnAccent(q.key);
                            return (
                                <div key={q.key} data-cc-queue={q.key} className="mb-3.5">
                                    <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${acc.dot}`} />
                                        <span>{q.label}</span>
                                        <span className="ml-auto tabular-nums">{items.length}</span>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {items.map((c) => {
                                            const d = FIXTURE_FAMILY_DETAILS[c.id];
                                            const isSel = selectedId === c.id;
                                            const a = attnAccent(c.attention_state);
                                            const title = d ? (c.family_label ?? "Family") : conversationDisplayTitle(c);
                                            const subtitle = d ? `${d.children} · ${d.program}` : conversationDisplaySubtitle(c);
                                            const recipient = d ? null : conversationDisplayRecipient(c);
                                            const preview = d ? null : (c.last_message_preview ?? null);
                                            const unread = conversationUnreadCount(c);
                                            const statusPill = conversationQueueStatusPill(c);
                                            const activityAt = c.last_activity_at ?? c.last_message_at;
                                            const channelLabel = (c.channel ?? "").toLowerCase() === "sms" ? "SMS" : (c.channel ?? "").toLowerCase() === "email" ? "Email" : (c.channel ?? "");
                                            return (
                                                <li key={c.id}>
                                                    <button
                                                        type="button"
                                                        data-cc-conversation={c.id}
                                                        onClick={() => openConversation(c.id)}
                                                        className={`w-full rounded-xl border border-l-[3px] px-2.5 py-2 text-left transition ${
                                                            isSel
                                                                ? "border-[#00A283] border-l-[#00A283] bg-[#f1faf7] shadow-[0_2px_8px_rgba(0,162,131,0.14)] ring-1 ring-[#00A283]/20"
                                                                : `border-alloy-stone/15 ${a.rail} ${a.tint} hover:border-alloy-stone/30 hover:shadow-sm`
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-alloy-midnight">{title}</span>
                                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${queueStatusPillClass(statusPill.tone)}`}>{statusPill.label}</span>
                                                        </div>
                                                        {recipient ? (
                                                            <div className="mt-0.5 truncate text-[10px] text-alloy-midnight/45">{recipient}</div>
                                                        ) : null}
                                                        <div className="mt-1 truncate text-[11px] text-alloy-midnight/55">{subtitle}</div>
                                                        {preview ? (
                                                            <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-alloy-midnight/50">{preview}</div>
                                                        ) : null}
                                                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-alloy-midnight/45">
                                                            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
                                                            <span className="truncate">
                                                                {[channelLabel, activityAt ? relTime(activityAt) : null].filter(Boolean).join(" · ")}
                                                            </span>
                                                            <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                                                {unread ? (
                                                                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00A283] px-1 text-[9px] font-bold text-white shadow-sm">{unread}</span>
                                                                ) : null}
                                                            </span>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })}
                        {filtered.length === 0 ? <div className="p-3 text-xs text-alloy-midnight/50">No families in the queue.</div> : null}
                    </div>
                </aside>

                {/* WORKSPACE — Conversation (context) | Composer (action) */}
                <section data-cc-column="workspace" data-cc-workspace="family-communication" aria-label="Family communication workspace" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-alloy-stone/12 bg-white shadow-[0_1px_3px_rgba(20,30,25,0.05)]">
                    {selected ? (
                        <FamilyCommunicationWorkspaceView
                            selected={selected}
                            detail={detail}
                            childNames={childNames}
                            stageLabel={selected.stage_label ?? detail?.stage ?? null}
                            healthTone={healthDisplay.tone}
                            healthDot={healthDisplay.dot}
                            healthLabel={healthDisplay.label}
                            recordLinks={recordLinks}
                            onOpenRecordLink={openRecordLink}
                            showClaim={ASSIGNMENT_ENABLED}
                            composerChannels={composerChannels}
                            LIVE_WORKSPACE={LIVE_WORKSPACE}
                            selectedThreadId={selectedThreadId}
                            messages={messages}
                            liveRecipientGroups={liveRecipientGroups}
                            selectedRecipientIds={selectedRecipientIds}
                            liveChannel={liveChannel}
                            subjectDraft={subjectDraft}
                            bodyDraft={bodyDraft}
                            sendResult={sendResult}
                            sendError={sendError}
                            sending={sending}
                            assignBusy={assignBusy}
                            onClaim={(id) => claim(id)}
                            onAllMessages={() => { setSelectedThreadId(null); if (selectedCustomerId && selectedId) void loadLive(selectedCustomerId, selectedId, false); }}
                            onOpenThread={(t) => void openThread(t)}
                            onToggleRecipient={(id) => setSelectedRecipientIds((prev) => toggleRecipientSelection(prev, id, true))}
                            onSubjectChange={setSubjectDraft}
                            onBodyChange={setBodyDraft}
                            onSendNow={() => void runFamilySend(false)}
                            onConfirmSend={() => void runFamilySend(true)}
                            onDismissSend={() => { setSendResult(null); setSendError(null); }}
                        />
                    ) : filtered.length > 0 && (loading || hydratingWorkspace || !selectedId) ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                            <p className="text-sm font-medium text-alloy-midnight/60">Loading first conversation…</p>
                            <p className="max-w-sm text-xs text-alloy-midnight/45">Preparing the workspace for the most recent thread.</p>
                        </div>
                    ) : !loading ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                            <p className="text-sm font-medium text-alloy-midnight/60">No conversations yet</p>
                            <p className="max-w-sm text-xs leading-relaxed text-alloy-midnight/45">
                                Conversations appear here when messages are sent or received.
                            </p>
                        </div>
                    ) : null}
                </section>
            </div>
        </div>
    );
}
