"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import {
    takeCommunicationsDrawerPrefetch,
    markCommunicationsDrawerPrefetchConsumed,
    invalidateCommunicationsDrawerPrefetch,
} from "@/lib/admin/communications/communicationsDrawerPrefetch";

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
    sent_at?: string | null;
    from_address?: string | null;
    to_address?: string | null;
};

type DrawerRecipient = {
    person_id: string;
    email: string;
    display_name: string;
    relationship_hint: string | null;
    is_suggested_default: boolean;
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

const COMPOSER_LABEL = "mb-1 text-[8px] font-semibold tracking-[0.12em] text-alloy-midnight/45";

function CommsQuietSkeletonLines({ dense }: { dense?: boolean }) {
    const rowCls = dense
        ? "h-[2.875rem] w-full rounded-md border border-alloy-stone/12 bg-alloy-stone/[0.08]"
        : "h-11 w-full rounded-md border border-alloy-stone/12 bg-alloy-stone/[0.08]";
    return (
        <div className="flex min-h-[4.75rem] flex-col gap-1.5" aria-busy="true">
            <div className={`skeleton-pulse ${rowCls}`} aria-hidden />
            <div
                className={`skeleton-pulse ${dense ? "h-9" : "h-11"} w-[min(100%,18rem)] rounded-md bg-alloy-stone/14`}
                aria-hidden
            />
        </div>
    );
}

/** Map POST /communications/send notes to concise operator copy (honest vs optimistic). */
function userFriendlySendNote(processNote: string): string {
    const n = processNote.trim().toLowerCase();
    if (!n) return "Email queued for delivery.";
    if (
        n.includes("unset") ||
        n.includes("queued until cron") ||
        n.includes("stays queued")
    )
        return "Email queued for delivery.";
    if (n.includes("dispatched") || n.includes("backend process trigger")) return "Email sent.";
    return "Email queued for delivery.";
}

function communicationMessageInstant(m: MsgRow): string | null | undefined {
    const s = m.sent_at ?? m.created_at ?? null;
    return s && String(s).trim() ? s : null;
}

/** Canonical threads + messages + queued email composer (Cards 16–17). */
export default function CommunicationsDrawerSection({
    apiEntityType,
    entityId,
    active = true,
    embedded = true,
    className = "",
}: CommunicationsDrawerSectionProps) {
    const viewerTz = useAdminViewerTimezone();
    const [threads, setThreads] = useState<ThreadRow[]>([]);
    const [thrErr, setThrErr] = useState<string | null>(null);
    const [loadingThreads, setLoadingThreads] = useState(false);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [msgs, setMsgs] = useState<MsgRow[]>([]);
    const [msgErr, setMsgErr] = useState<string | null>(null);
    const [loadingMsgs, setLoadingMsgs] = useState(false);

    const [threadSpaceExpanded, setThreadSpaceExpanded] = useState(false);

    const composerEntity =
        apiEntityType === "opportunities" || apiEntityType === "jobs" ? apiEntityType : null;
    const showEmailComposerChrome = !!(embedded && composerEntity);

    const [channelsAvailable, setChannelsAvailable] = useState<string[]>([]);
    const [bindingsErr, setBindingsErr] = useState<string | null>(null);
    const [loadingBindings, setLoadingBindings] = useState(false);

    const [recipients, setRecipients] = useState<DrawerRecipient[]>([]);
    const [recipientsErr, setRecipientsErr] = useState<string | null>(null);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(() => new Set());
    const [composerSubject, setComposerSubject] = useState("");
    const [composerBody, setComposerBody] = useState("");
    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [sendOkNote, setSendOkNote] = useState<string | null>(null);

    const emailOutboundReady =
        channelsAvailable.includes("email") && !bindingsErr && !loadingBindings;

    useEffect(() => {
        setThreads([]);
        setThrErr(null);
        setLoadingThreads(false);
        setSelectedId(null);
        setMsgs([]);
        setMsgErr(null);
        setLoadingMsgs(false);
        setThreadSpaceExpanded(false);
        setChannelsAvailable([]);
        setBindingsErr(null);
        setRecipients([]);
        setRecipientsErr(null);
        setSelectedRecipientIds(new Set());
        setComposerSubject("");
        setComposerBody("");
        setSendErr(null);
        setSendOkNote(null);
    }, [entityId, apiEntityType]);

    /** When parent hides Communication (`active` false), drop thread detail state (no polling; next open is clean). */
    useEffect(() => {
        if (active) return;
        setThreadSpaceExpanded(false);
        setSelectedId(null);
        setMsgs([]);
        setMsgErr(null);
    }, [active]);

    /** Fetches run only while `active`. */
    const dataLayerActive = active;

    /** When recipients load, default selection = suggested primary or first row. */
    useEffect(() => {
        if (!recipients.length) {
            setSelectedRecipientIds(new Set());
            return;
        }
        const sug = recipients.filter((r) => r.is_suggested_default).map((r) => r.person_id);
        const pick =
            sug.length > 0
                ? sug
                : recipients[0]?.person_id
                  ? [recipients[0].person_id]
                  : [];
        setSelectedRecipientIds(new Set(pick));
    }, [recipients]);

    const loadThreads = useCallback(async () => {
        setThrErr(null);
        const peek = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);

        const applyThreadRowsFromPrefetch = (tRaw: unknown, perfSource: string) => {
            if (typeof console !== "undefined" && typeof console.warn === "function") {
                const list = Array.isArray(tRaw) ? tRaw : [];
                console.warn("[perf.comms.load]", {
                    entity_type: apiEntityType,
                    entity_id: entityId,
                    kind: "threads",
                    source: perfSource,
                    count: list.length,
                });
            }
            const tList = Array.isArray(tRaw) ? (tRaw as ThreadRow[]) : [];
            setThreads(tList);
            markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "threads");
            setSelectedId((prev) => {
                if (embedded) {
                    if (prev && tList.some((x) => x.id === prev)) return prev;
                    return null;
                }
                if (prev && tList.some((x) => x.id === prev)) return prev;
                return tList[0]?.id ?? null;
            });
            setLoadingThreads(false);
        };

        const tsnap = peek?.threads_snapshot;
        if (tsnap) {
            if (tsnap.error) {
                setThrErr(tsnap.error);
                setThreads([]);
                setSelectedId(null);
                markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "threads");
                setLoadingThreads(false);
                return;
            }
            applyThreadRowsFromPrefetch(tsnap.threads, "prefetch_threads_snapshot");
            return;
        }

        setLoadingThreads(true);
        if (typeof console !== "undefined" && typeof console.warn === "function") {
            console.warn("[perf.comms.load]", {
                entity_type: apiEntityType,
                entity_id: entityId,
                kind: "threads",
                source: "network",
            });
        }
        try {
            if (peek?.threads) {
                try {
                    const pr = await peek.threads;
                    if (pr.error) throw new Error(pr.error);
                    applyThreadRowsFromPrefetch(pr.threads, "prefetch_threads_promise");
                    return;
                } catch (e) {
                    if (!(e instanceof Error && e.name === "AbortError")) throw e;
                }
            }
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
        if (!dataLayerActive) return;
        void loadThreads();
    }, [dataLayerActive, loadThreads]);

    useEffect(() => {
        if (!dataLayerActive || !showEmailComposerChrome || !composerEntity) return;

        let cancelled = false;
        (async () => {
            const peekB = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);

            const applyBindingsPayload = (
                pb: { channels: string[]; error: string | null },
                perfSrc: string,
            ) => {
                if (!cancelled) {
                    if (typeof console !== "undefined" && typeof console.warn === "function") {
                        console.warn("[perf.comms.load]", {
                            entity_type: apiEntityType,
                            entity_id: entityId,
                            kind: "bindings",
                            source: perfSrc,
                            channel_count: Array.isArray(pb.channels) ? pb.channels.length : 0,
                            error: pb.error ?? null,
                        });
                    }
                    markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "bindings");
                    if (pb.error) {
                        setBindingsErr(pb.error);
                        setChannelsAvailable([]);
                    } else {
                        setBindingsErr(null);
                        setChannelsAvailable(pb.channels);
                    }
                }
                if (!cancelled) setLoadingBindings(false);
            };

            const bsnap = peekB?.bindings_snapshot;
            if (bsnap) {
                applyBindingsPayload(bsnap, "prefetch_bindings_snapshot");
                return;
            }

            setLoadingBindings(true);
            setBindingsErr(null);
            if (typeof console !== "undefined" && typeof console.warn === "function") {
                console.warn("[perf.comms.load]", {
                    entity_type: apiEntityType,
                    entity_id: entityId,
                    kind: "bindings",
                    source: "network",
                });
            }
            try {
                if (peekB?.bindings) {
                    try {
                        const pb = await peekB.bindings;
                        if (cancelled) return;
                        applyBindingsPayload(pb, "prefetch_bindings_promise");
                        return;
                    } catch (e) {
                        if (!(e instanceof Error && e.name === "AbortError")) throw e;
                    }
                }
                const r = await fetch(`/api/admin/communications/bindings`, { credentials: "include" });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                const ch = (j as { channels_available?: string[] }).channels_available;
                if (!cancelled) setChannelsAvailable(Array.isArray(ch) ? ch : []);
                if (!cancelled) setBindingsErr(null);
            } catch (e) {
                if (!cancelled) setBindingsErr(e instanceof Error ? e.message : "Failed to load bindings");
                if (!cancelled) setChannelsAvailable([]);
            } finally {
                if (!cancelled) setLoadingBindings(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dataLayerActive, showEmailComposerChrome, composerEntity, apiEntityType, entityId]);

    useEffect(() => {
        if (!dataLayerActive || !showEmailComposerChrome || !composerEntity || loadingBindings || !emailOutboundReady) {
            setRecipients([]);
            setRecipientsErr(null);
            setLoadingRecipients(false);
            return;
        }

        let cancelled = false;
        (async () => {
            const peekR = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);

            const applyRecipientsPayload = (
                pr: { recipients: unknown[]; error: string | null },
                perfSrc: string,
            ) => {
                if (cancelled) return;
                if (typeof console !== "undefined" && typeof console.warn === "function") {
                    const list = Array.isArray(pr.recipients) ? pr.recipients : [];
                    console.warn("[perf.comms.load]", {
                        entity_type: apiEntityType,
                        entity_id: entityId,
                        kind: "recipients",
                        source: perfSrc,
                        recipients_count: list.length,
                        error: pr.error ?? null,
                    });
                }
                markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "recipients");
                if (pr.error) {
                    setRecipients([]);
                    setRecipientsErr(pr.error);
                } else {
                    setRecipientsErr(null);
                    setRecipients(Array.isArray(pr.recipients) ? (pr.recipients as DrawerRecipient[]) : []);
                }
                setLoadingRecipients(false);
            };

            const rsnap = peekR?.recipients_snapshot;
            if (rsnap) {
                applyRecipientsPayload(rsnap, "prefetch_recipients_snapshot");
                return;
            }

            setLoadingRecipients(true);
            setRecipientsErr(null);
            if (typeof console !== "undefined" && typeof console.warn === "function") {
                console.warn("[perf.comms.load]", {
                    entity_type: apiEntityType,
                    entity_id: entityId,
                    kind: "recipients",
                    source: "network",
                });
            }
            try {
                if (peekR?.recipients) {
                    try {
                        const pr = await peekR.recipients;
                        if (cancelled) return;
                        applyRecipientsPayload(pr, "prefetch_recipients_promise");
                        return;
                    } catch (e) {
                        if (!(e instanceof Error && e.name === "AbortError")) throw e;
                    }
                }
                const qs = new URLSearchParams({
                    entity_type: composerEntity,
                    entity_id: entityId,
                });
                const r = await fetch(`/api/admin/communications/drawer-recipients?${qs}`, { credentials: "include" });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                const list = (j as { recipients?: DrawerRecipient[] }).recipients;
                if (!cancelled) setRecipients(Array.isArray(list) ? list : []);
                if (!cancelled) setRecipientsErr(null);
            } catch (e) {
                if (!cancelled) {
                    setRecipients([]);
                    setRecipientsErr(e instanceof Error ? e.message : "Failed to load recipients");
                }
            } finally {
                if (!cancelled) setLoadingRecipients(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        dataLayerActive,
        showEmailComposerChrome,
        composerEntity,
        apiEntityType,
        entityId,
        emailOutboundReady,
        loadingBindings,
    ]);

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
        if (!dataLayerActive) return;
        if (!fetchMessages || !selectedId) {
            setMsgs([]);
            setMsgErr(null);
            return;
        }
        void loadMsgs(selectedId);
    }, [dataLayerActive, fetchMessages, selectedId, loadMsgs]);

    const toggleRecipient = (personId: string) => {
        setSelectedRecipientIds((prev) => {
            const n = new Set(prev);
            if (n.has(personId)) n.delete(personId);
            else n.add(personId);
            return n;
        });
    };

    const sendEmails = async () => {
        if (!composerEntity || selectedRecipientIds.size === 0 || !composerBody.trim()) return;
        setSendBusy(true);
        setSendErr(null);
        setSendOkNote(null);
        try {
            let lastNote = "";
            for (const personId of selectedRecipientIds) {
                const res = await fetch("/api/admin/communications/send", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        entity_type: composerEntity,
                        entity_id: entityId,
                        channel: "email",
                        subject: composerSubject.trim(),
                        body: composerBody.trim(),
                        recipient_person_id: personId,
                    }),
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error((j as { error?: string }).error ?? `Send failed (${res.status})`);
                }
                lastNote =
                    typeof (j as { process_trigger_attempted_note?: string }).process_trigger_attempted_note === "string"
                        ? String((j as { process_trigger_attempted_note: string }).process_trigger_attempted_note)
                        : "";
            }
            setSendOkNote(userFriendlySendNote(lastNote));
            setComposerSubject("");
            setComposerBody("");
            invalidateCommunicationsDrawerPrefetch(apiEntityType, entityId);
            await loadThreads();
            const refetchMsgs = (!embedded || threadSpaceExpanded) && selectedId;
            if (refetchMsgs && selectedId) void loadMsgs(selectedId);
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
        } finally {
            setSendBusy(false);
        }
    };

    if (!active) return null;

    const headerTitle = !embedded ? (
        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Communications</h3>
    ) : null;

    const description = !embedded ? (
        <p className="text-sm text-alloy-midnight/65 -mt-2 mb-3">
            Canonical SMS, email, and in-app threads for this record (read-only).
        </p>
    ) : null;

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
                                    · {formatDateTimeForUserDisplay(t.updated_at, viewerTz)}
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
                <div className="flex min-h-[140px] flex-col gap-2 pt-1" aria-busy="true">
                    <div className="skeleton-pulse h-14 w-full rounded-md bg-alloy-stone/12" aria-hidden />
                    <div className="skeleton-pulse h-14 w-[min(100%,90%)] rounded-md bg-alloy-stone/10" aria-hidden />
                </div>
            ) : msgErr ? (
                <p className="text-sm text-alloy-ember">{msgErr}</p>
            ) : msgs.length === 0 ? (
                <p className="text-sm text-alloy-midnight/60">No messages in this thread.</p>
            ) : (
                <ul className="space-y-2">
                    {msgs.map((m) => {
                        const msgWhen = communicationMessageInstant(m);
                        return (
                            <li key={m.id} className="rounded-md border border-alloy-stone/10 bg-alloy-stone/5 px-2.5 py-2 text-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-alloy-forge/70">
                                <span className="font-semibold capitalize text-alloy-forge">
                                    {m.direction} · {m.channel ?? "—"} · {m.status ?? "—"}
                                </span>
                                <span className="tabular-nums text-[11px]">
                                    {msgWhen ? formatDateTimeForUserDisplay(msgWhen, viewerTz) : ""}
                                </span>
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
                        );
                    })}
                </ul>
            )}
        </div>
    );

    const emptyThreadsClass = embedded ? "text-[12px] text-alloy-midnight/60" : "text-sm text-alloy-midnight/60";
    const emptyThreadsBody = <p className={emptyThreadsClass}>No communication threads for this record yet.</p>;

    const expandCollapseBtnClass =
        "text-left text-[12px] font-semibold underline-offset-2 bg-transparent border-0 p-0 cursor-pointer";

    const composerBlock =
        showEmailComposerChrome && composerEntity ? (
            <div className="mb-3 rounded-md border border-alloy-stone/15 bg-white/[0.98] px-2.5 py-2">
                <div className={COMPOSER_LABEL}>Email (queued send)</div>
                {loadingBindings ? (
                    <div className="space-y-1.5 py-1" aria-busy="true">
                        <div className="skeleton-pulse h-3 w-[min(92%,240px)] rounded bg-alloy-stone/14" aria-hidden />
                        <div className="skeleton-pulse h-9 w-full rounded-md bg-alloy-stone/12" aria-hidden />
                    </div>
                ) : bindingsErr ? (
                    <p className="text-[11px] text-alloy-ember">{bindingsErr}</p>
                ) : !channelsAvailable.includes("email") ? (
                    <p className="text-[11px] text-alloy-midnight/65">
                        Email outbound is not configured for this organization (missing active Resend binding).
                    </p>
                ) : loadingRecipients ? (
                    <div className="space-y-1.5 py-1" aria-busy="true">
                        <div className="skeleton-pulse h-3 w-[min(88%,220px)] rounded bg-alloy-stone/14" aria-hidden />
                        <div className="skeleton-pulse h-16 w-full rounded-md bg-alloy-stone/12" aria-hidden />
                    </div>
                ) : recipientsErr ? (
                    <p className="text-[11px] text-alloy-ember">{recipientsErr}</p>
                ) : recipients.length === 0 ? (
                    <p className="text-[11px] text-alloy-midnight/65">
                        No person with email on this record — add or link a person with email on the household to send.
                    </p>
                ) : (
                    <div className="mt-1.5 space-y-2">
                        <div className="space-y-1.5">
                            {recipients.map((r) => (
                                <label
                                    key={r.person_id}
                                    className="flex cursor-pointer items-start gap-2 text-[11px] text-alloy-midnight/80"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedRecipientIds.has(r.person_id)}
                                        onChange={() => toggleRecipient(r.person_id)}
                                        disabled={sendBusy}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <span className="min-w-0 leading-snug">
                                        <span className="font-semibold">{r.display_name}</span>
                                        <span className="text-alloy-midnight/55"> · {r.email}</span>
                                        {r.relationship_hint ? (
                                            <span className="block text-[10px] text-alloy-midnight/45">{r.relationship_hint}</span>
                                        ) : null}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <label className="block space-y-0.5">
                            <span className="block text-[11px] font-medium text-alloy-midnight/75">Subject</span>
                                <input
                                    type="text"
                                    value={composerSubject}
                                    onChange={(e) => setComposerSubject(e.target.value)}
                                    disabled={sendBusy}
                                    placeholder="Optional — sensible default if empty"
                                    className="w-full rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                                    aria-label="Subject"
                                    autoComplete="off"
                                />
                        </label>
                        <textarea
                            value={composerBody}
                            onChange={(e) => setComposerBody(e.target.value)}
                            disabled={sendBusy}
                            rows={3}
                            placeholder="Email body (plain text)…"
                            className="w-full resize-none rounded-md border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] leading-snug text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                            aria-label="Email body"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void sendEmails()}
                                disabled={
                                    sendBusy ||
                                    selectedRecipientIds.size === 0 ||
                                    !composerBody.trim() ||
                                    !emailOutboundReady
                                }
                                className="rounded-md border border-alloy-midnight/20 bg-alloy-midnight px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-midnight/90 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                {sendBusy ? "Sending…" : `Send (${selectedRecipientIds.size})`}
                            </button>
                        </div>
                        {sendErr ? <p className="text-[11px] text-alloy-ember">{sendErr}</p> : null}
                        {sendOkNote ? <p className="text-[11px] text-green-800/85">{sendOkNote}</p> : null}
                    </div>
                )}
            </div>
        ) : null;

    return (
        <div className={`min-w-0 ${className}`}>
            <section>
                {headerTitle}
                {description}

                {composerBlock}

                {embedded ? (
                    !threadSpaceExpanded ? (
                        <div className="space-y-2">
                            {loadingThreads ? (
                                <CommsQuietSkeletonLines dense />
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
                            <div className="flex min-h-[120px] flex-col gap-3 sm:flex-row">
                                {loadingThreads ? (
                                    <div className="min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3">
                                        <CommsQuietSkeletonLines />
                                    </div>
                                ) : thrErr ? (
                                    <p className="min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3 text-[12px] text-alloy-ember">
                                        {thrErr}
                                    </p>
                                ) : threads.length === 0 ? (
                                    <div className="flex min-h-[120px] flex-1 rounded-lg border border-alloy-stone/15 bg-white p-3">
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
                    <div className="min-h-[5rem] rounded-lg border border-alloy-stone/12 bg-white/80 px-3 py-2">
                        <CommsQuietSkeletonLines />
                    </div>
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
    "text-xs font-semibold tracking-wider text-[#59678b] border-b border-[#e6e8ec] pb-2 mb-4";
