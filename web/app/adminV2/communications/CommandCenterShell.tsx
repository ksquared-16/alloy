"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
 * Layout = Queue (family cards) -> Family Communication Workspace (Snapshot + Health +
 * Consent + Timeline + Composer). UI-1 geometry preserved. When NEXT_PUBLIC_COMMS_V2_FIXTURES
 * is on, the component renders from dev fixtures (no backend); otherwise it fetches as before.
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
    : s === "due" ? "border border-alloy-stone/30 text-alloy-midnight"
    : "border border-[#7fc9b6] bg-[#e9f6f2] text-[#0f6b4a]";
const slaChipLabel = (s: string | null | undefined): string =>
    s === "overdue" ? "SLA overdue" : s === "due" ? "SLA due" : "On track";
const slaDot = (s: string | null | undefined): string =>
    s === "overdue" ? "bg-alloy-ember" : s === "due" ? "bg-[#e0b020]" : "bg-[#00A283]";
const consentTone = (s: ConsentState): string =>
    s === "opted_in" ? "text-[#0f6b4a]" : s === "opted_out" ? "text-red-600" : "text-alloy-midnight/40";
const consentMark = (s: ConsentState): string =>
    s === "opted_in" ? "✓" : s === "opted_out" ? "✗" : "—";

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

    // Health from real communication messages only (notes/system/calls excluded), computed client-side.
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

    return (
        <div data-cc-shell="communications-command-center" className="flex min-h-0 flex-1 flex-col gap-2 bg-[#f7f6f3] p-2">
            <div data-cc-metrics className="grid grid-cols-5 gap-1.5">
                {[
                    ["Conversations", metrics.total],
                    ["Requires Response", metrics.requiresResponse],
                    ["SLA At Risk", metrics.slaAtRisk],
                    ["Unassigned", metrics.unassigned],
                    ["Unread", metrics.unread],
                ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border border-alloy-stone/15 bg-white p-1.5">
                        <div className="text-[10px] text-alloy-midnight/60">{label}</div>
                        <div className="text-base font-semibold tabular-nums text-alloy-midnight">{value}</div>
                    </div>
                ))}
            </div>

            <div data-cc-filters className="flex items-center gap-2">
                <select
                    aria-label="Channel filter"
                    value={filters.channel ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value || null }))}
                    className="rounded-md border border-alloy-stone/15 px-2 py-1 text-xs"
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
                    className="flex-1 rounded-md border border-alloy-stone/15 px-2 py-1 text-xs"
                />
                {loading ? <span className="text-[11px] text-alloy-midnight/50">Loading…</span> : null}
                {error ? <span className="text-[11px] text-alloy-ember">{error}</span> : null}
            </div>

            {/* UI-1 geometry: queue ~28% (>=320px floor) / workspace ~72%. BOS rail shell-owned at 345px. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,28%)_minmax(0,1fr)] gap-2">
                {/* QUEUE — Work Unit-style family cards, grouped by operational state */}
                <aside data-cc-column="queue" aria-label="Communication queue" className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/15 bg-white">
                    <div className="shrink-0 border-b border-alloy-stone/15 px-3 py-2">
                        <div className="text-[13px] font-semibold text-alloy-midnight">Communication queue</div>
                        <div className="text-[11px] text-alloy-midnight/55">Families requiring communication work · {filtered.length}</div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-2">
                        {OPERATIONAL_QUEUES.map((q) => {
                            const items = grouped[q.key] ?? [];
                            if (items.length === 0) return null;
                            return (
                                <div key={q.key} data-cc-queue={q.key} className="mb-3">
                                    <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
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
                                                        className={`w-full rounded-lg border bg-white p-2 text-left transition ${isSel ? "border-[#00A283] ring-1 ring-[#9bd8c8]" : "border-alloy-stone/15 hover:border-alloy-stone/30"}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="truncate text-[13px] font-semibold text-alloy-midnight">{c.family_label ?? "Family"}</span>
                                                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${slaChipClass(c.sla_state)}`}>{slaChipLabel(c.sla_state)}</span>
                                                        </div>
                                                        <div className="mt-0.5 truncate text-[11px] text-alloy-midnight/60">{d ? `${d.children} · ${d.program}` : (c.channel ?? "")}</div>
                                                        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-alloy-midnight/55">
                                                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${slaDot(c.sla_state)}`} />
                                                            <span className="truncate">{d ? d.stage : ""}</span>
                                                            <span className="ml-auto flex items-center gap-1.5">
                                                                <span className="truncate">{d ? d.owner : (c.assignment_state ?? "")}</span>
                                                                {c.unread ? <span className="rounded-full bg-[#00A283] px-1.5 text-[9px] font-semibold text-white">{c.unread}</span> : null}
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
                <section data-cc-column="workspace" data-cc-workspace="family-communication" aria-label="Family communication workspace" className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/15 bg-white">
                    {selected ? (
                        <>
                            {/* TOP — Family Snapshot + Communication Health + Consent Status */}
                            <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/15 p-3">
                                <header className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-[15px] font-semibold text-alloy-midnight">{selected.family_label ?? "Family"}</h3>
                                        <p className="mt-0.5 text-[11px] text-alloy-midnight/60">
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
                                        className="shrink-0 rounded-md bg-[#00A283] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                    >
                                        {selected.assignment_state === "assigned" ? "Assigned" : "Claim"}
                                    </button>
                                </header>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <div data-cc-ws-section="health" className="rounded-md border border-alloy-stone/15 p-2">
                                        <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Communication health</div>
                                        <div className="mt-0.5 flex items-center gap-1.5">
                                            <span className={`inline-block h-2 w-2 rounded-full ${healthDot}`} />
                                            <span className="text-xs font-semibold text-alloy-midnight">{healthLabel}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-alloy-midnight/60">
                                            <span>Engagement {health.engagementScore}</span>
                                            <span>Response {health.responseRate === null ? "—" : `${Math.round(health.responseRate * 100)}%`}</span>
                                            <span>SLA {selected.sla_state ?? "—"}</span>
                                        </div>
                                    </div>
                                    <div data-cc-ws-section="consent" className="rounded-md border border-alloy-stone/15 p-2">
                                        <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Consent status</div>
                                        <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                                            {(["email", "sms", "marketing"] as const).map((k) => {
                                                const st: ConsentState = detail ? detail.consent[k] : "unset";
                                                return (
                                                    <span key={k} className="flex items-center gap-1 rounded border border-alloy-stone/20 px-1.5 py-0.5">
                                                        <span className="capitalize text-alloy-midnight/70">{k}</span>
                                                        <span className={`font-semibold ${consentTone(st)}`}>{consentMark(st)}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* MIDDLE — Unified Communication Timeline */}
                            <div data-cc-ws-section="timeline" className="min-h-0 flex-1 overflow-auto p-3">
                                <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Communication timeline</div>
                                <ol data-cc-timeline className="mt-1.5 space-y-1.5">
                                    {messages.map((m, i) => (
                                        <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className="rounded-md border border-alloy-stone/10 px-2.5 py-1.5">
                                            <div className="text-[9px] uppercase tracking-wide text-alloy-midnight/45">
                                                {[m.channel, m.kind && m.kind !== "message" ? m.kind : m.direction].filter(Boolean).join(" · ")}
                                            </div>
                                            <div className="text-xs text-alloy-midnight/85">{m.body ?? ""}</div>
                                        </li>
                                    ))}
                                    {messages.length === 0 ? <li className="text-[11px] text-alloy-midnight/50">No messages.</li> : null}
                                </ol>
                            </div>

                            {/* BOTTOM — Composer (dominant; review-first, no auto-send) */}
                            <div data-cc-ws-section="composer" className="flex min-h-[240px] shrink-0 flex-col border-t border-alloy-stone/15 bg-[#fbfbfa] p-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex gap-1">
                                        <span className="rounded-md border border-[#00A283] bg-white px-2.5 py-1 text-xs font-semibold text-[#0f6b4a]">Email</span>
                                        <span className="rounded-md border border-alloy-stone/20 px-2.5 py-1 text-xs text-alloy-midnight/60">SMS</span>
                                        <span className="rounded-md border border-alloy-stone/20 px-2.5 py-1 text-xs text-alloy-midnight/60">Note</span>
                                    </div>
                                    <span className="ml-auto flex items-center gap-2 text-[10px] text-alloy-midnight/55">
                                        <span>To: {detail ? detail.recipient : (selected.family_label ?? "")}</span>
                                        {detail ? <span className={consentTone(detail.consent.email)}>email {consentMark(detail.consent.email)}</span> : null}
                                    </span>
                                </div>
                                <input aria-label="Subject" placeholder="Subject — Tuesday tour confirmation" className="mt-2 w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm" />
                                <textarea aria-label="Message body" placeholder={`Write a message to ${selected.family_label ?? "the family"}…`} className="mt-2 w-full min-h-0 flex-1 resize-none rounded-md border border-alloy-stone/20 px-2.5 py-2 text-sm" />
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="rounded-md bg-[#00A283] px-3.5 py-1.5 text-sm font-semibold text-white">Send now</span>
                                    <span className="rounded-md border border-alloy-stone/25 px-3 py-1.5 text-sm text-alloy-midnight">Send later</span>
                                    <span className="rounded-md border border-[#7fc9b6] bg-[#f0f9f6] px-3 py-1.5 text-sm text-[#0f6b4a]">BOS Enhance</span>
                                    <span className="ml-auto text-[10px] text-alloy-midnight/45">Review-first · no auto-send</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-6 text-sm text-alloy-midnight/50">Select a family from the queue.</div>
                    )}
                </section>
            </div>
        </div>
    );
}
