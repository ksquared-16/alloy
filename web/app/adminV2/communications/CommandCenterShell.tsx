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
 * UI-4: visual hierarchy only (separation, activity-history timeline, drafting composer,
 * tighter queue cards) — no data/route/geometry/BOS change.
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
const entryLabel = (m: TimelineMessage): string => {
    const kind = m.kind && m.kind !== "message" ? m.kind : m.direction === "outbound" ? "sent" : "received";
    return [m.channel, kind].filter(Boolean).join(" · ");
};
const entryDot = (m: TimelineMessage): string =>
    m.kind && m.kind !== "message" ? "bg-alloy-stone/40" : m.direction === "outbound" ? "bg-[#00A283]" : "bg-alloy-midnight/45";

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
                {/* QUEUE — Work Unit-style family cards, grouped by operational state */}
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
                                                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${isSel ? "border-[#00A283] bg-[#f3faf8] shadow-[0_1px_0_rgba(0,162,131,0.08)]" : "border-alloy-stone/15 bg-white hover:border-alloy-stone/30 hover:bg-alloy-stone/[0.03]"}`}
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
                            {/* TOP — Family Snapshot + Communication Health + Consent Status */}
                            <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/15 bg-white px-4 pb-3 pt-3.5">
                                <header className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-[17px] font-semibold leading-tight text-alloy-midnight">{selected.family_label ?? "Family"}</h3>
                                        <p className="mt-1 truncate text-[11px] text-alloy-midnight/55">
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
                                </header>
                                <div className="mt-3 grid grid-cols-2 gap-2.5">
                                    <div data-cc-ws-section="health" className="rounded-lg border border-alloy-stone/15 bg-[#fafbfa] px-3 py-2.5">
                                        <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">Communication health</div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${healthDot}`} />
                                            <span className={`text-sm font-semibold ${healthTone}`}>{healthLabel}</span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[10px] text-alloy-midnight/55">
                                            <span><span className="text-alloy-midnight/40">Engagement</span> <span className="font-semibold text-alloy-midnight/70 tabular-nums">{health.engagementScore}</span></span>
                                            <span><span className="text-alloy-midnight/40">Response</span> <span className="font-semibold text-alloy-midnight/70 tabular-nums">{health.responseRate === null ? "—" : `${Math.round(health.responseRate * 100)}%`}</span></span>
                                            <span><span className="text-alloy-midnight/40">SLA</span> <span className="font-semibold text-alloy-midnight/70">{selected.sla_state ?? "—"}</span></span>
                                        </div>
                                    </div>
                                    <div data-cc-ws-section="consent" className="rounded-lg border border-alloy-stone/15 bg-[#fafbfa] px-3 py-2.5">
                                        <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">Consent status</div>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                                            {(["email", "sms", "marketing"] as const).map((k) => {
                                                const st: ConsentState = detail ? detail.consent[k] : "unset";
                                                return (
                                                    <span key={k} className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 bg-white px-2 py-1">
                                                        <span className="capitalize text-alloy-midnight/60">{k}</span>
                                                        <span className={`font-semibold ${consentTone(st)}`}>{consentMark(st)}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* MIDDLE — Unified Communication Timeline (activity history) */}
                            <div data-cc-ws-section="timeline" className="min-h-0 flex-1 overflow-auto bg-[#fcfcfb] px-4 py-3">
                                <div className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">Communication timeline</div>
                                {messages.length === 0 ? (
                                    <div className="text-[11px] text-alloy-midnight/45">No communication yet.</div>
                                ) : (
                                    <ol data-cc-timeline className="relative ml-1 space-y-3.5 border-l border-alloy-stone/20 pl-4">
                                        {messages.map((m, i) => (
                                            <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className="relative">
                                                <span className={`absolute -left-[21px] top-1 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-[#fcfcfb] ${entryDot(m)}`} />
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">{entryLabel(m)}</span>
                                                    <span className="shrink-0 text-[10px] tabular-nums text-alloy-midnight/35">{relTime(m.created_at)}</span>
                                                </div>
                                                <div className="mt-0.5 text-[13px] leading-snug text-alloy-midnight/85">{m.body ?? ""}</div>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>

                            {/* BOTTOM — Composer (dominant drafting area; review-first, no auto-send) */}
                            <div data-cc-ws-section="composer" className="flex min-h-[244px] shrink-0 flex-col border-t border-alloy-stone/15 bg-[#f7f8f7] px-4 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex overflow-hidden rounded-md border border-alloy-stone/20 bg-white text-xs">
                                        <span className="bg-[#00A283] px-3 py-1.5 font-semibold text-white">Email</span>
                                        <span className="border-l border-alloy-stone/15 px-3 py-1.5 text-alloy-midnight/55">SMS</span>
                                        <span className="border-l border-alloy-stone/15 px-3 py-1.5 text-alloy-midnight/55">Note</span>
                                    </div>
                                    <span className="flex items-center gap-2 text-[10px] text-alloy-midnight/50">
                                        <span>To <span className="text-alloy-midnight/70">{detail ? detail.recipient : (selected.family_label ?? "")}</span></span>
                                        {detail ? <span className={`font-semibold ${consentTone(detail.consent.email)}`}>email {consentMark(detail.consent.email)}</span> : null}
                                    </span>
                                </div>
                                <input
                                    aria-label="Subject"
                                    placeholder="Subject"
                                    className="mt-2.5 w-full rounded-md border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight placeholder:text-alloy-midnight/35"
                                />
                                <textarea
                                    aria-label="Message body"
                                    placeholder={`Write a message to ${selected.family_label ?? "the family"}…`}
                                    className="mt-2 w-full min-h-0 flex-1 resize-none rounded-md border border-alloy-stone/20 bg-white px-3 py-2.5 text-sm leading-relaxed text-alloy-midnight placeholder:text-alloy-midnight/35"
                                />
                                <div className="mt-2.5 flex items-center gap-2">
                                    <span className="rounded-md bg-[#00A283] px-4 py-2 text-sm font-semibold text-white shadow-sm">Send now</span>
                                    <span className="rounded-md border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight">Send later</span>
                                    <span className="inline-flex items-center gap-1 rounded-md border border-[#7fc9b6] bg-[#f0f9f6] px-3 py-2 text-sm font-medium text-[#0f6b4a]">BOS Enhance</span>
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

function slaDotForCard(s: string | null | undefined): string {
    return s === "overdue" ? "bg-alloy-ember" : s === "due" ? "bg-[#e0b020]" : "bg-[#00A283]";
}
