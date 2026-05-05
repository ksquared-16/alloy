"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import {
    takeCommunicationsDrawerPrefetch,
    markCommunicationsDrawerPrefetchConsumed,
    invalidateCommunicationsDrawerPrefetch,
} from "@/lib/admin/communications/communicationsDrawerPrefetch";
import type { CommunicationMessage, DeliveryState } from "@/lib/communications/deliveryStateAdapter";
import { deliveryStatePresentation, mapToDeliveryState } from "@/lib/communications/deliveryStateAdapter";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import type { OpportunityComposeContext } from "@/lib/communications/opportunityComposeTemplates";

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
    /** When from messages API with `include_viewer_read=1`; inbound false until read. */
    viewer_has_read?: boolean;
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
/** Default visible rows in the conversation strip (rest behind “View older messages”). */
const DEFAULT_VISIBLE_MESSAGE_COUNT = 3;
/** Fixed scroll area height when composer is stacked under the thread (narrow / non-split). */
const CONVERSATION_SCROLL_HEIGHT_CLASS_STACKED =
    "h-[min(13rem,34vh)] max-h-[min(20rem,44vh)] shrink-0 min-h-[10.5rem]";
/** Taller thread column when composer sits beside recipients (wide). */
const CONVERSATION_SCROLL_CLASS_SPLIT =
    "min-h-[11rem] flex-1 max-h-[min(22rem,50vh)] shrink-0 overflow-x-hidden overflow-y-auto px-2 py-1 lg:min-h-[14rem] lg:max-h-[min(28rem,56vh)]";

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
    /** Opportunity-only: lightweight starter templates when there is no message history yet. */
    opportunityComposeContext?: OpportunityComposeContext | null;
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

/** Compact bubble headline; keep delivery truth in a muted subline where needed. */
function bubbleStatusLine(m: MsgRow): { headline: string; sub?: string } {
    const state = mapToDeliveryState(m);
    const pres = deliveryStatePresentation(state);
    switch (state as DeliveryState) {
        case "inbound_received":
            return { headline: "Received" };
        case "failed":
        case "bounced":
            return { headline: "Failed", sub: pres.subtext };
        case "queued":
            return { headline: "Queued", sub: pres.subtext };
        case "delivered":
            return { headline: "Delivered" };
        case "provider_accepted":
            return { headline: "Sent", sub: "Provider accepted" };
        case "sent_to_provider":
            return { headline: "Sent", sub: pres.subtext };
        default:
            return { headline: pres.label, sub: pres.subtext };
    }
}

/** Display-only US-style phone; does not change stored values. */
function formatDisplayPhoneUs(raw: string | null | undefined): string {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
        const d = digits.slice(1);
        return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    const t = String(raw ?? "").trim();
    return t || "—";
}

function counterpartyLabel(
    m: MsgRow,
    inbound: boolean,
    lookup: { phoneToName: Map<string, string>; emailToName: Map<string, string> },
): { title: string; subtitle?: string } {
    const ch = (m.channel ?? "").trim().toLowerCase();
    const raw = String((inbound ? m.from_address : m.to_address) ?? "").trim();
    if (!raw) return { title: inbound ? "Sender" : "Recipient" };
    if (ch === "sms") {
        const k = normalizeRecipientKeySms(raw);
        const name = k ? lookup.phoneToName.get(k) : undefined;
        const disp = formatDisplayPhoneUs(raw);
        if (name) return { title: inbound ? `From ${name}` : `To ${name}`, subtitle: disp };
        return { title: inbound ? `From ${disp}` : `To ${disp}` };
    }
    if (ch === "email") {
        const ek = normalizeRecipientKeyEmail(raw);
        const name = lookup.emailToName.get(ek);
        if (name) return { title: inbound ? `From ${name}` : `To ${name}`, subtitle: raw };
        return { title: inbound ? `From ${raw}` : `To ${raw}` };
    }
    return { title: inbound ? `From ${raw}` : `To ${raw}` };
}

function messageBodyNeedsToggle(body: string | null | undefined): boolean {
    const t = String(body ?? "");
    if (t.length > 240) return true;
    return t.split("\n").length > 3;
}

function TruncatedMessageBody({
    messageId,
    body,
    expanded,
    onToggle,
    inbound,
}: {
    messageId: string;
    body: string;
    expanded: boolean;
    onToggle: (id: string) => void;
    inbound: boolean;
}) {
    const needsToggle = messageBodyNeedsToggle(body);
    const textCls = inbound ? "text-[13px] text-alloy-forge/95" : "text-[13px] text-white/95";
    const btnCls = inbound
        ? "mt-0.5 text-[11px] font-semibold text-alloy-blue hover:underline"
        : "mt-0.5 text-[11px] font-semibold text-white/85 hover:underline";

    if (!needsToggle) {
        return <div className={`whitespace-pre-wrap break-words ${textCls}`}>{body}</div>;
    }
    if (expanded) {
        return (
            <>
                <div className={`whitespace-pre-wrap break-words ${textCls}`}>{body}</div>
                <button type="button" className={btnCls} onClick={() => onToggle(messageId)}>
                    Show less
                </button>
            </>
        );
    }
    return (
        <>
            <div className={`line-clamp-3 whitespace-pre-wrap break-words ${textCls}`}>{body}</div>
            <button type="button" className={btnCls} onClick={() => onToggle(messageId)}>
                Show more
            </button>
        </>
    );
}

/** Canonical threads + messages + drawer composer (Cards 16–17, 26–29). */
export default function CommunicationsDrawerSection({
    apiEntityType,
    entityId,
    active = true,
    embedded = true,
    className = "",
    opportunityComposeContext: _opportunityComposeContext = null,
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

    const conversationScrollRef = useRef<HTMLDivElement>(null);
    const markedReadSubmittedRef = useRef<Set<string>>(new Set());

    const composerEntity =
        apiEntityType === "opportunities" || apiEntityType === "jobs" ? apiEntityType : null;
    const showDrawerComposerChrome = !!(embedded && composerEntity);

    const [channelsAvailable, setChannelsAvailable] = useState<string[]>([]);
    const [bindingsErr, setBindingsErr] = useState<string | null>(null);
    const [loadingBindings, setLoadingBindings] = useState(false);
    /** Bumped on visibility return so bindings refetch after org config changes in another tab. */
    const [bindingsRefreshGen, setBindingsRefreshGen] = useState(0);

    const [recipients, setRecipients] = useState<DrawerRecipient[]>([]);
    const [recipientsErr, setRecipientsErr] = useState<string | null>(null);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(() => new Set());

    const [composerSubject, setComposerSubject] = useState("");
    const [composerBody, setComposerBody] = useState("");
    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [sendOkNote, setSendOkNote] = useState<string | null>(null);

    /** When false, only the last {@link DEFAULT_VISIBLE_MESSAGE_COUNT} messages are listed (rest via “View older”). */
    const [showOlderMessages, setShowOlderMessages] = useState(false);
    const [expandedBodies, setExpandedBodies] = useState<Record<string, boolean>>({});

    const emailOutboundReady =
        channelsAvailable.includes("email") && !bindingsErr && !loadingBindings;
    const smsOutboundReady =
        channelsAvailable.includes("sms") && !bindingsErr && !loadingBindings;
    const anyOutboundReady = emailOutboundReady || smsOutboundReady;

    const effectiveComposer = useMemo((): "email" | "sms" => {
        if (viewFilter === "all") return allComposerMode;
        return viewFilter === "email" ? "email" : "sms";
    }, [viewFilter, allComposerMode]);

    /** Match message from/to addresses to drawer person rows (person-first; no contacts). */
    const addressDisplayNameLookup = useMemo(() => {
        const phoneToName = new Map<string, string>();
        const emailToName = new Map<string, string>();
        for (const r of recipients) {
            if (r.phone) {
                const k = normalizeRecipientKeySms(r.phone);
                if (k) phoneToName.set(k, r.display_name);
            }
            if (r.email) {
                emailToName.set(normalizeRecipientKeyEmail(r.email), r.display_name);
            }
        }
        return { phoneToName, emailToName };
    }, [recipients]);

    useEffect(() => {
        setThreads([]);
        setThrErr(null);
        setLoadingThreads(false);
        setMsgs([]);
        setMsgErr(null);
        setLoadingMsgs(false);
        setViewFilter("all");
        setAllComposerMode("email");
        setChannelsAvailable([]);
        setBindingsErr(null);
        setRecipients([]);
        setRecipientsErr(null);
        setSelectedRecipientIds(new Set());
        setComposerSubject("");
        setComposerBody("");
        setSendErr(null);
        setSendOkNote(null);
        setShowOlderMessages(false);
        setExpandedBodies({});
        markedReadSubmittedRef.current.clear();
        setBindingsRefreshGen(0);
    }, [entityId, apiEntityType]);

    /** When parent hides Communication (`active` false), drop thread detail state (no polling; next open is clean). */
    useEffect(() => {
        if (active) return;
        setMsgs([]);
        setMsgErr(null);
        setShowOlderMessages(false);
        setExpandedBodies({});
        markedReadSubmittedRef.current.clear();
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

    const displayedMsgs = useMemo(() => {
        if (showOlderMessages || msgs.length <= DEFAULT_VISIBLE_MESSAGE_COUNT) return msgs;
        return msgs.slice(-DEFAULT_VISIBLE_MESSAGE_COUNT);
    }, [msgs, showOlderMessages]);

    const hiddenOlderCount =
        msgs.length > DEFAULT_VISIBLE_MESSAGE_COUNT && !showOlderMessages
            ? msgs.length - DEFAULT_VISIBLE_MESSAGE_COUNT
            : 0;

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
        const scopeList = filteredThreadsByView.slice(0, MAX_MERGE_THREADS);
        if (scopeList.length === 0) {
            setMsgs([]);
            setMsgErr(null);
            setShowOlderMessages(false);
            setExpandedBodies({});
            return;
        }
        setLoadingMsgs(true);
        setMsgErr(null);
        try {
            const batches = await Promise.all(
                scopeList.map(async (th) => {
                    const r = await fetch(
                        `/api/admin/communications/threads/${encodeURIComponent(th.id)}/messages?limit=${MESSAGES_PER_THREAD_LIMIT}&include_viewer_read=1`,
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
            setShowOlderMessages(false);
            setExpandedBodies({});
        } catch (e) {
            setMsgErr(e instanceof Error ? e.message : "Failed to load messages");
            setMsgs([]);
            setShowOlderMessages(false);
            setExpandedBodies({});
        } finally {
            setLoadingMsgs(false);
        }
    }, [dataLayerActive, filteredThreadsByView]);

    useEffect(() => {
        if (!dataLayerActive) return;
        void loadConversationMessages();
    }, [dataLayerActive, loadConversationMessages]);

    useLayoutEffect(() => {
        const el = conversationScrollRef.current;
        if (!el || loadingMsgs) return;
        el.scrollTop = el.scrollHeight;
    }, [displayedMsgs, loadingMsgs, showOlderMessages]);

    useEffect(() => {
        if (!sendOkNote) return;
        const id = window.setTimeout(() => setSendOkNote(null), SUCCESS_TOAST_MS);
        return () => window.clearTimeout(id);
    }, [sendOkNote]);

    /** Mark inbound rows read for the current viewer after the thread is shown (per-user reads table). */
    useEffect(() => {
        if (!dataLayerActive || loadingMsgs) return;
        const inboundUnreadIds = msgs
            .filter((m) => (m.direction ?? "").toLowerCase() === "inbound" && m.viewer_has_read !== true)
            .map((m) => m.id)
            .filter((id) => id && !markedReadSubmittedRef.current.has(id));
        if (inboundUnreadIds.length === 0) return;
        const t = window.setTimeout(() => {
            void (async () => {
                try {
                    const res = await fetch("/api/admin/communications/messages/mark-read", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ message_ids: inboundUnreadIds }),
                    });
                    if (!res.ok) return;
                    inboundUnreadIds.forEach((id) => markedReadSubmittedRef.current.add(id));
                    setMsgs((prev) =>
                        prev.map((m) => (inboundUnreadIds.includes(m.id) ? { ...m, viewer_has_read: true } : m)),
                    );
                    window.dispatchEvent(new CustomEvent("alloy-comms-unread-refresh"));
                } catch {
                    /* ignore */
                }
            })();
        }, 550);
        return () => window.clearTimeout(t);
    }, [dataLayerActive, loadingMsgs, msgs]);

    useEffect(() => {
        if (!dataLayerActive) return;
        void loadThreads();
    }, [dataLayerActive, loadThreads]);

    useEffect(() => {
        if (!dataLayerActive || !showDrawerComposerChrome || !composerEntity) return;
        const onBecameVisible = () => {
            if (typeof document === "undefined" || document.visibilityState !== "visible") return;
            invalidateCommunicationsDrawerPrefetch(apiEntityType, entityId);
            setBindingsRefreshGen((g) => g + 1);
        };
        document.addEventListener("visibilitychange", onBecameVisible);
        return () => {
            document.removeEventListener("visibilitychange", onBecameVisible);
        };
    }, [dataLayerActive, showDrawerComposerChrome, composerEntity, apiEntityType, entityId]);

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
                if (bsnap.error) {
                    applyBindingsPayload(bsnap, { event: "prefetch_reused", path: "snapshot" });
                    return;
                }
                const hasOutbound =
                    bsnap.channels.includes("email") || bsnap.channels.includes("sms");
                if (hasOutbound) {
                    applyBindingsPayload(bsnap, { event: "prefetch_reused", path: "snapshot" });
                    return;
                }
                // Empty outbound snapshot (e.g. prefetch before credentials existed) — fetch fresh.
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
    }, [dataLayerActive, showDrawerComposerChrome, composerEntity, apiEntityType, entityId, bindingsRefreshGen]);

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
        const bodyTrim = composerBody.trim();
        const subjectTrim = composerSubject.trim();
        try {
            let lastNote = "";
            const optimisticRows: MsgRowWithThread[] = [];
            const nowIso = new Date().toISOString();
            for (const personId of selectedRecipientIds) {
                const payload: Record<string, unknown> = {
                    entity_type: composerEntity,
                    entity_id: entityId,
                    channel: channelSent,
                    body: bodyTrim,
                    recipient_person_id: personId,
                };
                if (effectiveComposer === "email") {
                    payload.subject = subjectTrim;
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
                const msgId = String((j as { communication_message_id?: string }).communication_message_id ?? "").trim();
                const threadId = String((j as { thread_id?: string }).thread_id ?? "").trim();
                const rec = recipients.find((r) => r.person_id === personId);
                const toAddr =
                    channelSent === "email"
                        ? (rec?.email ? String(rec.email).trim() : "")
                        : rec?.phone
                          ? normalizeRecipientKeySms(rec.phone)
                          : "";
                if (msgId && threadId) {
                    optimisticRows.push({
                        id: msgId,
                        _thread_id: threadId,
                        body: bodyTrim,
                        channel: channelSent,
                        direction: "outbound",
                        status: "queued",
                        created_at: nowIso,
                        sent_at: nowIso,
                        to_address: toAddr || null,
                        from_address: null,
                        provider_message_id: null,
                        metadata: { drawer_optimistic: true },
                        delivered_at: null,
                        viewer_has_read: true,
                    } as MsgRowWithThread);
                }
            }
            setSendOkNote(userFriendlySendNote(lastNote, channelSent === "sms" ? "sms" : "email"));
            setComposerSubject("");
            setComposerBody("");
            invalidateCommunicationsDrawerPrefetch(apiEntityType, entityId);
            if (optimisticRows.length > 0) {
                setMsgs((prev) => {
                    const byId = new Set(prev.map((x) => x.id));
                    const merged = [...prev];
                    for (const row of optimisticRows) {
                        if (!byId.has(row.id)) {
                            merged.push(row);
                            byId.add(row.id);
                        }
                    }
                    merged.sort((a, b) => {
                        const ta = Date.parse(String(a.created_at ?? a.sent_at ?? 0));
                        const tb = Date.parse(String(b.created_at ?? b.sent_at ?? 0));
                        return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
                    });
                    return merged;
                });
                setShowOlderMessages(false);
            }
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
        } finally {
            setSendBusy(false);
        }
    };

    const recipientsForComposer =
        effectiveComposer === "email"
            ? recipients.filter((r) => !!r.email)
            : recipients.filter((r) => !!r.phone);

    const onViewFilter = (v: ViewFilter) => {
        setViewFilter(v);
        if (v === "email") setAllComposerMode("email");
        if (v === "sms") setAllComposerMode("sms");
        setShowOlderMessages(false);
        setExpandedBodies({});
    };

    const toggleBodyExpand = (messageId: string) => {
        setExpandedBodies((prev) => ({ ...prev, [messageId]: !prev[messageId] }));
    };

    const filterTabCls = (v: ViewFilter) =>
        `rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
            viewFilter === v
                ? "bg-alloy-midnight text-white shadow-sm"
                : "border border-alloy-stone/22 bg-white text-alloy-forge hover:bg-alloy-stone/[0.06]"
        }`;

    const emptyThreadsClass = embedded ? "text-[12px] text-alloy-midnight/60" : "text-sm text-alloy-midnight/60";
    const emptyThreadsBody = useMemo(() => {
        if (bindingsErr) {
            return (
                <div className={emptyThreadsClass}>
                    <p className="font-medium text-alloy-midnight/75">Communications unavailable</p>
                    <p className="mt-1 leading-relaxed">{bindingsErr}</p>
                </div>
            );
        }
        if (loadingBindings) {
            return (
                <div className={emptyThreadsClass}>
                    <p className="font-medium text-alloy-midnight/75">Loading communication setup…</p>
                </div>
            );
        }
        const outboundConfigured = channelsAvailable.length > 0;
        if (!outboundConfigured) {
            return (
                <div className={emptyThreadsClass}>
                    <p className="font-medium text-alloy-midnight/75">Outbound messaging is not configured yet.</p>
                    <p className="mt-1 leading-relaxed">
                        Add an active outbound provider binding for this org (Resend for email; Twilio-backed{" "}
                        <code className="rounded bg-alloy-stone/10 px-0.5 text-[10px]">communication_provider_bindings</code> row for
                        SMS). Until at least one channel is active, message history stays empty here.
                    </p>
                </div>
            );
        }
        const hasAnyRecipient = recipients.some((r) => !!(r.email?.trim() || r.phone?.trim()));
        if (!loadingRecipients && !recipientsErr && showDrawerComposerChrome && composerEntity && !hasAnyRecipient) {
            return (
                <div className={emptyThreadsClass}>
                    <p className="font-medium text-alloy-midnight/75">
                        No eligible email or SMS recipients found for this record.
                    </p>
                </div>
            );
        }
        if (recipientsErr) {
            return (
                <div className={emptyThreadsClass}>
                    <p className="font-medium text-alloy-midnight/75">Recipients unavailable</p>
                    <p className="mt-1 leading-relaxed">{recipientsErr}</p>
                </div>
            );
        }
        return (
            <div className={emptyThreadsClass}>
                <p className="font-medium text-alloy-midnight/75">No communications yet</p>
                <p className="mt-1 leading-relaxed">Start the conversation below.</p>
            </div>
        );
    }, [
        bindingsErr,
        loadingBindings,
        channelsAvailable.length,
        recipients,
        loadingRecipients,
        recipientsErr,
        showDrawerComposerChrome,
        composerEntity,
        emptyThreadsClass,
    ]);

    if (!active) return null;

    const composerReady =
        (effectiveComposer === "email" && emailOutboundReady) || (effectiveComposer === "sms" && smsOutboundReady);

    const sendDisabledReason: string | null = (() => {
        if (sendBusy) return null;
        if (!composerReady) {
            return effectiveComposer === "email"
                ? "Configure an active email (Resend) binding to send."
                : "Configure an active SMS binding to send.";
        }
        if (recipientsForComposer.length === 0) {
            return effectiveComposer === "email"
                ? "No linked person has an email address for this channel."
                : "No linked person has a mobile number for SMS.";
        }
        if (selectedRecipientIds.size === 0) return "Select at least one recipient.";
        if (!composerBody.trim()) return "Enter a message to send.";
        return null;
    })();

    const composerRecipientsBlock: ReactNode =
        anyOutboundReady && showDrawerComposerChrome && composerEntity ? (
            loadingRecipients ? (
                <div className="flex flex-wrap gap-1 py-0.5" aria-busy="true">
                    <div className="skeleton-pulse h-7 w-24 rounded-full bg-alloy-stone/12" aria-hidden />
                    <div className="skeleton-pulse h-7 w-28 rounded-full bg-alloy-stone/11" aria-hidden />
                </div>
            ) : recipientsErr ? (
                <p className="text-[11px] text-alloy-ember">{recipientsErr}</p>
            ) : recipientsForComposer.length === 0 ? (
                <p className="text-[10px] text-alloy-midnight/58">
                    {effectiveComposer === "email"
                        ? "No linked people with email."
                        : "No linked people with a mobile number for SMS."}
                </p>
            ) : (
                <div className="flex max-h-[3.75rem] flex-wrap gap-0.5 overflow-y-auto pr-0.5">
                    {recipientsForComposer.map((r) => {
                        const on = selectedRecipientIds.has(r.person_id);
                        const addr =
                            effectiveComposer === "email" ? r.email ?? "" : formatDisplayPhoneUs(r.phone ?? "");
                        return (
                            <button
                                key={r.person_id}
                                type="button"
                                aria-pressed={on}
                                disabled={sendBusy}
                                onClick={() => toggleRecipient(r.person_id)}
                                title={r.relationship_hint ?? undefined}
                                className={`max-w-full rounded-full border px-1.5 py-0.5 text-left text-[10px] leading-tight transition ${
                                    on
                                        ? "border-alloy-midnight bg-alloy-midnight/[0.08] font-semibold text-alloy-midnight ring-1 ring-alloy-midnight/18"
                                        : "border-alloy-stone/20 bg-white font-medium text-alloy-forge hover:border-alloy-stone/35"
                                }`}
                            >
                                <span className="block truncate">{r.display_name}</span>
                                <span className="block truncate text-[9px] font-normal text-alloy-midnight/55">{addr}</span>
                            </button>
                        );
                    })}
                </div>
            )
        ) : null;

    const composerSendBlock: ReactNode =
        anyOutboundReady && showDrawerComposerChrome && composerEntity ? (
            <div className="space-y-2">
                {effectiveComposer === "email" ? (
                    <label className="block space-y-0.5">
                        <input
                            type="text"
                            value={composerSubject}
                            onChange={(e) => setComposerSubject(e.target.value)}
                            disabled={sendBusy || !emailOutboundReady}
                            placeholder="Subject"
                            className="w-full rounded-md border border-alloy-stone/20 bg-white px-3 py-2 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                            autoComplete="off"
                        />
                    </label>
                ) : null}
                <label className="block space-y-0.5">
                    <textarea
                        value={composerBody}
                        onChange={(e) => setComposerBody(e.target.value)}
                        disabled={sendBusy || !composerReady}
                        rows={embedded ? 2 : 2}
                        placeholder="Write your message…"
                        className="w-full resize-none rounded-md border border-alloy-stone/20 bg-white px-3 py-2 text-[14px] leading-snug text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60 min-h-[160px] lg:min-h-[220px]"
                        aria-label="Message body"
                    />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void sendFromComposer()}
                        disabled={sendBusy || sendDisabledReason !== null}
                        title={sendDisabledReason ?? undefined}
                        className="rounded-md border border-alloy-midnight/20 bg-alloy-midnight px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-midnight/90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        {sendBusy ? "Sending…" : effectiveComposer === "email" ? "Send email" : "Send SMS"}
                    </button>
                </div>
                {!sendBusy && sendDisabledReason ? (
                    <p className="text-[10px] leading-snug text-alloy-midnight/55">{sendDisabledReason}</p>
                ) : null}
                {sendErr ? <p className="text-[11px] text-alloy-ember">{sendErr}</p> : null}
                {sendOkNote ? <p className="text-[11px] text-green-800/85">{sendOkNote}</p> : null}
            </div>
        ) : null;

    const composerBindingsShell: ReactNode =
        showDrawerComposerChrome && composerEntity ? (
            loadingBindings ? (
                <div className="space-y-1 py-1" aria-busy="true">
                    <div className="skeleton-pulse h-3 w-[min(92%,240px)] rounded bg-alloy-stone/14" aria-hidden />
                    <div className="skeleton-pulse h-8 w-full rounded-md bg-alloy-stone/12" aria-hidden />
                </div>
            ) : bindingsErr ? (
                <p className="text-[11px] text-alloy-ember">{bindingsErr}</p>
            ) : (
                <div className="mt-1 space-y-1.5">
                    {viewFilter === "all" ? (
                        <div className="flex flex-wrap items-center gap-1">
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
                        <p className="text-[10px] leading-snug text-alloy-midnight/60">
                            Add an active Resend email binding for this org.
                        </p>
                    ) : null}

                    {effectiveComposer === "sms" && !smsOutboundReady ? (
                        <p
                            className="text-[10px] leading-snug text-alloy-midnight/60"
                            title="SMS outbound requires a binding row with Twilio credentials"
                        >
                            SMS unavailable: set{" "}
                            <code className="rounded bg-alloy-stone/10 px-0.5 text-[9px]">communication_provider_bindings</code>{" "}
                            <code className="rounded bg-alloy-stone/10 px-0.5 text-[9px]">secret_ref</code> (not empty / not{" "}
                            <code className="rounded bg-alloy-stone/10 px-0.5 text-[9px]">unconfigured</code>) on an active{" "}
                            <code className="rounded bg-alloy-stone/10 px-0.5 text-[9px]">channel=sms</code> row for this org. Global Twilio env
                            alone does not enable the composer — the send route uses binding rows only.
                        </p>
                    ) : null}
                </div>
            )
        ) : null;

    const composerBlockInner: ReactNode =
        showDrawerComposerChrome && composerEntity ? (
            <div className="w-full min-w-0">
                <div className={COMPOSER_LABEL}>Compose</div>
                {composerBindingsShell}
                <div className="mt-1.5 space-y-1">{composerRecipientsBlock}</div>
                {composerSendBlock}
            </div>
        ) : null;

    const composerSplitLeft: ReactNode =
        showDrawerComposerChrome && composerEntity ? (
            <div className="w-full min-w-0">
                <div className={COMPOSER_LABEL}>Recipients</div>
                {composerBindingsShell}
                <div className="mt-1.5 space-y-1">{composerRecipientsBlock}</div>
            </div>
        ) : null;

    const composerSplitRight: ReactNode =
        showDrawerComposerChrome && composerEntity ? (
            <div className="w-full min-w-0 rounded-xl border border-alloy-stone/12 bg-white/[0.97] px-2 py-1.5 shadow-sm">
                <div className={COMPOSER_LABEL}>Message</div>
                {anyOutboundReady ? (
                    composerSendBlock
                ) : (
                    <p className="text-[10px] leading-snug text-alloy-midnight/55">
                        Configure an active outbound binding for this channel to compose here.
                    </p>
                )}
            </div>
        ) : null;

    const useWideComposerSplit = Boolean(showDrawerComposerChrome && composerEntity);

    const inboundUnreadCountForFilter = (f: ViewFilter) =>
        msgs.filter((m) => {
            if ((m.direction ?? "").toLowerCase() !== "inbound") return false;
            if (m.viewer_has_read === true) return false;
            const ch = (m.channel ?? "").trim().toLowerCase();
            if (f === "all") return true;
            return ch === f;
        }).length;

    const unreadTabDot = (f: ViewFilter) =>
        inboundUnreadCountForFilter(f) > 0 ? (
            <span
                className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#2563eb] align-middle opacity-90"
                aria-hidden
                title="Unread inbound in this view"
            />
        ) : null;

    const channelFilterTabs: ReactNode = (
        <div className="flex shrink-0 flex-wrap items-center gap-1" role="tablist" aria-label="Message channels">
            <button
                type="button"
                role="tab"
                aria-selected={viewFilter === "all"}
                className={filterTabCls("all")}
                onClick={() => onViewFilter("all")}
            >
                All{unreadTabDot("all")}
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={viewFilter === "email"}
                className={filterTabCls("email")}
                onClick={() => onViewFilter("email")}
            >
                Email{unreadTabDot("email")}
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={viewFilter === "sms"}
                className={filterTabCls("sms")}
                onClick={() => onViewFilter("sms")}
            >
                SMS{unreadTabDot("sms")}
            </button>
        </div>
    );

    const messageStream: ReactNode = loadingMsgs ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-4" aria-busy="true">
            <div className="skeleton-pulse h-12 w-[88%] rounded-2xl bg-alloy-stone/12" />
            <div className="skeleton-pulse ml-auto h-12 w-[78%] rounded-2xl bg-alloy-stone/10" />
            <div className="skeleton-pulse h-10 w-[70%] rounded-2xl bg-alloy-stone/11" />
        </div>
    ) : msgErr ? (
        <p className="text-sm text-alloy-ember">{msgErr}</p>
    ) : msgs.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-alloy-midnight/58">No messages in this view yet.</p>
    ) : (
        <ul className="flex flex-col gap-1 pb-0.5">
            {hiddenOlderCount > 0 ? (
                <li className="flex w-full justify-center pb-0.5">
                    <button
                        type="button"
                        className="rounded-full border border-alloy-stone/22 bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-alloy-midnight/70 shadow-sm hover:border-alloy-stone/40 hover:bg-white"
                        onClick={() => setShowOlderMessages(true)}
                    >
                        View older messages ({hiddenOlderCount})
                    </button>
                </li>
            ) : null}
            {showOlderMessages && msgs.length > DEFAULT_VISIBLE_MESSAGE_COUNT ? (
                <li className="flex w-full justify-center pb-0.5">
                    <button
                        type="button"
                        className="text-[11px] font-semibold text-alloy-blue hover:underline"
                        onClick={() => setShowOlderMessages(false)}
                    >
                        Show fewer messages
                    </button>
                </li>
            ) : null}
            {displayedMsgs.map((m) => {
                const inbound = (m.direction ?? "").toLowerCase() === "inbound";
                const pres = deliveryStatePresentation(mapToDeliveryState(m));
                const fail = pres.highlightFailure;
                const msgWhen = communicationMessageInstant(m);
                const { headline, sub } = bubbleStatusLine(m);
                const cp = counterpartyLabel(m, inbound, addressDisplayNameLookup);
                return (
                    <li
                        key={`${m.id}-${m._thread_id ?? ""}`}
                        className={`flex w-full ${inbound ? "justify-start" : "justify-end"}`}
                    >
                        <div
                            className={`max-w-[min(100%,19.5rem)] rounded-2xl px-2 py-1 text-[13px] leading-snug shadow-sm ${
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
                                className={`mb-0.5 flex flex-wrap items-baseline gap-x-1 text-[10px] font-semibold uppercase tracking-wide ${
                                    inbound ? "text-alloy-midnight/38" : "text-white/55"
                                }`}
                            >
                                <span className="opacity-90">{channelFacetLabel(m.channel)}</span>
                                <span className="opacity-40">·</span>
                                <span
                                    className={
                                        inbound
                                            ? fail
                                                ? "text-alloy-ember"
                                                : "normal-case text-alloy-forge/88"
                                            : "normal-case"
                                    }
                                >
                                    {headline}
                                </span>
                                {inbound && m.viewer_has_read !== true ? (
                                    <span
                                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb] opacity-90"
                                        title="Unread"
                                        aria-label="Unread"
                                    />
                                ) : null}
                                {msgWhen ? (
                                    <span
                                        className={`ml-auto tabular-nums normal-case font-normal opacity-75 ${
                                            inbound ? "text-alloy-midnight/45" : "text-white/65"
                                        }`}
                                    >
                                        {formatDateTimeForUserDisplay(msgWhen, viewerTz)}
                                    </span>
                                ) : null}
                            </div>
                            {sub ? (
                                <p
                                    className={`mb-0.5 text-[9px] font-normal normal-case leading-snug ${
                                        inbound ? "text-alloy-midnight/42" : "text-white/48"
                                    }`}
                                >
                                    {sub}
                                </p>
                            ) : null}
                            <p
                                className={`mb-1 text-[10px] font-medium leading-snug ${
                                    inbound ? "text-alloy-forge/72" : "text-white/72"
                                }`}
                            >
                                {cp.title}
                                {cp.subtitle ? (
                                    <span
                                        className={`mt-0.5 block font-normal ${
                                            inbound ? "text-alloy-midnight/45" : "text-white/50"
                                        }`}
                                    >
                                        {cp.subtitle}
                                    </span>
                                ) : null}
                            </p>
                            {m.body ? (
                                <TruncatedMessageBody
                                    messageId={m.id}
                                    body={m.body}
                                    expanded={Boolean(expandedBodies[m.id])}
                                    onToggle={toggleBodyExpand}
                                    inbound={inbound}
                                />
                            ) : null}
                        </div>
                    </li>
                );
            })}
        </ul>
    );

    /** History pane: thread load error, empty canonical threads (show setup copy), or merged messages. */
    const conversationPaneBody: ReactNode = thrErr ? (
        <p className="px-1 py-2 text-sm text-alloy-ember">{thrErr}</p>
    ) : threads.length === 0 ? (
        emptyThreadsBody
    ) : (
        messageStream
    );

    const headerTitle = !embedded ? (
        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Communications</h3>
    ) : null;

    const description = !embedded ? (
        <p className="text-sm text-alloy-midnight/65 -mt-2 mb-1.5">
            Recent messages and outbound compose for this record.
        </p>
    ) : null;

    return (
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className}`}>
            <section className="flex min-h-0 flex-1 flex-col gap-1">
                {headerTitle}
                {description}

                {loadingThreads ? (
                    <CommsQuietSkeletonLines dense={Boolean(embedded)} />
                ) : useWideComposerSplit ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-stretch lg:gap-2">
                        <div className="flex min-h-0 min-w-0 flex-col gap-1.5 lg:w-[min(33%,17rem)] lg:max-w-[18rem] lg:shrink-0">
                            {channelFilterTabs}
                            {composerSplitLeft}
                        </div>
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
                            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-[linear-gradient(180deg,rgba(246,247,249,0.88)_0%,#ffffff_100%)] shadow-sm">
                                <div
                                    ref={conversationScrollRef}
                                    className={`comms-drawer-conversation min-h-0 ${CONVERSATION_SCROLL_CLASS_SPLIT}`}
                                >
                                    {conversationPaneBody}
                                </div>
                            </div>
                            {composerSplitRight}
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                        {channelFilterTabs}

                        <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-[linear-gradient(180deg,rgba(246,247,249,0.88)_0%,#ffffff_100%)] shadow-sm">
                            <div
                                ref={conversationScrollRef}
                                className={`comms-drawer-conversation min-h-0 overflow-x-hidden overflow-y-auto px-2 py-1 ${CONVERSATION_SCROLL_HEIGHT_CLASS_STACKED}`}
                            >
                                {conversationPaneBody}
                            </div>

                            {composerBlockInner ? (
                                <div className="shrink-0 border-t border-alloy-stone/12 bg-white/[0.97] px-2 py-1">
                                    {composerBlockInner}
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}