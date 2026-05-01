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

export interface CommunicationsDrawerSectionProps {
    apiEntityType: string;
    entityId: string;
    /**
     * When false: no fetches and nothing rendered (parent scopes mount to visible overview areas).
     * @default true
     */
    active?: boolean;
    /** Embedded in overview — compact summary, expand in place, messages only after expand + thread pick. */
    embedded?: boolean;
    /** When embedded inside a drawer section that already shows a "Communication(s)" heading, omit duplicate title. */
    embeddedHeaderMode?: "full" | "description_only";
    className?: string;
}

const EMBEDDED_TITLE_CLASS =
    "text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45 border-b border-alloy-stone/12 pb-1.5 mb-2";

/** Canonical threads + messages (read-only), for overview embedding or legacy tab-width layout. */
export default function CommunicationsDrawerSection({
    apiEntityType,
    entityId,
    active = true,
    embedded = true,
    embeddedHeaderMode = "full",
    className = "",
}: CommunicationsDrawerSectionProps) {
    const [threads, setThreads] = useState<ThreadRow[]>([]);
    const [thrErr, setThrErr] = useState<string | null>(null);
    const [loadingThreads, setLoadingThreads] = useState(false);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [msgs, setMsgs] = useState<MsgRow[]>([]);
    const [msgErr, setMsgErr] = useState<string | null>(null);
    const [loadingMsgs, setLoadingMsgs] = useState(false);

    const [threadSpaceExpanded, setThreadSpaceExpanded] = useState(false);

    useEffect(() => {
        setThreads([]);
        setThrErr(null);
        setLoadingThreads(false);
        setSelectedId(null);
        setMsgs([]);
        setMsgErr(null);
        setLoadingMsgs(false);
        setThreadSpaceExpanded(false);
    }, [entityId, apiEntityType]);

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
                if (embedded) {
                    if (prev && t.some((x) => x.id === prev)) return prev;
                    return null;
                }
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
    }, [apiEntityType, entityId, embedded]);

    useEffect(() => {
        if (!active) return;
        void loadThreads();
    }, [active, loadThreads]);

    const loadMsgs = useCallback(async (tid: string) => {
        setLoadingMsgs(true);
        setMsgErr(null);
        try {
            const r = await fetch(`/api/admin/communications/threads/${encodeURIComponent(tid)}/messages?limit=80`, {
                credentials: "include",
            });
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

    const fetchMessages = embedded ? threadSpaceExpanded : true;

    useEffect(() => {
        if (!active) return;
        if (!fetchMessages || !selectedId) {
            setMsgs([]);
            setMsgErr(null);
            return;
        }
        void loadMsgs(selectedId);
    }, [active, fetchMessages, selectedId, loadMsgs]);

    if (!active) return null;

    const headerTitle =
        embedded && embeddedHeaderMode === "description_only" ? null : embedded ? (
            <h3 className={EMBEDDED_TITLE_CLASS}>Communications</h3>
        ) : (
            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Communications</h3>
        );

    const description = embedded ? (
        <p className="text-[12px] leading-snug text-alloy-midnight/65 mb-2">
            Canonical SMS, email, and in-app threads for this record (read-only).
        </p>
    ) : (
        <p className="text-sm text-alloy-midnight/65 -mt-2 mb-3">
            Canonical SMS, email, and in-app threads for this record (read-only).
        </p>
    );

    const threadList = (variant: "compact" | "full") => (
        <div className={variant === "compact" ? "space-y-1.5" : "sm:w-44 shrink-0 space-y-1"}>
            {threads.map((t) =>
                variant === "compact" ? (
                    <div
                        key={t.id}
                        className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-md border border-alloy-stone/15 bg-white/[0.97] px-2 py-1.5 text-[12px]"
                    >
                        <span className="font-semibold capitalize text-alloy-midnight/85">{t.channel}</span>
                        <span className="min-w-0 truncate text-alloy-midnight/60">
                            {t.recipient_key ? t.recipient_key : "—"}
                            {t.updated_at ? (
                                <span className="ml-1.5 tabular-nums text-[11px] text-alloy-midnight/45">
                                    · {formatDateTime(t.updated_at)}
                                </span>
                            ) : null}
                        </span>
                    </div>
                ) : (
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
                )
            )}
        </div>
    );

    const messagesPanel = (
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
                        <li key={m.id} className="rounded-md border border-alloy-stone/10 bg-alloy-stone/5 px-2.5 py-2 text-sm">
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
                                <div className="mt-1.5 whitespace-pre-wrap text-[13px] text-alloy-forge/90">{m.body}</div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    const emptyThreadsClass = embedded ? "text-[12px] text-alloy-midnight/60" : "text-sm text-alloy-midnight/60";
    const emptyThreadsBody = <p className={emptyThreadsClass}>No communication threads for this record yet.</p>;

    const expandCollapseBtnClass =
        "text-left text-[12px] font-semibold underline-offset-2 bg-transparent border-0 p-0 cursor-pointer";

    return (
        <div className={`min-w-0 ${className}`}>
            <section>
                {headerTitle}
                {description}

                {embedded ? (
                    !threadSpaceExpanded ? (
                        <div className="space-y-2">
                            {loadingThreads ? (
                                <p className="text-[12px] text-alloy-midnight/60">Loading threads…</p>
                            ) : thrErr ? (
                                <p className="text-[12px] text-alloy-ember">{thrErr}</p>
                            ) : threads.length === 0 ? (
                                emptyThreadsBody
                            ) : (
                                threadList("compact")
                            )}
                            <button
                                type="button"
                                className={`${expandCollapseBtnClass} text-alloy-blue hover:underline`}
                                onClick={() => setThreadSpaceExpanded(true)}
                            >
                                Expand thread space
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex flex-col gap-3 sm:flex-row">
                                {loadingThreads ? (
                                    <p className="min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3 text-[12px] text-alloy-midnight/60">
                                        Loading threads…
                                    </p>
                                ) : thrErr ? (
                                    <p className="min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3 text-[12px] text-alloy-ember">
                                        {thrErr}
                                    </p>
                                ) : threads.length === 0 ? (
                                    <div className="min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3">
                                        {emptyThreadsBody}
                                    </div>
                                ) : (
                                    <>
                                        {threadList("full")}
                                        {messagesPanel}
                                    </>
                                )}
                            </div>
                            <button
                                type="button"
                                className={`${expandCollapseBtnClass} text-alloy-midnight/55 hover:text-alloy-blue hover:underline`}
                                onClick={() => {
                                    setThreadSpaceExpanded(false);
                                    setSelectedId(null);
                                }}
                            >
                                Collapse thread space
                            </button>
                        </div>
                    )
                ) : loadingThreads ? (
                    <p className="text-sm text-alloy-midnight/60">Loading threads…</p>
                ) : thrErr ? (
                    <p className="text-sm text-alloy-ember">{thrErr}</p>
                ) : threads.length === 0 ? (
                    emptyThreadsBody
                ) : (
                    <div className="flex flex-col gap-3 sm:flex-row">
                        {threadList("full")}
                        {messagesPanel}
                    </div>
                )}
            </section>
        </div>
    );
}

const DRAWER_SECTION_HEADER_CLASS =
    "text-xs font-semibold uppercase tracking-wider text-[#59678b] border-b border-[#e6e8ec] pb-2 mb-4";
