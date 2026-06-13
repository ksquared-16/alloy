"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bold, Italic, List, Link2, Smile, Paperclip, FileText, Clock, Sparkles, Send } from "lucide-react";
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
 * Layout = Queue (family cards) -> Family Communication Workspace
 * (operational header + activity timeline + email composer). UI-1 geometry preserved.
 * Fixture mode (NEXT_PUBLIC_COMMS_V2_FIXTURES) renders with no backend. UI-4B: hierarchy +
 * composer refinement only — no data/route/geometry/BOS change.
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
    s === "overdue" ? "bg-alloy-ember text-white"
    : s === "due" ? "border border-alloy-ember/40 text-alloy-ember"
    : "border border-alloy-stone/25 text-alloy-midnight/55";
const slaChipLabel = (s: string | null | undefined): string =>
    s === "overdue" ? "Overdue" : s === "due" ? "Due soon" : "On track";
const slaDotForCard = (s: string | null | undefined): string =>
    s === "overdue" ? "bg-alloy-ember" : s === "due" ? "bg-[#e0b020]" : "bg-[#00A283]";
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
const eventBadge = (m: TimelineMessage): { label: string; cls: string } => {
    const k = m.kind && m.kind !== "message" ? m.kind : null;
    if (k === "note") return { label: "Note", cls: "border-[#e6c98a] bg-[#fbf3e1] text-[#9a6b16]" };
    if (k === "system") return { label: "System", cls: "border-alloy-stone/25 bg-alloy-stone/[0.06] text-alloy-midnight/55" };
    if (k === "call") return { label: "Call", cls: "border-alloy-stone/25 bg-white text-alloy-midnight/60" };
    if (m.channel === "email") return { label: "Email", cls: "border-[#7fc9b6] bg-[#eef7f3] text-[#0f6b4a]" };
    if (m.channel === "sms") return { label: "SMS", cls: "border-[#9db7d6] bg-[#eef3f9] text-[#33567f]" };
    return { label: (m.channel ?? "Event").toString(), cls: "border-alloy-stone/25 bg-white text-alloy-midnight/60" };
};

const toolbarBtn = "rounded p-1 text-alloy-midnight/55 transition hover:bg-alloy-stone/12 hover:text-alloy-midnight";

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
    const healthDot = health.engagementScore >= 66 ? "bg-[#00A283]" : health.engagementScore >= 33 ? "bg-alloy-ember" : "bg-red-600";
    const healthTone = health.engagementScore >= 66 ? "text-[#0f6b4a]" : health.engagementScore >= 33 ? "text-alloy-ember" : "text-red-600";
    const consentChip = (label: string, st: ConsentState) => (
        <span className={`font-semibold ${consentTone(st)}`}>{label}{consentMark(st)}</span>
    );

    return (
        <div data-cc-shell="communications-command-center" className="flex min-h-0 flex-1 flex-col gap-2.5 bg-[#f4f4f1] p-2.5">
            <div data-cc-metrics className="grid grid-cols-5 gap-2">
                {[
                    ["Conversations", metrics.total],
                    ["Requires response", metrics.requiresResponse],
                    ["SLA at risk", metrics.slaAtRisk],
                    ["Unassigned", metrics.unassigned],
                    ["Unread", metrics.unread],
                ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">{label}</div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums text-alloy-midnight">{value}</div>
                    </div>
                ))}
            </div>

            <div data-cc-filters className="flex items-center gap-2">
                <select
                    aria-label="Channel filter"
                    value={filters.channel ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value || null }))}
                    className="rounded-md border border-alloy-stone/20 bg-white px-2.5 py-1.5 text-xs text-alloy-midnight"
                >
                    <option value="">All channels</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                </select>
                <input
                    aria-label="Search families"
                    value={filters.search ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || null }))}
                    placeholder="Search families…"
                    className="flex-1 rounded-md border border-alloy-stone/20 bg-white px-2.5 py-1.5 text-xs"
                />
                {loading ? <span className="text-[11px] text-alloy-midnight/50">Loading…</span> : null}
                {error ? <span className="text-[11px] text-alloy-ember">{error}</span> : null}
            </div>

            {/* UI-1 geometry: queue ~28% (>=320px floor) / workspace ~72%. BOS rail shell-owned at 345px. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,28%)_minmax(0,1fr)] gap-2.5">
                {/* QUEUE — Work Unit-style family cards */}
                <aside data-cc-column="queue" aria-label="Communication queue" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-white">
                    <div className="shrink-0 border-b border-alloy-stone/12 px-3.5 py-3">
                        <div className="text-sm font-semibold text-alloy-midnight">Communication queue</div>
                        <div className="mt-0.5 text-[11px] text-alloy-midnight/50">Families requiring communication work · {filtered.length}</div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-2.5 py-2">
                        {OPERATIONAL_QUEUES.map((q) => {
                            const items = grouped[q.key] ?? [];
                            if (items.length === 0) return null;
                            return (
                                <div key={q.key} data-cc-queue={q.key} className="mb-3.5">
                                    <div className="mb-1.5 flex items-center justify-between px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                        <span>{q.label}</span>
                                        <span className="tabular-nums">{items.length}</span>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {items.map((c) => {
                                            const d = FIXTURE_FAMILY_DETAILS[c.id];
                                            const isSel = selectedId === c.id;
                                            return (
                                                <li key={c.id}>
                                                    <button
                                                        type="button"
                                                        data-cc-conversation={c.id}
                                                        onClick={() => openConversation(c.id)}
                                                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${isSel ? "border-[#00A283] bg-[#f3faf8]" : "border-alloy-stone/15 bg-white hover:border-alloy-stone/30 hover:bg-alloy-stone/[0.03]"}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="truncate text-[13px] font-semibold leading-tight text-alloy-midnight">{c.family_label ?? "Family"}</span>
                                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${slaChipClass(c.sla_state)}`}>{slaChipLabel(c.sla_state)}</span>
                                                        </div>
                                                        <div className="mt-1 truncate text-[11px] text-alloy-midnight/55">{d ? `${d.children} · ${d.program}` : (c.channel ?? "")}</div>
                                                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-alloy-midnight/45">
                                                            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${slaDotForCard(c.sla_state)}`} />
                                                            <span className="truncate">{d ? d.stage : ""}</span>
                                                            <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                                                <span className="truncate text-alloy-midnight/50">{d ? d.owner : (c.assignment_state ?? "")}</span>
                                                                {c.unread ? <span className="rounded-full bg-[#00A283] px-1.5 py-px text-[9px] font-semibold text-white">{c.unread}</span> : null}
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

                {/* WORKSPACE — Family Communication Workspace */}
                <section data-cc-column="workspace" data-cc-workspace="family-communication" aria-label="Family communication workspace" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-white">
                    {selected ? (
                        <>
                            {/* OPERATIONAL HEADER — snapshot + health + consent, compact */}
                            <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/20 bg-white px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-[17px] font-semibold leading-tight text-alloy-midnight">{selected.family_label ?? "Family"}</h3>
                                        <p className="mt-0.5 truncate text-[11px] text-alloy-midnight/55">
                                            {detail
                                                ? `${detail.children} · ${detail.program} · ${detail.location} · ${detail.stage} · ${detail.owner}`
                                                : [selected.channel, `SLA ${selected.sla_state ?? "—"}`].filter(Boolean).join(" · ")}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        data-cc-claim
                                        disabled={assignBusy || selected.assignment_state === "assigned"}
                                        onClick={() => claim(selected.id)}
                                        className="shrink-0 rounded-md bg-[#00A283] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#009276] disabled:opacity-40"
                                    >
                                        {selected.assignment_state === "assigned" ? "Assigned" : "Claim"}
                                    </button>
                                </div>
                                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                    <span data-cc-ws-section="health" className="inline-flex items-center gap-1.5 rounded-full border border-alloy-stone/20 bg-white px-2 py-1">
                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${healthDot}`} />
                                        <span className={`font-semibold ${healthTone}`}>{healthLabel}</span>
                                        <span className="text-alloy-midnight/40">· eng {health.engagementScore}</span>
                                        <span className="text-alloy-midnight/40">· resp {health.responseRate === null ? "—" : `${Math.round(health.responseRate * 100)}%`}</span>
                                    </span>
                                    <span className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${slaChipClass(selected.sla_state)}`}>SLA {slaChipLabel(selected.sla_state)}</span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-alloy-stone/20 bg-white px-2 py-1 text-alloy-midnight/60">
                                        <span className="text-alloy-midnight/40">Owner</span>{detail ? detail.owner : (selected.assignment_state ?? "—")}
                                    </span>
                                    <span data-cc-ws-section="consent" className="inline-flex items-center gap-1.5 rounded-full border border-alloy-stone/20 bg-white px-2 py-1">
                                        <span className="text-alloy-midnight/40">Consent</span>
                                        {consentChip("E", detail ? detail.consent.email : "unset")}
                                        {consentChip("S", detail ? detail.consent.sms : "unset")}
                                        {consentChip("M", detail ? detail.consent.marketing : "unset")}
                                    </span>
                                </div>
                            </div>

                            {/* TIMELINE — Alloy activity history, event cards */}
                            <div data-cc-ws-section="timeline" className="min-h-0 flex-1 overflow-auto bg-[#f6f7f5] px-4 py-3">
                                <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">Communication timeline</div>
                                {messages.length === 0 ? (
                                    <div className="text-[11px] text-alloy-midnight/45">No communication yet.</div>
                                ) : (
                                    <ol data-cc-timeline className="space-y-2">
                                        {messages.map((m, i) => {
                                            const b = eventBadge(m);
                                            return (
                                                <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(20,30,25,0.04)]">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${b.cls}`}>{b.label}</span>
                                                            <span className="text-[10px] font-medium text-alloy-midnight/45">{dirLabel(m.direction)}</span>
                                                        </span>
                                                        <span className="shrink-0 text-[10px] tabular-nums text-alloy-midnight/40">{relTime(m.created_at)}</span>
                                                    </div>
                                                    <div className="mt-1.5 text-[13px] leading-snug text-alloy-midnight/85">{m.body ?? ""}</div>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                )}
                            </div>

                            {/* COMPOSER — real email composer */}
                            <div data-cc-ws-section="composer" className="flex min-h-[288px] shrink-0 flex-col border-t border-alloy-stone/20 bg-[#eef0ed] px-4 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex overflow-hidden rounded-md border border-alloy-stone/20 bg-white text-xs">
                                        <span className="bg-[#00A283] px-3 py-1.5 font-semibold text-white">Email</span>
                                        <span className="border-l border-alloy-stone/15 px-3 py-1.5 text-alloy-midnight/55">SMS</span>
                                        <span className="border-l border-alloy-stone/15 px-3 py-1.5 text-alloy-midnight/55">Note</span>
                                    </div>
                                    <span className="flex items-center gap-2 text-[10px] text-alloy-midnight/50">
                                        <span>To <span className="font-medium text-alloy-midnight/75">{detail ? detail.recipient : (selected.family_label ?? "")}</span></span>
                                        {detail ? <span className={`font-semibold ${consentTone(detail.consent.email)}`}>email {consentMark(detail.consent.email)}</span> : null}
                                    </span>
                                </div>
                                <input
                                    aria-label="Subject"
                                    placeholder="Subject"
                                    className="mt-2 w-full rounded-md border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight placeholder:text-alloy-midnight/35"
                                />
                                {/* editor card: formatting toolbar + large body */}
                                <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-alloy-stone/20 bg-white">
                                    <div className="flex items-center gap-0.5 border-b border-alloy-stone/12 px-1.5 py-1">
                                        <button type="button" aria-label="Bold" className={toolbarBtn}><Bold className="h-3.5 w-3.5" /></button>
                                        <button type="button" aria-label="Italic" className={toolbarBtn}><Italic className="h-3.5 w-3.5" /></button>
                                        <span className="mx-1 h-4 w-px bg-alloy-stone/20" />
                                        <button type="button" aria-label="Bulleted list" className={toolbarBtn}><List className="h-3.5 w-3.5" /></button>
                                        <button type="button" aria-label="Insert link" className={toolbarBtn}><Link2 className="h-3.5 w-3.5" /></button>
                                        <button type="button" aria-label="Emoji" className={toolbarBtn}><Smile className="h-3.5 w-3.5" /></button>
                                        <span className="ml-auto flex items-center gap-0.5">
                                            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-alloy-midnight/55 hover:bg-alloy-stone/12"><Paperclip className="h-3.5 w-3.5" />Attach</button>
                                            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-alloy-midnight/55 hover:bg-alloy-stone/12"><FileText className="h-3.5 w-3.5" />Templates</button>
                                        </span>
                                    </div>
                                    <textarea
                                        aria-label="Message body"
                                        placeholder={`Write a message to ${selected.family_label ?? "the family"}…`}
                                        className="w-full min-h-0 flex-1 resize-none border-0 bg-white px-3 py-2.5 text-sm leading-relaxed text-alloy-midnight placeholder:text-alloy-midnight/35 focus:outline-none"
                                    />
                                </div>
                                <div className="mt-2.5 flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#00A283] px-4 py-2 text-sm font-semibold text-white shadow-sm"><Send className="h-3.5 w-3.5" />Send now</span>
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight"><Clock className="h-3.5 w-3.5" />Send later</span>
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#7fc9b6] bg-[#f0f9f6] px-3 py-2 text-sm font-medium text-[#0f6b4a]"><Sparkles className="h-3.5 w-3.5" />BOS Enhance</span>
                                    <span className="ml-auto text-[10px] text-alloy-midnight/40">Review-first · no auto-send</span>
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
