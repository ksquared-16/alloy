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
import ComposerV2 from "@/app/adminV2/communications/composer/ComposerV2";

/**
 * Communications V2 — Command Center body (ACT-1, corrected).
 * Renders INSIDE the existing conversations modal (AdminV2WorkspaceBosModalShell), REPLACING the legacy panel when
 * comms_v2_command_center is on. The BOS right rail is the modal shell's — unchanged, stays put.
 * This body is Queue → Conversation Workspace (operational queues, not a generic mailbox). Read-only + assignment.
 */

type TimelineMessage = {
    id?: string;
    direction?: string | null;
    channel?: string | null;
    body?: string | null;
    created_at?: string | null;
};

export default function CommandCenterShell() {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<CommandCenterFilters>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [messages, setMessages] = useState<TimelineMessage[]>([]);
    const [assignBusy, setAssignBusy] = useState(false);

    const loadConversations = useCallback(async () => {
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

    // UI-2: Family Communication Workspace — health derived client-side from already-fetched messages
    // (existing pure view-model). No new route/provider/schema. Consent data wires in a later activation step.
    const health = useMemo(
        () =>
            computeCommunicationHealth({
                messages: messages.map((m) => ({ direction: m.direction, created_at: m.created_at, channel: m.channel })),
                unreadCount: selected?.unread ?? undefined,
            }),
        [messages, selected]
    );
    const healthLabel = health.engagementScore >= 66 ? "Healthy" : health.engagementScore >= 33 ? "At risk" : "Unresponsive";
    const healthDotClass = health.engagementScore >= 66 ? "bg-[#00A283]" : health.engagementScore >= 33 ? "bg-alloy-ember" : "bg-red-600";
    const lastContactLabel = health.lastContactAt
        ? `Last contact ${new Date(health.lastContactAt).toLocaleDateString()}`
        : null;

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

            {/* UI-1: two-column drawer split — queue ~28% (>=320px readability floor) / workspace ~72%.
                Width and height inherit from the shell geometry (drawer-computed-width x max-h 920) via flex-1/min-h-0.
                BOS rail stays shell-owned at 345px. No schema/route/provider/BOS changes. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,28%)_minmax(0,1fr)] gap-2">
                <aside data-cc-column="queue" aria-label="Operational queues" className="overflow-auto rounded-lg border border-alloy-stone/15 bg-white p-1.5">
                    {OPERATIONAL_QUEUES.map((q) => {
                        const items = grouped[q.key] ?? [];
                        return (
                            <div key={q.key} data-cc-queue={q.key} className="mb-2">
                                <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-alloy-midnight">
                                    <span>{q.label}</span>
                                    <span className="tabular-nums text-alloy-midnight/50">{items.length}</span>
                                </div>
                                <ul className="mt-0.5 space-y-0.5">
                                    {items.map((c) => (
                                        <li key={c.id}>
                                            <button
                                                type="button"
                                                onClick={() => openConversation(c.id)}
                                                data-cc-conversation={c.id}
                                                className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs ${
                                                    selectedId === c.id ? "bg-alloy-stone/10" : ""
                                                }`}
                                            >
                                                <span className="truncate text-alloy-midnight/80">{c.family_label ?? c.id.slice(0, 8)}</span>
                                                <span className="ml-2 flex items-center gap-1">
                                                    {c.sla_state === "overdue" ? <span className="text-alloy-ember">●</span> : null}
                                                    {c.unread ? <span className="rounded-full bg-[#00A283] px-1.5 text-[9px] text-white">{c.unread}</span> : null}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </aside>

                <section
                    data-cc-column="workspace"
                    data-cc-workspace="family-communication"
                    aria-label="Family communication workspace"
                    className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/15 bg-white"
                >
                    {selected ? (
                        <>
                            {/* TOP — Family Snapshot + Communication Health + Consent Status (~15-20%) */}
                            <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/15 p-3">
                                <header className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-sm font-semibold text-alloy-midnight">{selected.family_label ?? "Family"}</h3>
                                        <p className="mt-0.5 text-[11px] text-alloy-midnight/60">
                                            {[
                                                selected.channel,
                                                selected.location_id ? `Location ${selected.location_id}` : null,
                                                `Owner ${selected.assignment_state ?? "unassigned"}`,
                                                lastContactLabel,
                                            ]
                                                .filter(Boolean)
                                                .join(" \u00b7 ")}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        data-cc-claim
                                        disabled={assignBusy || selected.assignment_state === "assigned"}
                                        onClick={() => claim(selected.id)}
                                        className="shrink-0 rounded-md bg-[#00A283] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                                    >
                                        {selected.assignment_state === "assigned" ? "Assigned" : "Claim"}
                                    </button>
                                </header>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <div data-cc-ws-section="health" className="rounded-md border border-alloy-stone/15 p-2">
                                        <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Communication health</div>
                                        <div className="mt-0.5 flex items-center gap-1.5">
                                            <span className={`inline-block h-2 w-2 rounded-full ${healthDotClass}`} />
                                            <span className="text-xs font-semibold text-alloy-midnight">{healthLabel}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-alloy-midnight/60">
                                            <span>Engagement {health.engagementScore}</span>
                                            <span>Response {health.responseRate === null ? "\u2014" : `${Math.round(health.responseRate * 100)}%`}</span>
                                            <span>SLA {selected.sla_state ?? "\u2014"}</span>
                                        </div>
                                    </div>
                                    <div data-cc-ws-section="consent" className="rounded-md border border-alloy-stone/15 p-2">
                                        <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Consent status</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                                            {["Email", "SMS", "Marketing"].map((c) => (
                                                <span key={c} className="rounded border border-alloy-stone/20 px-1.5 py-0.5 text-alloy-midnight/70">
                                                    {c} <span className="text-alloy-midnight/40">{"\u2014"}</span>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="mt-1 text-[9px] text-alloy-midnight/40">Per-channel consent loads with activation.</div>
                                    </div>
                                </div>
                            </div>

                            {/* MIDDLE — Unified Communication Timeline (~50-60%) */}
                            <div data-cc-ws-section="timeline" className="min-h-0 flex-1 overflow-auto p-3">
                                <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Communication timeline</div>
                                <ol data-cc-timeline className="mt-1.5 space-y-1">
                                    {messages.map((m, i) => (
                                        <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className="rounded-md border border-alloy-stone/10 px-2 py-1 text-xs">
                                            <span className="mr-1 text-[10px] uppercase text-alloy-midnight/45">{[m.channel, m.direction].filter(Boolean).join(" \u00b7 ")}</span>
                                            <span className="text-alloy-midnight/80">{m.body ?? ""}</span>
                                        </li>
                                    ))}
                                    {messages.length === 0 ? <li className="text-[11px] text-alloy-midnight/50">No messages.</li> : null}
                                </ol>
                            </div>

                            {/* BOTTOM — Composer (~25-35%): reuse existing ComposerV2 (self-gated, review-first, no auto-send) */}
                            <div data-cc-ws-section="composer" className="shrink-0 border-t border-alloy-stone/15 p-2">
                                <ComposerV2 />
                            </div>
                        </>
                    ) : (
                        <p className="p-3 text-xs text-alloy-midnight/60">Select a conversation from a queue.</p>
                    )}
                </section>
            </div>
        </div>
    );
}
