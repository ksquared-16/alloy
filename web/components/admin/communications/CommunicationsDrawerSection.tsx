"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/adminFormatters";

type ThreadRow = {
    id: string;
    channel: string;
    recipient_key?: string | null;
    updated_at?: string | null;
};

type MsgRow = {
    id: string;
    direction: string;
    channel?: string | null;
    status?: string | null;
    body?: string | null;
    created_at?: string | null;
    from_address?: string | null;
    to_address?: string | null;
};

interface CommunicationsDrawerSectionProps {
    apiEntityType: string;
    entityId: string;
}

/** Read-only canonical communications (CARD 7). Composer stubbed intentionally. */
export default function CommunicationsDrawerSection({ apiEntityType, entityId }: CommunicationsDrawerSectionProps) {
    const [threads, setThreads] = useState<ThreadRow[]>([]);
    const [thrErr, setThrErr] = useState<string | null>(null);
    const [loadingThreads, setLoadingThreads] = useState(true);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [msgs, setMsgs] = useState<MsgRow[]>([]);
    const [msgErr, setMsgErr] = useState<string | null>(null);
    const [loadingMsgs, setLoadingMsgs] = useState(false);

    const loadThreads = useCallback(async () => {
        setLoadingThreads(true);
        setThrErr(null);
        try {
            const qs = new URLSearchParams({ entity_type: apiEntityType, entity_id: entityId, limit: "40" });
            const r = await fetch(`/api/admin/communications/threads?${qs.toString()}`, { credentials: "include" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
            const t = Array.isArray((j as { threads?: ThreadRow[] }).threads)
                ? (j as { threads: ThreadRow[] }).threads
                : [];
            setThreads(t);
            if (t[0]?.id) setSelectedId(t[0].id);
            else setSelectedId(null);
        } catch (e) {
            setThrErr(e instanceof Error ? e.message : "Failed to load threads");
            setThreads([]);
        } finally {
            setLoadingThreads(false);
        }
    }, [apiEntityType, entityId]);

    useEffect(() => {
        void loadThreads();
    }, [loadThreads]);

    const loadMsgs = useCallback(async (tid: string) => {
        setLoadingMsgs(true);
        setMsgErr(null);
        try {
            const r = await fetch(
                `/api/admin/communications/threads/${encodeURIComponent(tid)}/messages?limit=80`,
                { credentials: "include" }
            );
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
            setMsgs(Array.isArray((j as { messages?: MsgRow[] }).messages) ? j.messages.reverse() : []);
        } catch (e) {
            setMsgErr(e instanceof Error ? e.message : "Failed to load messages");
            setMsgs([]);
        } finally {
            setLoadingMsgs(false);
        }
    }, []);

    useEffect(() => {
        if (selectedId) void loadMsgs(selectedId);
        else setMsgs([]);
    }, [selectedId, loadMsgs]);

    return (
        <div className="space-y-4 pt-2">
            <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-alloy-forge/90">Communications</h3>
                <p className="mt-1 text-sm text-alloy-midnight/65">
                    Canonical SMS / email / in-app threads (read-only listing). Compose / templates are not in scope for
                    this slice.
                </p>
            </div>

            {loadingThreads ? (
                <p className="text-sm text-alloy-midnight/60">Loading threads…</p>
            ) : thrErr ? (
                <p className="text-sm text-alloy-ember">{thrErr}</p>
            ) : threads.length === 0 ? (
                <p className="text-sm text-alloy-midnight/60">No communication threads for this record yet.</p>
            ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="sm:w-44 shrink-0 space-y-1">
                        {threads.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedId(t.id)}
                                className={`w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                                    selectedId === t.id
                                        ? "border-alloy-midnight bg-alloy-midnight text-white"
                                        : "border-alloy-stone/30 bg-white text-alloy-forge hover:bg-alloy-stone/10"
                                }`}
                            >
                                <div className="capitalize">{t.channel}</div>
                                {t.recipient_key ? (
                                    <div className="mt-0.5 truncate font-normal text-[11px] opacity-80">{t.recipient_key}</div>
                                ) : null}
                            </button>
                        ))}
                    </div>
                    <div className="min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3">
                        {selectedId == null ? (
                            <p className="text-sm text-alloy-midnight/60">Select a thread.</p>
                        ) : loadingMsgs ? (
                            <p className="text-sm text-alloy-midnight/60">Loading messages…</p>
                        ) : msgErr ? (
                            <p className="text-sm text-alloy-ember">{msgErr}</p>
                        ) : msgs.length === 0 ? (
                            <p className="text-sm text-alloy-midnight/60">No messages in this thread.</p>
                        ) : (
                            <ul className="space-y-2">
                                {msgs.map((m) => (
                                    <li
                                        key={m.id}
                                        className="rounded-md border border-alloy-stone/10 bg-alloy-stone/5 px-2.5 py-2 text-sm"
                                    >
                                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-alloy-forge/70">
                                            <span className="font-semibold capitalize text-alloy-forge">
                                                {m.direction} · {m.channel ?? "—"} · {m.status ?? "—"}
                                            </span>
                                            <span>{m.created_at ? formatDateTime(m.created_at) : ""}</span>
                                        </div>
                                        {(m.from_address || m.to_address) && (
                                            <div className="mt-1 text-[12px] text-alloy-forge/65">
                                                {m.from_address ? <span>from {m.from_address}</span> : null}
                                                {m.from_address && m.to_address ? " · " : null}
                                                {m.to_address ? <span>to {m.to_address}</span> : null}
                                            </div>
                                        )}
                                        {m.body ? (
                                            <div className="mt-1.5 whitespace-pre-wrap text-[13px] text-alloy-forge/90">
                                                {m.body}
                                            </div>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
