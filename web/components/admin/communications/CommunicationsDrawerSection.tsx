"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import {
    takeCommunicationsDrawerPrefetch,
    markCommunicationsDrawerPrefetchConsumed,
    invalidateCommunicationsDrawerPrefetch,
} from "@/lib/admin/communications/communicationsDrawerPrefetch";
import type { CommunicationMessage } from "@/lib/communications/deliveryStateAdapter";
import { deliveryStatePresentation, mapToDeliveryState } from "@/lib/communications/deliveryStateAdapter";

type ThreadRow = {
    id: string;
    channel: string;
    recipient_key?: string | null;
    updated_at?: string | null;
    primary_entity_type?: string | null;
    primary_entity_id?: string | null;
    anchor_kind?: "record" | "related_person";
    last_message_preview?: {
        direction: string;
        channel: string;
        status: string | null;
        body: string | null;
        created_at: string | null;
    } | null;
};

type MsgRow = CommunicationMessage & {
    id: string;
    body?: string | null;
    created_at?: string | null;
    sent_at?: string | null;
    from_address?: string | null;
    to_address?: string | null;
    provider_message_id?: string | null;
    metadata?: Record<string, unknown> | null;
    delivered_at?: string | null;
};

type DrawerRecipient = {
    person_id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    relationship_hint: string | null;
    is_suggested_default: boolean;
};

/** Unified history filter + composer mode (in-app hidden). */
type ViewFilter = "all" | "email" | "sms";

type MsgRowWithThread = MsgRow & { _thread_id?: string };

const MESSAGES_PER_THREAD_LIMIT = 36;
const MAX_MERGE_THREADS = 10;
const SUCCESS_TOAST_MS = 4500;

function shouldLogCommsLoad(): boolean {
    if (typeof window === "undefined") return process.env.NODE_ENV !== "production";
    return process.env.NODE_ENV !== "production" || /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname);
}

function logCommsLoad(payload: Record<string, unknown>): void {
    if (!shouldLogCommsLoad()) return;
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("[perf.comms.load]", payload);
    }
}

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

const DRAWER_SECTION_HEADER_CLASS =
    "text-xs font-semibold tracking-wider text-[#59678b] border-b border-[#e6e8ec] pb-2 mb-4";

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
function userFriendlySendNote(processNote: string, channel?: string): string {
    const n = processNote.trim().toLowerCase();
    const queued =
        !n ||
        n.includes("unset") ||
        n.includes("queued until cron") ||
        n.includes("stays queued");
    const noun = channel === "sms" ? "SMS" : channel === "email" ? "Email" : "Message";
    if (queued) return `${noun} queued for delivery.`;
    if (n.includes("dispatched") || n.includes("backend process trigger")) return `${noun} sent.`;
    return `${noun} queued for delivery.`;
}

function channelFacetLabel(channel: string | undefined | null): string {
    const c = (channel ?? "").trim().toLowerCase();
    if (c === "email") return "Email";
    if (c === "sms") return "SMS";
    if (c === "in_app" || c === "in-app") return "In-app";
    return c ? c : "—";
}

function communicationMessageInstant(m: MsgRow): string | null | undefined {
    const s = m.sent_at ?? m.created_at ?? null;
    return s && String(s).trim() ? s : null;
}

/** Canonical threads + messages + drawer composer (Cards 16–17, 26–29). */
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

    const [msgs, setMsgs] = useState<MsgRowWithThread[]>([]);
    const [msgErr, setMsgErr] = useState<string | null>(null);
    const [loadingMsgs, setLoadingMsgs] = useState(false);

    /** All | Email | SMS — filters merged feed + composer. */
    const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
    /** When view is "all", which channel to use for send UI. */
    const [allComposerMode, setAllComposerMode] = useState<"email" | "sms">("email");
    /** When multiple threads: merged (default) or isolate one thread's messages. */
    const [threadScope, setThreadScope] = useState<"merged" | string>("merged");

    const conversationScrollRef = useRef<HTMLDivElement>(null);

    const composerEntity =
        apiEntityType === "opportunities" || apiEntityType === "jobs" ? apiEntityType : null;
    const showDrawerComposerChrome = !!(embedded && composerEntity);

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
    const smsOutboundReady =
        channelsAvailable.includes("sms") && !bindingsErr && !loadingBindings;

    const effectiveComposer = useMemo((): "email" | "sms" => {
        if (viewFilter === "all") return allComposerMode;
        return viewFilter === "email" ? "email" : "sms";
    }, [viewFilter, allComposerMode]);

    useEffect(() => {
        setThreads([]);
        setThrErr(null);
        setLoadingThreads(false);
        setMsgs([]);
        setMsgErr(null);
        setLoadingMsgs(false);
        setViewFilter("all");
        setAllComposerMode("email");
        setThreadScope("merged");
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
        setMsgs([]);
        setMsgErr(null);
    }, [active]);

    /** Fetches run only while `active`. */
    const dataLayerActive = active;

    /** When recipients or effective composer changes — eligible selection only (person-first per channel). */
    useEffect(() => {
        if (!recipients.length) {
            setSelectedRecipientIds(new Set());
            return;
        }
        const eligible =
            effectiveComposer === "email"
                ? recipients.filter((r) => !!r.email)
                : recipients.filter((r) => !!r.phone);
        if (!eligible.length) {
            setSelectedRecipientIds(new Set());
            return;
        }
        setSelectedRecipientIds((prev) => {
            const kept = new Set([...prev].filter((id) => eligible.some((r) => r.person_id === id)));
            if (kept.size > 0) return kept;
            const sug = eligible.filter((r) => r.is_suggested_default).map((r) => r.person_id);
            const pick =
                sug.length > 0
                    ? sug
                    : eligible[0]?.person_id
                      ? [eligible[0].person_id]
                      : [];
            return new Set(pick);
        });
    }, [recipients, effectiveComposer]);

    const filteredThreadsByView = useMemo(() => {
        return threads.filter((t) => {
            const ch = (t.channel ?? "").trim().toLowerCase();
            if (viewFilter === "all") return true;
            return ch === viewFilter;
        });
    }, [threads, viewFilter]);

    /** Switching channel view resets scope so we never point at a hidden thread. */
    useEffect(() => {
        setThreadScope("merged");
    }, [viewFilter]);

    /** If a scoped thread id vanished (filter/refresh), fall back to merged. */
    useEffect(() => {
        if (threadScope === "merged") return;
        if (!filteredThreadsByView.some((t) => t.id === threadScope)) {
            setThreadScope("merged");
        }
    }, [filteredThreadsByView, threadScope]);

    const loadThreads = useCallback(async () => {
        setThrErr(null);
        const peek = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);

        const applyThreadRowsFromPrefetch = (tRaw: unknown, loadEvent: Record<string, unknown>) => {
            logCommsLoad({
                kind: "threads",
                entity_type: apiEntityType,
                entity_id: entityId,
                count: Array.isArray(tRaw) ? tRaw.length : 0,
                ...loadEvent,
            });
            const tList = Array.isArray(tRaw) ? (tRaw as ThreadRow[]) : [];
            setThreads(tList);
            markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "threads");
            setLoadingThreads(false);
        };

        const tsnap = peek?.threads_snapshot;
        if (tsnap) {
            if (tsnap.error) {
                setThrErr(tsnap.error);
                setThreads([]);
                markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "threads");
                setLoadingThreads(false);
                return;
            }
            applyThreadRowsFromPrefetch(tsnap.threads, { event: "prefetch_reused", path: "snapshot" });
            return;
        }

        setLoadingThreads(true);
        try {
            if (peek?.threads) {
                try {
                    const pr = await peek.threads;
                    if (pr.error) throw new Error(pr.error);
                    applyThreadRowsFromPrefetch(pr.threads, { event: "prefetch_reused", path: "promise" });
                    return;
                } catch (e) {
                    if (e instanceof Error && e.name === "AbortError") {
                        setLoadingThreads(false);
                        return;
                    }
                    throw e;
                }
            }
            const peekLate = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);
            const lateSnap = peekLate?.threads_snapshot;
            if (lateSnap && !lateSnap.error) {
                applyThreadRowsFromPrefetch(lateSnap.threads, {
                    event: "duplicate_prevented",
                    detail: "late_snapshot_before_network",
                    path: "snapshot",
                });
                return;
            }
            if (lateSnap?.error) {
                setThrErr(lateSnap.error);
                setThreads([]);
                markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "threads");
                setLoadingThreads(false);
                return;
            }

            logCommsLoad({
                event: "network_fallback",
                kind: "threads",
                entity_type: apiEntityType,
                entity_id: entityId,
            });
            const qs = new URLSearchParams({ entity_type: apiEntityType, entity_id: entityId, limit: "40" });
            const r = await fetch(`/api/admin/communications/threads?${qs.toString()}`, { credentials: "include" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
            const t = Array.isArray((j as { threads?: ThreadRow[] }).threads)
                ? (j as { threads: ThreadRow[] }).threads
                : [];
            setThreads(t);
        } catch (e) {
            setThrErr(e instanceof Error ? e.message : "Failed to load threads");
            setThreads([]);
        } finally {
            setLoadingThreads(false);
        }
    }, [apiEntityType, entityId]);

    const loadConversationMessages = useCallback(async () => {
        if (!dataLayerActive) return;
        const scopeList =
            threadScope === "merged"
                ? filteredThreadsByView.slice(0, MAX_MERGE_THREADS)
                : filteredThreadsByView.filter((t) => t.id === threadScope);
        if (scopeList.length === 0) {
            setMsgs([]);
            setMsgErr(null);
            return;
        }
        setLoadingMsgs(true);
        setMsgErr(null);
        try {
            const batches = await Promise.all(
                scopeList.map(async (th) => {
                    const r = await fetch(
                        `/api/admin/communications/threads/${encodeURIComponent(th.id)}/messages?limit=${MESSAGES_PER_THREAD_LIMIT}`,
                        { credentials: "include" },
                    );
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                    const raw = Array.isArray((j as { messages?: MsgRow[] }).messages)
                        ? (j as { messages: MsgRow[] }).messages
                        : [];
                    return raw.map((m) => ({ ...m, _thread_id: th.id }) as MsgRowWithThread);
                }),
            );
            let merged = batches.flat();
            merged.sort((a, b) => {
                const ta = Date.parse(String(a.created_at ?? a.sent_at ?? 0));
                const tb = Date.parse(String(b.created_at ?? b.sent_at ?? 0));
                return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
            });
            const cap = 200;
            if (merged.length > cap) merged = merged.slice(-cap);
            setMsgs(merged);
        } catch (e) {
            setMsgErr(e instanceof Error ? e.message : "Failed to load messages");
            setMsgs([]);
        } finally {
            setLoadingMsgs(false);
        }
    }, [dataLayerActive, filteredThreadsByView, threadScope]);

    useEffect(() => {
        if (!dataLayerActive) return;
        void loadConversationMessages();
    }, [dataLayerActive, loadConversationMessages]);

    useLayoutEffect(() => {
        const el = conversationScrollRef.current;
        if (!el || loadingMsgs) return;
        el.scrollTop = el.scrollHeight;
    }, [msgs, loadingMsgs]);

    useEffect(() => {
        if (!sendOkNote) return;
        const id = window.setTimeout(() => setSendOkNote(null), SUCCESS_TOAST_MS);
        return () => window.clearTimeout(id);
    }, [sendOkNote]);

    useEffect(() => {
        if (!dataLayerActive) return;
        void loadThreads();
    }, [dataLayerActive, loadThreads]);

    useEffect(() => {
        if (!dataLayerActive || !showDrawerComposerChrome || !composerEntity) return;

        let cancelled = false;
        (async () => {
            const peekB = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);

            const applyBindingsPayload = (pb: { channels: string[]; error: string | null }, loadEvent: Record<string, unknown>) => {
                if (!cancelled) {
                    logCommsLoad({
                        kind: "bindings",
                        entity_type: apiEntityType,
                        entity_id: entityId,
                        channel_count: Array.isArray(pb.channels) ? pb.channels.length : 0,
                        error: pb.error ?? null,
                        ...loadEvent,
                    });
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
                applyBindingsPayload(bsnap, { event: "prefetch_reused", path: "snapshot" });
                return;
            }

            setLoadingBindings(true);
            setBindingsErr(null);
            try {
                if (peekB?.bindings) {
                    try {
                        const pb = await peekB.bindings;
                        if (cancelled) return;
                        applyBindingsPayload(pb, { event: "prefetch_reused", path: "promise" });
                        return;
                    } catch (e) {
                        if (e instanceof Error && e.name === "AbortError") {
                            if (!cancelled) setLoadingBindings(false);
                            return;
                        }
                        throw e;
                    }
                }
                const peekLate = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);
                const lateSnap = peekLate?.bindings_snapshot;
                if (lateSnap) {
                    if (cancelled) return;
                    applyBindingsPayload(lateSnap, {
                        event: "duplicate_prevented",
                        detail: "late_snapshot_before_network",
                        path: "snapshot",
                    });
                    return;
                }

                const r = await fetch(`/api/admin/communications/bindings`, { credentials: "include" });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                const ch = (j as { channels_available?: string[] }).channels_available;
                const pb = {
                    channels: Array.isArray(ch) ? ch : [],
                    error: null as string | null,
                };
                if (!cancelled) applyBindingsPayload(pb, { event: "network_fallback", path: "direct" });
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
    }, [dataLayerActive, showDrawerComposerChrome, composerEntity, apiEntityType, entityId]);

    useEffect(() => {
        if (!dataLayerActive || !showDrawerComposerChrome || !composerEntity || loadingBindings || (!emailOutboundReady && !smsOutboundReady)) {
            setRecipients([]);
            setRecipientsErr(null);
            setLoadingRecipients(false);
            return;
        }

        let cancelled = false;
        (async () => {
            const peekR = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);

            const applyRecipientsPayload = (pr: { recipients: unknown[]; error: string | null }, loadEvent: Record<string, unknown>) => {
                if (cancelled) return;
                const list = Array.isArray(pr.recipients) ? pr.recipients : [];
                logCommsLoad({
                    kind: "recipients",
                    entity_type: apiEntityType,
                    entity_id: entityId,
                    recipients_count: list.length,
                    error: pr.error ?? null,
                    ...loadEvent,
                });
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
                applyRecipientsPayload(rsnap, { event: "prefetch_reused", path: "snapshot" });
                return;
            }

            setLoadingRecipients(true);
            setRecipientsErr(null);
            try {
                if (peekR?.recipients) {
                    try {
                        const pr = await peekR.recipients;
                        if (cancelled) return;
                        applyRecipientsPayload(pr, { event: "prefetch_reused", path: "promise" });
                        return;
                    } catch (e) {
                        if (e instanceof Error && e.name === "AbortError") {
                            if (!cancelled) setLoadingRecipients(false);
                            return;
                        }
                        throw e;
                    }
                }
                const peekLate = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);
                const lateSnap = peekLate?.recipients_snapshot;
                if (lateSnap) {
                    if (cancelled) return;
                    applyRecipientsPayload(lateSnap, {
                        event: "duplicate_prevented",
                        detail: "late_snapshot_before_network",
                        path: "snapshot",
                    });
                    return;
                }

                const qs = new URLSearchParams({
                    entity_type: composerEntity,
                    entity_id: entityId,
                });
                const r = await fetch(`/api/admin/communications/drawer-recipients?${qs}`, { credentials: "include" });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                const list = (j as { recipients?: DrawerRecipient[] }).recipients;
                if (!cancelled) {
                    applyRecipientsPayload(
                        {
                            recipients: Array.isArray(list) ? list : [],
                            error: null,
                        },
                        { event: "network_fallback", path: "direct" },
                    );
                }
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
        showDrawerComposerChrome,
        composerEntity,
        apiEntityType,
        entityId,
        emailOutboundReady,
        smsOutboundReady,
        loadingBindings,
    ]);

    const toggleRecipient = (personId: string) => {
        setSelectedRecipientIds((prev) => {
            const n = new Set(prev);
            if (n.has(personId)) n.delete(personId);
            else n.add(personId);
            return n;
        });
    };

    const sendFromComposer = async () => {
        if (!composerEntity || selectedRecipientIds.size === 0 || !composerBody.trim()) return;
        if (effectiveComposer === "email" && !emailOutboundReady) return;
        if (effectiveComposer === "sms" && !smsOutboundReady) return;

        const channelSent = effectiveComposer === "sms" ? "sms" : "email";
        setSendBusy(true);
        setSendErr(null);
        setSendOkNote(null);
        try {
            let lastNote = "";
            for (const personId of selectedRecipientIds) {
                const payload: Record<string, unknown> = {
                    entity_type: composerEntity,
                    entity_id: entityId,
                    channel: channelSent,
                    body: composerBody.trim(),
                    recipient_person_id: personId,
                };
                if (effectiveComposer === "email") {
                    payload.subject = composerSubject.trim();
                }
                const res = await fetch("/api/admin/communications/send", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
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
            setSendOkNote(userFriendlySendNote(lastNote, channelSent === "sms" ? "sms" : "email"));
            setComposerSubject("");
            setComposerBody("");
            invalidateCommunicationsDrawerPrefetch(apiEntityType, entityId);
            await loadThreads();
            await loadConversationMessages();
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
        } finally {
            setSendBusy(false);
        }
    };

    if (!active) return null;

    const recipientsForComposer =
        effectiveComposer === "email"
            ? recipients.filter((r) => !!r.email)
            : recipients.filter((r) => !!r.phone);

    const onViewFilter = (v: ViewFilter) => {
        setViewFilter(v);
        if (v === "email") setAllComposerMode("email");
        if (v === "sms") setAllComposerMode("sms");
    };

    const filterTabCls = (v: ViewFilter) =>
        `rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
            viewFilter === v
                ? "bg-alloy-midnight text-white shadow-sm"
                : "border border-alloy-stone/22 bg-white text-alloy-forge hover:bg-alloy-stone/[0.06]"
        }`;

    const emptyThreadsClass = embedded ? "text-[12px] text-alloy-midnight/60" : "text-sm text-alloy-midnight/60";
    const emptyThreadsBody = (
        <div className={emptyThreadsClass}>
            <p className="font-medium text-alloy-midnight/75">No communications yet</p>
            <p className="mt-1 leading-relaxed">Send an email or SMS below once outbound is configured.</p>
        </div>
    );

    const composerReady =
        (effectiveComposer === "email" && emailOutboundReady) || (effectiveComposer === "sms" && smsOutboundReady);

    const composerBlockInner =
        showDrawerComposerChrome && composerEntity ? (
            <div className="rounded-xl border border-alloy-stone/15 bg-white/[0.97] px-2.5 py-2.5 shadow-sm">
                <div className={COMPOSER_LABEL}>Compose</div>
                {loadingBindings ? (
                    <div className="space-y-1.5 py-1" aria-busy="true">
                        <div className="skeleton-pulse h-3 w-[min(92%,240px)] rounded bg-alloy-stone/14" aria-hidden />
                        <div className="skeleton-pulse h-9 w-full rounded-md bg-alloy-stone/12" aria-hidden />
                    </div>
                ) : bindingsErr ? (
                    <p className="text-[11px] text-alloy-ember">{bindingsErr}</p>
                ) : (
                    <div className="mt-2 space-y-2.5">
                        {viewFilter === "all" ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    Send as
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAllComposerMode("email")}
                                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                        allComposerMode === "email"
                                            ? "bg-alloy-midnight text-white"
                                            : "border border-alloy-stone/22 bg-white text-alloy-forge"
                                    }`}
                                >
                                    Email
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAllComposerMode("sms")}
                                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                        allComposerMode === "sms"
                                            ? "bg-alloy-midnight text-white"
                                            : "border border-alloy-stone/22 bg-white text-alloy-forge"
                                    }`}
                                >
                                    SMS
                                </button>
                            </div>
                        ) : null}

                        {effectiveComposer === "email" && !emailOutboundReady ? (
                            <p className="text-[11px] leading-snug text-alloy-midnight/65">
                                Email outbound is not configured — add an active Resend binding.
                            </p>
                        ) : null}

                        {effectiveComposer === "sms" && !smsOutboundReady ? (
                            <p className="text-[11px] leading-snug text-alloy-midnight/65">
                                SMS outbound is not available — add an active SMS binding with secret_ref (Twilio credentials).
                            </p>
                        ) : null}

                        {composerReady ? (
                            loadingRecipients ? (
                                <div className="space-y-1.5 py-1" aria-busy="true">
                                    <div className="skeleton-pulse h-3 w-[min(88%,220px)] rounded bg-alloy-stone/14" aria-hidden />
                                    <div className="skeleton-pulse h-16 w-full rounded-md bg-alloy-stone/12" aria-hidden />
                                </div>
                            ) : recipientsErr ? (
                                <p className="text-[11px] text-alloy-ember">{recipientsErr}</p>
                            ) : recipientsForComposer.length === 0 ? (
                                <p className="text-[11px] text-alloy-midnight/65">
                                    {effectiveComposer === "email"
                                        ? "No people with email on this record."
                                        : "No people with a mobile number on this record."}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Recipients
                                    </p>
                                    <div className="grid max-h-[9.5rem] gap-1.5 overflow-y-auto pr-0.5">
                                        {recipientsForComposer.map((r) => {
                                            const on = selectedRecipientIds.has(r.person_id);
                                            return (
                                                <button
                                                    key={r.person_id}
                                                    type="button"
                                                    aria-pressed={on}
                                                    disabled={sendBusy}
                                                    onClick={() => toggleRecipient(r.person_id)}
                                                    className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                                                        on
                                                            ? "border-alloy-midnight bg-alloy-midnight/[0.07] ring-1 ring-alloy-midnight/20"
                                                            : "border-alloy-stone/18 bg-white hover:border-alloy-stone/30"
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <span className="text-[12px] font-semibold text-alloy-midnight">
                                                            {r.display_name}
                                                        </span>
                                                        {on ? (
                                                            <span className="shrink-0 text-[10px] font-medium text-alloy-forge/75">
                                                                On
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <div className="mt-0.5 break-all text-[11px] text-alloy-midnight/65">
                                                        {effectiveComposer === "email" ? r.email ?? "—" : r.phone ?? "—"}
                                                    </div>
                                                    {r.relationship_hint ? (
                                                        <div className="mt-0.5 text-[10px] text-alloy-midnight/45">
                                                            {r.relationship_hint}
                                                        </div>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {effectiveComposer === "email" ? (
                                        <label className="block space-y-0.5">
                                            <span className="text-[11px] font-medium text-alloy-midnight/75">Subject</span>
                                            <input
                                                type="text"
                                                value={composerSubject}
                                                onChange={(e) => setComposerSubject(e.target.value)}
                                                disabled={sendBusy}
                                                placeholder="Optional"
                                                className="w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                                                autoComplete="off"
                                            />
                                        </label>
                                    ) : null}
                                    <label className="block space-y-0.5">
                                        <span className="text-[11px] font-medium text-alloy-midnight/75">
                                            {effectiveComposer === "email" ? "Email body" : "Message"}
                                        </span>
                                        <textarea
                                            value={composerBody}
                                            onChange={(e) => setComposerBody(e.target.value)}
                                            disabled={sendBusy}
                                            rows={3}
                                            placeholder={
                                                effectiveComposer === "sms" ? "Write SMS…" : "Write email…"
                                            }
                                            className="w-full resize-none rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] leading-snug text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                                            aria-label={effectiveComposer === "email" ? "Email body" : "SMS message"}
                                        />
                                    </label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void sendFromComposer()}
                                            disabled={
                                                sendBusy ||
                                                selectedRecipientIds.size === 0 ||
                                                !composerBody.trim() ||
                                                (effectiveComposer === "email" && !emailOutboundReady) ||
                                                (effectiveComposer === "sms" && !smsOutboundReady)
                                            }
                                            className="rounded-lg border border-alloy-midnight/20 bg-alloy-midnight px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-midnight/90 disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                            {sendBusy
                                                ? "Sending…"
                                                : effectiveComposer === "email"
                                                  ? "Send email"
                                                  : "Send SMS"}
                                        </button>
                                    </div>
                                    {sendErr ? <p className="text-[11px] text-alloy-ember">{sendErr}</p> : null}
                                    {sendOkNote ? <p className="text-[11px] text-green-800/85">{sendOkNote}</p> : null}
                                </div>
                            )
                        ) : null}
                    </div>
                )}
            </div>
        ) : null;

    const headerTitle = !embedded ? (
        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Communications</h3>
    ) : null;

    const description = !embedded ? (
        <p className="text-sm text-alloy-midnight/65 -mt-2 mb-1.5">
            Recent messages and outbound compose for this record.
        </p>
    ) : null;

    return (
        <div className={`flex min-h-0 min-w-0 flex-col ${className}`}>
            <section className="flex min-h-0 flex-col gap-2">
                {headerTitle}
                {description}

                {loadingThreads ? (
                    <CommsQuietSkeletonLines dense={Boolean(embedded)} />
                ) : thrErr ? (
                    <p className="text-sm text-alloy-ember">{thrErr}</p>
                ) : threads.length === 0 ? (
                    emptyThreadsBody
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Message channels">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={viewFilter === "all"}
                                className={filterTabCls("all")}
                                onClick={() => onViewFilter("all")}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={viewFilter === "email"}
                                className={filterTabCls("email")}
                                onClick={() => onViewFilter("email")}
                            >
                                Email
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={viewFilter === "sms"}
                                className={filterTabCls("sms")}
                                onClick={() => onViewFilter("sms")}
                            >
                                SMS
                            </button>
                        </div>

                        {filteredThreadsByView.length > 1 ? (
                            <label className="flex flex-wrap items-center gap-2 text-[11px] text-alloy-midnight/70">
                                <span className="shrink-0 font-medium text-alloy-midnight/55">Conversation</span>
                                <select
                                    value={threadScope}
                                    onChange={(e) =>
                                        setThreadScope(e.target.value === "merged" ? "merged" : e.target.value)
                                    }
                                    className="min-w-0 max-w-full flex-1 rounded-lg border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-forge shadow-sm"
                                >
                                    <option value="merged">All (merged timeline)</option>
                                    {filteredThreadsByView.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {channelFacetLabel(t.channel)} — {t.recipient_key || t.id.slice(0, 8)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}

                        <div
                            ref={conversationScrollRef}
                            className="comms-drawer-conversation flex max-h-[min(300px,42vh)] min-h-[132px] flex-col overflow-y-auto rounded-xl border border-alloy-stone/15 bg-[linear-gradient(180deg,rgba(246,247,249,0.9)_0%,#ffffff_100%)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
                        >
                            {loadingMsgs ? (
                                <div className="flex flex-1 flex-col justify-center gap-2 py-4" aria-busy="true">
                                    <div className="skeleton-pulse h-12 w-[88%] rounded-2xl bg-alloy-stone/12" />
                                    <div className="skeleton-pulse ml-auto h-12 w-[78%] rounded-2xl bg-alloy-stone/10" />
                                    <div className="skeleton-pulse h-10 w-[70%] rounded-2xl bg-alloy-stone/11" />
                                </div>
                            ) : msgErr ? (
                                <p className="text-sm text-alloy-ember">{msgErr}</p>
                            ) : msgs.length === 0 ? (
                                <p className="py-6 text-center text-[13px] text-alloy-midnight/58">
                                    No messages in this view yet.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-0.5">
                                    {msgs.map((m) => {
                                        const inbound = (m.direction ?? "").toLowerCase() === "inbound";
                                        const pres = deliveryStatePresentation(mapToDeliveryState(m));
                                        const fail = pres.highlightFailure;
                                        const msgWhen = communicationMessageInstant(m);
                                        return (
                                            <li
                                                key={`${m.id}-${m._thread_id ?? ""}`}
                                                className={`flex w-full ${inbound ? "justify-start" : "justify-end"}`}
                                            >
                                                <div
                                                    className={`max-w-[min(100%,19.5rem)] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
                                                        inbound
                                                            ? "rounded-tl-sm border border-alloy-stone/16 bg-white text-alloy-forge"
                                                            : `rounded-tr-sm text-white ${
                                                                  fail
                                                                      ? "border border-alloy-ember/40 bg-alloy-ember/[0.92]"
                                                                      : "bg-alloy-midnight/[0.92]"
                                                              }`
                                                    }`}
                                                >
                                                    <div
                                                        className={`mb-1 flex flex-wrap items-baseline gap-x-1.5 text-[10px] font-medium uppercase tracking-wide ${
                                                            inbound ? "text-alloy-midnight/42" : "text-white/58"
                                                        }`}
                                                    >
                                                        <span>{channelFacetLabel(m.channel)}</span>
                                                        <span className="opacity-50">·</span>
                                                        <span
                                                            className={
                                                                inbound
                                                                    ? fail
                                                                        ? "text-alloy-ember"
                                                                        : "text-alloy-forge/90"
                                                                    : ""
                                                            }
                                                        >
                                                            {pres.label}
                                                        </span>
                                                        {msgWhen ? (
                                                            <span
                                                                className={`ml-auto tabular-nums normal-case font-normal opacity-80 ${
                                                                    inbound ? "" : "text-white/70"
                                                                }`}
                                                            >
                                                                {formatDateTimeForUserDisplay(msgWhen, viewerTz)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {pres.subtext ? (
                                                        <p
                                                            className={`mb-1 text-[10px] leading-snug ${
                                                                inbound ? "text-alloy-midnight/48" : "text-white/55"
                                                            }`}
                                                        >
                                                            {pres.subtext}
                                                        </p>
                                                    ) : null}
                                                    {(m.from_address || m.to_address) && (
                                                        <p
                                                            className={`mb-1.5 text-[11px] ${
                                                                inbound ? "text-alloy-forge/65" : "text-white/70"
                                                            }`}
                                                        >
                                                            {m.from_address ? <span>From {m.from_address}</span> : null}
                                                            {m.from_address && m.to_address ? " · " : null}
                                                            {m.to_address ? <span>To {m.to_address}</span> : null}
                                                        </p>
                                                    )}
                                                    {m.body ? (
                                                        <div
                                                            className={`whitespace-pre-wrap ${
                                                                inbound ? "text-[13px] text-alloy-forge/95" : "text-[13px] text-white/95"
                                                            }`}
                                                        >
                                                            {m.body}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {composerBlockInner}
                    </>
                )}
            </section>
        </div>
    );
}