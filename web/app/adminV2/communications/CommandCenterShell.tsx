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

            <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-2">
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

                <section data-cc-column="workspace" aria-label="Conversation workspace" className="overflow-auto rounded-lg border border-alloy-stone/15 bg-white p-3">
                    {selected ? (
                        <>
                            <header className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-alloy-midnight">{selected.family_label ?? "Conversation"}</h3>
                                    <p className="text-[11px] text-alloy-midnight/60">
                                        {selected.channel} · {selected.assignment_state} · SLA {selected.sla_state ?? "—"}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    data-cc-claim
                                    disabled={assignBusy || selected.assignment_state === "assigned"}
                                    onClick={() => claim(selected.id)}
                                    className="rounded-md bg-[#00A283] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                    {selected.assignment_state === "assigned" ? "Assigned" : "Claim"}
                                </button>
                            </header>
                            <ol data-cc-timeline className="mt-3 space-y-1">
                                {messages.map((m, i) => (
                                    <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className="rounded-md border border-alloy-stone/10 px-2 py-1 text-xs">
                                        <span className="text-[10px] text-alloy-midnight/50">{m.direction}</span> {m.body ?? ""}
                                    </li>
                                ))}
                                {messages.length === 0 ? <li className="text-[11px] text-alloy-midnight/50">No messages.</li> : null}
                            </ol>
                        </>
                    ) : (
                        <p className="text-xs text-alloy-midnight/60">Select a conversation from a queue.</p>
                    )}
                </section>
            </div>
        </div>
    );
}
