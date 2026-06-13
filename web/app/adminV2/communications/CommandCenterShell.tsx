"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Users, Activity, ShieldCheck, Clock, User, UserPlus, ChevronDown, ChevronRight,
    Mail, MessageSquare, Phone, StickyNote, Settings2,
    Bold, Italic, List, Link2, Smile, Paperclip, FileText, Sparkles, Send,
} from "lucide-react";
import {
    OPERATIONAL_QUEUES,
    groupConversationsByQueue,
    computeCommandCenterMetrics,
    applyQueueFilters,
    type ConversationSummary,
    type CommandCenterFilters,
} from "@/lib/communications/v2/commandCenterViewModel";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import {
    COMMS_FIXTURES_ENABLED,
    FIXTURE_CONVERSATIONS,
    FIXTURE_MESSAGES,
    FIXTURE_FAMILY_DETAILS,
    type FixtureFamilyDetail,
    type ConsentState,
} from "@/app/adminV2/communications/fixtures";

/**
 * Communications V2 — Command Center body. Renders INSIDE the existing modal shell
 * (AdminV2WorkspaceBosModalShell); the BOS rail is the shell's and is untouched.
 * UI-4E: targeted layout compression (compact KPIs, queue-scoped filters, header
 * assignment control, clickable timeline w/ View thread affordance, one-row composer
 * actions, premium header). Presentation only; fixture mode kept; no data/route/outer-
 * geometry/BOS change. Multi-child + multi-contact remain visual affordances (not wired).
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

const consentTone = (s: ConsentState): string =>
    s === "opted_in" ? "text-[#0f6b4a]" : s === "opted_out" ? "text-red-600" : "text-alloy-midnight/40";
const consentMark = (s: ConsentState): string =>
    s === "opted_in" ? "✓" : s === "opted_out" ? "✗" : "—";

const relTime = (iso: string | null | undefined): string => {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms)) return "";
    const h = Math.round(ms / 3.6e6);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
};
const dirLabel = (d: string | null | undefined): string =>
    d === "outbound" ? "Sent" : d === "inbound" ? "Received" : "Internal";

type IconType = typeof Mail;
const eventStyle = (m: TimelineMessage): { label: string; badge: string; rail: string; dotText: string; Icon: IconType } => {
    const k = m.kind && m.kind !== "message" ? m.kind : null;
    if (k === "note") return { label: "Note", badge: "border-[#e6c98a] bg-[#fbf3e1] text-[#9a6b16]", rail: "border-l-[#e0a32e]", dotText: "text-[#9a6b16]", Icon: StickyNote };
    if (k === "system") return { label: "System", badge: "border-alloy-stone/25 bg-alloy-stone/[0.06] text-alloy-midnight/55", rail: "border-l-alloy-stone/30", dotText: "text-alloy-midnight/45", Icon: Settings2 };
    if (k === "call") return { label: "Call", badge: "border-alloy-stone/25 bg-white text-alloy-midnight/60", rail: "border-l-alloy-stone/30", dotText: "text-alloy-midnight/55", Icon: Phone };
    if (m.channel === "sms") return { label: "SMS", badge: "border-[#9db7d6] bg-[#eef3f9] text-[#33567f]", rail: m.direction === "outbound" ? "border-l-[#00A283]" : "border-l-[#33567f]", dotText: "text-[#33567f]", Icon: MessageSquare };
    return { label: "Email", badge: "border-[#7fc9b6] bg-[#eef7f3] text-[#0f6b4a]", rail: m.direction === "outbound" ? "border-l-[#00A283]" : "border-l-alloy-midnight/30", dotText: "text-[#0f6b4a]", Icon: Mail };
};

const toolbarBtn = "rounded-md p-1.5 text-alloy-midnight/55 transition hover:bg-alloy-stone/12 hover:text-alloy-midnight";

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
    }, [loadConversations]);

    const openConversation = useCallback(async (id: string) => {
        setSelectedId(id);
        if (COMMS_FIXTURES_ENABLED) {
            setMessages(FIXTURE_MESSAGES[id] ?? []);
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
    }, []);

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

    const filtered = useMemo(() => applyQueueFilters(conversations, filters), [conversations, filters]);
    const grouped = useMemo(() => groupConversationsByQueue(filtered), [filtered]);
    const metrics = useMemo(() => computeCommandCenterMetrics(filtered), [filtered]);
    const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
    const detail: FixtureFamilyDetail | undefined = selected ? FIXTURE_FAMILY_DETAILS[selected.id] : undefined;
    const childNames = useMemo(
        () => (detail ? detail.children.split(/\s*[&,]\s*/).map((s) => s.trim()).filter(Boolean) : []),
        [detail]
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
    const healthLabel = health.engagementScore >= 66 ? "Healthy" : health.engagementScore >= 33 ? "At risk" : "Unresponsive";
    const healthChip =
        health.engagementScore >= 66 ? "border-[#7fc9b6] bg-[#eafaf3] text-[#0f6b4a]"
        : health.engagementScore >= 33 ? "border-[#e6c98a] bg-[#fbf6ea] text-[#9a6b16]"
        : "border-red-200 bg-red-50 text-red-600";
    const healthDot =
        health.engagementScore >= 66 ? "bg-[#00A283]" : health.engagementScore >= 33 ? "bg-[#e0a32e]" : "bg-red-500";

    // Compact, meaningful KPIs (dot + value + label + priority word)
    const kpis = [
        { label: "Conversations", value: metrics.total, dot: "bg-alloy-midnight/40", tone: "text-alloy-midnight", status: "active", statusTone: "text-alloy-midnight/45" },
        { label: "Requires response", value: metrics.requiresResponse, dot: "bg-[#e0a32e]", tone: "text-[#9a6b16]", status: metrics.requiresResponse > 0 ? "needs reply" : "clear", statusTone: "text-[#9a6b16]" },
        { label: "SLA at risk", value: metrics.slaAtRisk, dot: "bg-alloy-ember", tone: "text-alloy-ember", status: metrics.slaAtRisk > 0 ? "act now" : "on track", statusTone: metrics.slaAtRisk > 0 ? "text-alloy-ember" : "text-[#0f6b4a]" },
        { label: "Unassigned", value: metrics.unassigned, dot: "bg-[#5b9aa0]", tone: "text-alloy-midnight", status: metrics.unassigned > 0 ? "assign" : "all owned", statusTone: "text-alloy-midnight/45" },
        { label: "Unread", value: metrics.unread, dot: "bg-[#00A283]", tone: "text-[#0f6b4a]", status: "new", statusTone: "text-[#0f6b4a]" },
    ];

    return (
        <div data-cc-shell="communications-command-center" className="flex min-h-0 flex-1 flex-col gap-2.5 bg-[#f2f3ef] p-2.5">
            {/* KPI row — compact, color-coded, with priority language */}
            <div data-cc-metrics className="grid grid-cols-5 gap-2">
                {kpis.map((k) => (
                    <div key={k.label} className="flex items-center gap-2 rounded-lg border border-alloy-stone/12 bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(20,30,25,0.04)]">
                        <span className={`h-6 w-1 shrink-0 rounded-full ${k.dot}`} />
                        <span className={`text-lg font-semibold leading-none tabular-nums ${k.tone}`}>{k.value}</span>
                        <span className="min-w-0 leading-tight">
                            <span className="block truncate text-[10px] font-medium text-alloy-midnight/55">{k.label}</span>
                            <span className={`block truncate text-[9px] font-medium ${k.statusTone}`}>{k.status}</span>
                        </span>
                    </div>
                ))}
            </div>

            {error ? <div className="text-[11px] text-alloy-ember">{error}</div> : null}

            {/* UI-1 geometry: queue ~28% (>=320px floor) / workspace ~72%. BOS rail shell-owned at 345px. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,28%)_minmax(0,1fr)] gap-2.5">
                {/* QUEUE — header carries the (compact) filter + search row */}
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

                {/* WORKSPACE — premium compact header, then two-column body */}
                <section data-cc-column="workspace" data-cc-workspace="family-communication" aria-label="Family communication workspace" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-alloy-stone/12 bg-white shadow-[0_1px_3px_rgba(20,30,25,0.05)]">
                    {selected ? (
                        <>
                            {/* PREMIUM OPERATIONAL HEADER (2 compact rows; assignment lives on the chip row) */}
                            <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/25 bg-gradient-to-br from-[#eef7f3] via-white to-[#eef6f4] px-4 py-2.5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#dff2ea] text-[#0f6b4a] ring-1 ring-[#7fc9b6]/60 shadow-sm">
                                        <Users className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="truncate text-[17px] font-semibold leading-tight text-alloy-midnight">{selected.family_label ?? "Family"}</h3>
                                            {childNames.length > 0 ? (
                                                <span className="flex shrink-0 items-center gap-1">
                                                    {childNames.map((n) => (
                                                        <span key={n} className="inline-flex items-center rounded-full border border-[#7fc9b6]/60 bg-[#f0faf6] px-2 py-0.5 text-[10px] font-medium text-[#0f6b4a]">{n}</span>
                                                    ))}
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="mt-0.5 truncate text-[11px] text-alloy-midnight/60">
                                            {detail ? `${detail.program} · ${detail.location} · ${detail.stage}` : [selected.channel, `SLA ${selected.sla_state ?? "—"}`].filter(Boolean).join(" · ")}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                                    <span data-cc-ws-section="health" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${healthChip}`}>
                                        <Activity className="h-3 w-3" />
                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${healthDot}`} />
                                        {healthLabel}
                                        <span className="font-normal opacity-70">· eng {health.engagementScore} · resp {health.responseRate === null ? "—" : `${Math.round(health.responseRate * 100)}%`}</span>
                                    </span>
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${slaChipClass(selected.sla_state)}`}>
                                        <Clock className="h-3 w-3" />{slaChipLabel(selected.sla_state)}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-alloy-stone/20 bg-white px-2.5 py-1 font-medium text-alloy-midnight/70">
                                        <User className="h-3 w-3 text-alloy-midnight/45" />{detail ? detail.owner : (selected.assignment_state ?? "—")}
                                    </span>
                                    <span data-cc-ws-section="consent" className="inline-flex items-center gap-1.5 rounded-full border border-alloy-stone/20 bg-white px-2.5 py-1">
                                        <ShieldCheck className="h-3 w-3 text-alloy-midnight/45" />
                                        <span className="font-medium text-alloy-midnight/45">Consent</span>
                                        <span className={`font-bold ${consentTone(detail ? detail.consent.email : "unset")}`}>E{consentMark(detail ? detail.consent.email : "unset")}</span>
                                        <span className={`font-bold ${consentTone(detail ? detail.consent.sms : "unset")}`}>S{consentMark(detail ? detail.consent.sms : "unset")}</span>
                                        <span className={`font-bold ${consentTone(detail ? detail.consent.marketing : "unset")}`}>M{consentMark(detail ? detail.consent.marketing : "unset")}</span>
                                    </span>
                                    {/* assignment control — compact, top-right of the header */}
                                    <button
                                        type="button"
                                        data-cc-claim
                                        disabled={assignBusy || selected.assignment_state === "assigned"}
                                        onClick={() => claim(selected.id)}
                                        className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold shadow-sm transition ${
                                            selected.assignment_state === "assigned"
                                                ? "border border-[#7fc9b6] bg-[#eafaf3] text-[#0f6b4a]"
                                                : "bg-[#00A283] text-white hover:bg-[#009276]"
                                        }`}
                                    >
                                        <User className="h-3 w-3" />{selected.assignment_state === "assigned" ? "Assigned" : "Claim"}
                                    </button>
                                </div>
                            </div>

                            {/* BODY — timeline (left) | persistent composer (right) */}
                            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(360px,44%)]">
                                <div data-cc-ws-section="timeline" className="min-h-0 overflow-auto bg-[#f5f6f4] px-4 py-3">
                                    <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">Communication timeline</div>
                                    {messages.length === 0 ? (
                                        <div className="text-[11px] text-alloy-midnight/45">No communication yet.</div>
                                    ) : (
                                        <ol data-cc-timeline className="space-y-2">
                                            {messages.map((m, i) => {
                                                const e = eventStyle(m);
                                                const Icon = e.Icon;
                                                return (
                                                    <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""}>
                                                        <button
                                                            type="button"
                                                            data-cc-thread-open={m.id ?? i}
                                                            className={`group block w-full cursor-pointer rounded-xl border border-l-[3px] border-alloy-stone/12 ${e.rail} bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(20,30,25,0.05)] transition hover:border-[#7fc9b6] hover:shadow-[0_2px_8px_rgba(0,162,131,0.10)]`}
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="flex items-center gap-1.5">
                                                                    <Icon className={`h-3.5 w-3.5 ${e.dotText}`} />
                                                                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${e.badge}`}>{e.label}</span>
                                                                    <span className="text-[10px] font-medium text-alloy-midnight/45">{dirLabel(m.direction)}</span>
                                                                </span>
                                                                <span className="flex shrink-0 items-center gap-2">
                                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#0f6b4a] opacity-0 transition group-hover:opacity-100">View thread<ChevronRight className="h-3 w-3" /></span>
                                                                    <span className="text-[10px] tabular-nums text-alloy-midnight/40">{relTime(m.created_at)}</span>
                                                                </span>
                                                            </div>
                                                            <div className="mt-1.5 text-[13px] leading-snug text-alloy-midnight/85">{m.body ?? ""}</div>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    )}
                                </div>

                                <div data-cc-ws-section="composer" className="flex min-h-0 flex-col border-l border-alloy-stone/15 bg-gradient-to-b from-[#fbfcfb] to-[#f3f5f2] px-3.5 py-3">
                                    <div className="mb-2 inline-flex w-fit overflow-hidden rounded-lg border border-alloy-stone/20 bg-white text-[11px] shadow-sm">
                                        <span className="bg-[#00A283] px-2.5 py-1 font-semibold text-white">Email</span>
                                        <span className="border-l border-alloy-stone/15 px-2.5 py-1 text-alloy-midnight/55">SMS</span>
                                        <span className="border-l border-alloy-stone/15 px-2.5 py-1 text-alloy-midnight/55">Note</span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 shadow-sm">
                                        <span className="text-[10px] font-medium text-alloy-midnight/40">To</span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eafaf3] px-2 py-0.5 text-[10px] font-medium text-[#0f6b4a] ring-1 ring-[#7fc9b6]/50">
                                            {detail ? detail.recipient : (selected.family_label ?? "")}
                                            {detail ? <span className={`font-bold ${consentTone(detail.consent.email)}`}>{consentMark(detail.consent.email)}</span> : null}
                                        </span>
                                        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-alloy-stone/30 px-2 py-0.5 text-[10px] text-alloy-midnight/50 hover:border-[#7fc9b6] hover:text-[#0f6b4a]">
                                            <UserPlus className="h-3 w-3" />Add contact
                                        </button>
                                        <ChevronDown className="ml-auto h-3.5 w-3.5 text-alloy-midnight/35" />
                                    </div>

                                    <input
                                        aria-label="Subject"
                                        placeholder="Subject"
                                        className="mt-2 w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm placeholder:text-alloy-midnight/35"
                                    />

                                    <div className="mt-2 flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-lg border border-alloy-stone/20 bg-white shadow-sm">
                                        <div className="flex items-center gap-0.5 border-b border-alloy-stone/12 bg-[#fbfcfb] px-1.5 py-1">
                                            <button type="button" aria-label="Bold" className={toolbarBtn}><Bold className="h-3.5 w-3.5" /></button>
                                            <button type="button" aria-label="Italic" className={toolbarBtn}><Italic className="h-3.5 w-3.5" /></button>
                                            <span className="mx-1 h-4 w-px bg-alloy-stone/20" />
                                            <button type="button" aria-label="Bulleted list" className={toolbarBtn}><List className="h-3.5 w-3.5" /></button>
                                            <button type="button" aria-label="Insert link" className={toolbarBtn}><Link2 className="h-3.5 w-3.5" /></button>
                                            <button type="button" aria-label="Emoji" className={toolbarBtn}><Smile className="h-3.5 w-3.5" /></button>
                                            <span className="ml-auto flex items-center gap-0.5">
                                                <button type="button" aria-label="Attach" className={toolbarBtn}><Paperclip className="h-3.5 w-3.5" /></button>
                                                <button type="button" aria-label="Templates" className={toolbarBtn}><FileText className="h-3.5 w-3.5" /></button>
                                            </span>
                                        </div>
                                        <textarea
                                            aria-label="Message body"
                                            placeholder={`Write a message to ${selected.family_label ?? "the family"}…`}
                                            className="w-full min-h-0 flex-1 resize-none border-0 bg-white px-3.5 py-3 text-sm leading-relaxed text-alloy-midnight placeholder:text-alloy-midnight/35 focus:outline-none"
                                        />
                                    </div>

                                    {/* action row — single line */}
                                    <div className="mt-2.5 flex items-center gap-1.5">
                                        <button type="button" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#00A283] px-3 py-2 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,162,131,0.3)]"><Send className="h-3.5 w-3.5" />Send now</button>
                                        <button type="button" aria-label="Send later" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-2 text-sm text-alloy-midnight/80 shadow-sm"><Clock className="h-3.5 w-3.5" />Later</button>
                                        <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#7fc9b6] bg-gradient-to-r from-[#eafaf4] to-[#e0f4ee] px-2.5 py-2 text-sm font-semibold text-[#0f6b4a] shadow-[0_1px_4px_rgba(0,162,131,0.18)] ring-1 ring-[#00A283]/15"><Sparkles className="h-3.5 w-3.5" />BOS Enhance</button>
                                        <span className="ml-auto text-[9px] leading-tight text-alloy-midnight/40">Review-first<br />no auto-send</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-6 text-sm text-alloy-midnight/45">Select a family from the queue.</div>
                    )}
                </section>
            </div>
        </div>
    );
}
