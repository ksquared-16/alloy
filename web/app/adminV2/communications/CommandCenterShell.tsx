"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
    OPERATIONAL_QUEUES,
    groupConversationsByQueue,
    computeCommandCenterMetrics,
    applyQueueFilters,
    type ConversationSummary,
    type CommandCenterFilters,
} from "@/lib/communications/v2/commandCenterViewModel";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
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
type TimelineMessage = {
    id?: string;
    direction?: string | null;
    channel?: string | null;
    body?: string | null;
    created_at?: string | null;
    opened_at?: string | null;
    replied_at?: string | null;
    kind?: string | null;
    thread_id?: string | null;
    status?: string | null;
};

const slaChipClass = (s: string | null | undefined): string =>
    s === "overdue" ? "bg-alloy-ember text-white shadow-sm"
    : s === "due" ? "border border-[#e6c98a] bg-[#fbf6ea] text-[#9a6b16]"
    : "border border-[#7fc9b6] bg-[#edf7f2] text-[#0f6b4a]";
const slaChipLabel = (s: string | null | undefined): string =>
    s === "overdue" ? "SLA overdue" : s === "due" ? "Due soon" : "On track";

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

export default function CommandCenterShell() {
    const [conversations, setConversations] = useState<ConversationSummary[]>(
        COMMS_FIXTURES_ENABLED ? FIXTURE_CONVERSATIONS : []
    );
    const [loading, setLoading] = useState(!COMMS_FIXTURES_ENABLED);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<CommandCenterFilters>({});
    const [selectedId, setSelectedId] = useState<string | null>(
        COMMS_FIXTURES_ENABLED ? (FIXTURE_CONVERSATIONS[0]?.id ?? null) : null
    );
    const [messages, setMessages] = useState<TimelineMessage[]>(
        COMMS_FIXTURES_ENABLED ? (FIXTURE_MESSAGES[FIXTURE_CONVERSATIONS[0]?.id ?? ""] ?? []) : []
    );
    const [assignBusy, setAssignBusy] = useState(false);
    const [liveChildren, setLiveChildren] = useState<string[] | null>(null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [liveRecipientGroups, setLiveRecipientGroups] = useState<RecipientGroup[] | null>(null);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
    const [subjectDraft, setSubjectDraft] = useState("");
    const [bodyDraft, setBodyDraft] = useState("");
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);

    const loadLive = useCallback(async (customerId: string, threadId: string | null, resetSelection = false) => {
        try {
            const qs = `customer_id=${encodeURIComponent(customerId)}${threadId ? `&thread_id=${encodeURIComponent(threadId)}` : ""}`;
            const res = await fetch(`/api/admin/communications/family-workspace?${qs}`);
            if (!res.ok) return;
            const data = (await res.json()) as { workspace?: FamilyCommunicationWorkspaceVM };
            const vm = data.workspace;
            if (!vm) return;
            setMessages(mapLiveEvents(threadId ? vm.messages : vm.timelineEvents));
            setLiveChildren(vm.children.map((c) => c.name));
            setLiveRecipientGroups(vm.recipientGroups);
            if (resetSelection) setSelectedRecipientIds(vm.selectedRecipients);
        } catch {
            /* live workspace best-effort; fixtures remain */
        }
    }, []);

    const loadConversations = useCallback(async () => {
        if (COMMS_FIXTURES_ENABLED) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/communications/conversations");
            if (!res.ok) throw new Error(`conversations ${res.status}`);
            const data = (await res.json()) as { conversations?: ConversationSummary[] };
            setConversations(data.conversations ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load conversations");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadConversations();
        if (LIVE_WORKSPACE && COMMS_FIXTURES_ENABLED) {
            const c = FIXTURE_FAMILY_DETAILS[FIXTURE_CONVERSATIONS[0]?.id ?? ""]?.customerId;
            if (c) void loadLive(c, null, true);
        }
    }, [loadConversations, loadLive]);

    const openConversation = useCallback(async (id: string) => {
        setSelectedId(id);
        setSelectedThreadId(null);
        setSubjectDraft("");
        setBodyDraft("");
        if (COMMS_FIXTURES_ENABLED) {
            const liveCustomerId = LIVE_WORKSPACE ? FIXTURE_FAMILY_DETAILS[id]?.customerId : undefined;
            if (liveCustomerId) {
                await loadLive(liveCustomerId, null, true);
                return;
            }
            setMessages(FIXTURE_MESSAGES[id] ?? []);
            setLiveChildren(null);
            return;
        }
        setMessages([]);
        try {
            const res = await fetch(`/api/admin/communications/threads/${id}/messages`);
            if (!res.ok) return;
            const data = (await res.json()) as { messages?: TimelineMessage[] } | TimelineMessage[];
            setMessages(Array.isArray(data) ? data : (data.messages ?? []));
        } catch {
            /* timeline best-effort */
        }
    }, [loadLive]);

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

    const openThread = useCallback(
        async (threadId: string) => {
            if (!LIVE_WORKSPACE) return;
            setSelectedThreadId(threadId);
            const cust = selectedId ? FIXTURE_FAMILY_DETAILS[selectedId]?.customerId : undefined;
            if (cust) await loadLive(cust, threadId);
        },
        [loadLive, selectedId]
    );

    const runFamilySend = useCallback(
        async (confirm: boolean) => {
            if (!LIVE_WORKSPACE) return;
            const cust = selectedId ? FIXTURE_FAMILY_DETAILS[selectedId]?.customerId : undefined;
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
                    await loadLive(cust, selectedThreadId, false); // refresh timeline after send
                }
            } catch {
                setSendError("Send failed");
            } finally {
                setSending(false);
            }
        },
        [loadLive, selectedId, selectedRecipientIds, subjectDraft, bodyDraft, selectedThreadId]
    );

    const filtered = useMemo(() => applyQueueFilters(conversations, filters), [conversations, filters]);
    const grouped = useMemo(() => groupConversationsByQueue(filtered), [filtered]);
    const metrics = useMemo(() => computeCommandCenterMetrics(filtered), [filtered]);
    const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
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
    const healthLabel = health.engagementScore >= 66 ? "Healthy" : health.engagementScore >= 33 ? "At risk" : "Unresponsive";
    const healthTone = health.engagementScore >= 66 ? "text-[#0f6b4a]" : health.engagementScore >= 33 ? "text-[#9a6b16]" : "text-red-600";
    const healthDot = health.engagementScore >= 66 ? "bg-[#00A283]" : health.engagementScore >= 33 ? "bg-[#e0a32e]" : "bg-red-500";

    const responseRate = metrics.total > 0 ? `${Math.round((100 * (metrics.total - metrics.requiresResponse)) / metrics.total)}%` : "—";
    const kpis = [
        { label: "Needs reply", value: metrics.requiresResponse, dot: "bg-[#e0a32e]", tone: "text-[#9a6b16]", status: metrics.requiresResponse > 0 ? "awaiting response" : "all caught up", statusTone: "text-[#9a6b16]" },
        { label: "Overdue", value: metrics.slaAtRisk, dot: "bg-alloy-ember", tone: "text-alloy-ember", status: metrics.slaAtRisk > 0 ? "act now" : "none overdue", statusTone: metrics.slaAtRisk > 0 ? "text-alloy-ember" : "text-[#0f6b4a]" },
        { label: "Unread", value: metrics.unread, dot: "bg-[#00A283]", tone: "text-[#0f6b4a]", status: "new inbound", statusTone: "text-[#0f6b4a]" },
        { label: "Response rate", value: responseRate, dot: "bg-[#5b9aa0]", tone: "text-alloy-midnight", status: "replied share", statusTone: "text-alloy-midnight/45" },
    ];

    return (
        <div data-cc-shell="communications-command-center" className="flex min-h-0 flex-1 flex-col gap-2.5 bg-[#f2f3ef] p-2.5">
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
                        {OPERATIONAL_QUEUES.map((q) => {
                            const items = grouped[q.key] ?? [];
                            if (items.length === 0) return null;
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
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="truncate text-[13px] font-semibold leading-tight text-alloy-midnight">{c.family_label ?? "Family"}</span>
                                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${slaChipClass(c.sla_state)}`}>{slaChipLabel(c.sla_state)}</span>
                                                        </div>
                                                        <div className="mt-1 truncate text-[11px] text-alloy-midnight/55">{d ? `${d.children} · ${d.program}` : (c.channel ?? "")}</div>
                                                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-alloy-midnight/45">
                                                            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
                                                            <span className="truncate">{d ? d.stage : ""}</span>
                                                            <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                                                <span className="truncate text-alloy-midnight/50">{d ? d.owner : (c.assignment_state ?? "")}</span>
                                                                {c.unread ? <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00A283] px-1 text-[9px] font-bold text-white shadow-sm">{c.unread}</span> : null}
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
                            healthTone={healthTone}
                            healthDot={healthDot}
                            healthLabel={healthLabel}
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
                            onAllMessages={() => { const c = selectedId ? FIXTURE_FAMILY_DETAILS[selectedId]?.customerId : undefined; setSelectedThreadId(null); if (c) void loadLive(c, null, false); }}
                            onOpenThread={(t) => void openThread(t)}
                            onToggleRecipient={(id) => setSelectedRecipientIds((prev) => toggleRecipientSelection(prev, id, true))}
                            onSubjectChange={setSubjectDraft}
                            onBodyChange={setBodyDraft}
                            onSendNow={() => void runFamilySend(false)}
                            onConfirmSend={() => void runFamilySend(true)}
                            onDismissSend={() => { setSendResult(null); setSendError(null); }}
                        />
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-6 text-sm text-alloy-midnight/45">Select a family from the queue.</div>
                    )}
                </section>
            </div>
        </div>
    );
}
