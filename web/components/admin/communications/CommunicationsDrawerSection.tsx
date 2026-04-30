"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type BindingApiRow = {
    id: string;
    channel?: string | null;
    display_label?: string | null | undefined;
};

type BindingsPayload = {
    bindings?: BindingApiRow[];
    channels_available?: string[];
    selectable_by_channel?: { sms?: unknown[]; email?: unknown[] };
};

export default function CommunicationsDrawerSection({ apiEntityType, entityId }: CommunicationsDrawerSectionProps) {
    const [threads, setThreads] = useState<ThreadRow[]>([]);
    const [thrErr, setThrErr] = useState<string | null>(null);
    const [loadingThreads, setLoadingThreads] = useState(true);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [msgs, setMsgs] = useState<MsgRow[]>([]);
    const [msgErr, setMsgErr] = useState<string | null>(null);
    const [loadingMsgs, setLoadingMsgs] = useState(false);

    const [bindErr, setBindErr] = useState<string | null>(null);
    const [bindingsPayload, setBindingsPayload] = useState<BindingsPayload | null>(null);
    const [loadingBindings, setLoadingBindings] = useState(true);

    const [channel, setChannel] = useState<string>("in_app");
    const [bindingId, setBindingId] = useState<string>("");
    const [to, setTo] = useState("");
    const [composerBody, setComposerBody] = useState("");
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

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
            setSelectedId((prev) => {
                if (prev && t.some((x) => x.id === prev)) return prev;
                return t[0]?.id ?? null;
            });
        } catch (e) {
            setThrErr(e instanceof Error ? e.message : "Failed to load threads");
            setThreads([]);
            setSelectedId(null);
        } finally {
            setLoadingThreads(false);
        }
    }, [apiEntityType, entityId]);

    useEffect(() => {
        void loadThreads();
    }, [loadThreads]);

    const loadBindings = useCallback(async () => {
        setLoadingBindings(true);
        setBindErr(null);
        try {
            const r = await fetch(`/api/admin/communications/bindings`, { credentials: "include" });
            const j = (await r.json().catch(() => ({}))) as BindingsPayload & { error?: string };
            if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
            setBindingsPayload(j);
            const avail = Array.isArray(j.channels_available) ? j.channels_available : [];
            if (avail.includes("in_app")) setChannel("in_app");
            else if (avail.includes("email")) setChannel("email");
            else if (avail.includes("sms")) setChannel("sms");
            else setChannel(avail[0] ?? "in_app");
        } catch (e) {
            setBindErr(e instanceof Error ? e.message : "Failed to load bindings");
            setBindingsPayload(null);
        } finally {
            setLoadingBindings(false);
        }
    }, []);

    useEffect(() => {
        void loadBindings();
    }, [loadBindings]);

    const selectableForChannel = useMemo(() => {
        const bp = bindingsPayload?.selectable_by_channel;
        if (!bp) return [] as BindingApiRow[];
        if (channel === "sms" && Array.isArray(bp.sms)) return bp.sms as BindingApiRow[];
        if (channel === "email" && Array.isArray(bp.email)) return bp.email as BindingApiRow[];
        return [];
    }, [bindingsPayload, channel]);

    useEffect(() => {
        if (channel === "sms" || channel === "email") {
            const firstId = selectableForChannel[0]?.id;
            setBindingId((prev) =>
                selectableForChannel.some((b) => b.id === prev) ? prev : (typeof firstId === "string" ? firstId : "")
            );
        } else setBindingId("");
    }, [channel, selectableForChannel]);

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

    const channelsAvailable = bindingsPayload?.channels_available ?? [];

    const sendOutbound = async () => {
        setSendErr(null);
        setSending(true);
        try {
            const payload: Record<string, unknown> = {
                entity_type: apiEntityType,
                entity_id: entityId,
                channel,
                body: composerBody,
            };
            if (channel === "sms" || channel === "email") payload.to = to;
            if (bindingId.trim()) payload.binding_id = bindingId.trim();

            const r = await fetch("/api/admin/communications/send", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
            setComposerBody("");
            setTo("");
            await loadThreads();
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-4 pt-2">
            <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-alloy-forge/90">Communications</h3>
                <p className="mt-1 text-sm text-alloy-midnight/65">
                    Canonical SMS / email / in-app threads. Sends enqueue on the canonical path and emit{" "}
                    <code className="text-[11px]">message_queued</code>; delivery relies on bindings + backend process.
                    Future: granular <span className="text-[11px]">communications.send</span> permission hook.
                </p>
            </div>

            <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 p-3">
                <h4 className="text-[12px] font-semibold uppercase tracking-wide text-alloy-forge/80">Send message</h4>
                {loadingBindings ? (
                    <p className="mt-2 text-sm text-alloy-midnight/55">Loading channel options…</p>
                ) : bindErr ? (
                    <p className="mt-2 text-sm text-alloy-ember">{bindErr}</p>
                ) : channelsAvailable.length === 0 ? (
                    <p className="mt-2 text-sm text-alloy-midnight/65">
                        No outbound channels detected. Confirm migration applied and seeds from the provider setup runbook
                        completed.
                    </p>
                ) : (
                    <div className="mt-3 space-y-3">
                        <label className="block text-[12px] font-medium text-alloy-forge">
                            Channel
                            <select
                                className="mt-1 block w-full max-w-xs rounded-md border border-alloy-stone/35 bg-white px-2 py-1.5 text-sm"
                                value={channel}
                                onChange={(e) => setChannel(e.target.value)}
                            >
                                {channelsAvailable.map((ch) => (
                                    <option key={ch} value={ch}>
                                        {ch.replace("_", " ")}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {(channel === "sms" || channel === "email") && selectableForChannel.length > 1 ? (
                            <label className="block text-[12px] font-medium text-alloy-forge">
                                Sender binding
                                <select
                                    className="mt-1 block w-full max-w-md rounded-md border border-alloy-stone/35 bg-white px-2 py-1.5 text-sm"
                                    value={bindingId}
                                    onChange={(e) => setBindingId(e.target.value)}
                                >
                                    {selectableForChannel.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {(b.display_label || b.channel || "binding") +
                                                ` (${b.id.slice(0, 8)}…)`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                        {channel !== "in_app" ? (
                            <label className="block text-[12px] font-medium text-alloy-forge">
                                To
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border border-alloy-stone/35 bg-white px-2 py-1.5 text-sm"
                                    placeholder={channel === "sms" ? "+1… phone" : "email…"}
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                />
                            </label>
                        ) : (
                            <p className="text-[11px] text-alloy-midnight/55">
                                In-app uses internal queued delivery — no SMS/email provider binding required for enqueue.
                            </p>
                        )}
                        <label className="block text-[12px] font-medium text-alloy-forge">
                            Body
                            <textarea
                                className="mt-1 min-h-[88px] w-full rounded-md border border-alloy-stone/35 bg-white px-2 py-1.5 text-sm"
                                value={composerBody}
                                onChange={(e) => setComposerBody(e.target.value)}
                            />
                        </label>
                        {sendErr ? <p className="text-sm text-alloy-ember">{sendErr}</p> : null}
                        <button
                            type="button"
                            onClick={() => void sendOutbound()}
                            disabled={sending || !composerBody.trim()}
                            className="rounded-md border border-alloy-midnight bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {sending ? "Sending…" : "Send"}
                        </button>
                    </div>
                )}
            </div>

            {loadingThreads ? (
                <p className="text-sm text-alloy-midnight/60">Loading threads…</p>
            ) : thrErr ? (
                <p className="text-sm text-alloy-ember">{thrErr}</p>
            ) : threads.length === 0 ? (
                <p className="text-sm text-alloy-midnight/60">No threads for this record yet — send above to create one.</p>
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
