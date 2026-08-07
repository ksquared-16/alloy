"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchCommunicationsBindingsChannelsCached } from "@/lib/communications/communicationsBindingsCache";
import {
    isReusableOutboundBindingsSnapshot,
    resolveDrawerComposerSmsAvailability,
} from "@/lib/communications/drawerComposerChannelAvailability";
import DrawerMessagingComposer from "@/components/adminV2/messaging/DrawerMessagingComposer";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import RecordCommunicationsTab from "@/app/adminV2/communications/recordTab/RecordCommunicationsTab";
import type { FamilyWorkspaceSurfaceVariant } from "@/lib/communications/v2/familyWorkspace/surfaceVariant";
import MessagingThreadMessageBubble from "@/components/adminV2/messaging/MessagingThreadMessageBubble";
import {
    supportsDrawerCommunicationsComposer,
    normalizeDrawerCommunicationsEntityType,
} from "@/lib/adminV2/messaging/drawerCommunicationsEntity";
import type { InboxThreadMessageRow } from "@/lib/adminV2/messaging/inboxThreadMessagesCache";
import {
    formatMessagingThreadContextLine,
    formatMessagingThreadMetadataLine,
} from "@/lib/adminV2/messaging/messagingThreadContextLines";
import {
    takeCommunicationsDrawerPrefetch,
    markCommunicationsDrawerPrefetchConsumed,
    invalidateCommunicationsDrawerPrefetch,
} from "@/lib/admin/communications/communicationsDrawerPrefetch";
import { dispatchOpportunityDrawerScopedUpdate } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import type { CommunicationMessage, DeliveryState } from "@/lib/communications/deliveryStateAdapter";
import { deliveryStatePresentation, mapToDeliveryState } from "@/lib/communications/deliveryStateAdapter";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import type { OpportunityComposeContext } from "@/lib/communications/opportunityComposeTemplates";
import type { FamilyCommunicationWorkspacePreviewVM } from "@/lib/communications/v2/familyWorkspace/types";

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
/** Cap comms body so thread/composer share a fixed drawer region (no page scroll to compose). */
const COMMS_DRAWER_BODY_HEIGHT_CLASS = "h-[min(72vh,calc(100dvh-15rem))] min-h-[22rem] max-h-[min(72vh,calc(100dvh-15rem))]";
/** Side-by-side workspace at normal drawer width; stacks below breakpoint. */
const COMMS_DRAWER_SPLIT_LAYOUT_CLASS =
    "flex min-h-0 flex-1 flex-col overflow-hidden max-[539px]:max-h-none min-[540px]:flex-row";
/** Left column — context, filters, scrollable history (~40%). */
const COMMS_DRAWER_THREAD_COLUMN_CLASS =
    "flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#F7F9FA] max-[539px]:max-h-[min(38vh,14rem)] min-[540px]:w-[40%] min-[540px]:shrink-0 min-[540px]:border-r min-[540px]:border-alloy-stone/28 min-[540px]:shadow-[inset_-1px_0_0_rgba(0,162,131,0.1)]";
/** Right column — always-visible composer (~60%). */
const COMMS_DRAWER_COMPOSER_COLUMN_CLASS =
    "flex min-h-0 min-w-0 flex-col overflow-hidden bg-white min-[540px]:w-[60%] min-[540px]:flex-1 min-[540px]:shadow-[-8px_0_16px_-12px_rgba(49,57,77,0.14)]";
/** Thread scroll — split layout (left column; parent constrains height on narrow stack). */
const CONVERSATION_SCROLL_CLASS_SPLIT =
    "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-1";

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
    /** First-paint Activity communications preview from selected Focus Panel VM. */
    initialPreviewVm?: FamilyCommunicationWorkspacePreviewVM | null;
    /** Warm threads/messages/bindings while drawer Overview is visible (no UI). */
    backgroundPreload?: boolean;
    /** Embedded in overview — compact summary, expand in place, messages only after expand + thread pick. */
    embedded?: boolean;
    /** When embedded inside a drawer section that already shows a "Communication(s)" heading, omit duplicate title. */
    embeddedHeaderMode?: "full" | "description_only";
    /** Focus Panel Activity embed — compact thread-first layout; Command Center modal stays default. */
    surfaceVariant?: FamilyWorkspaceSurfaceVariant;
    /** Current Work Contact Family: post-send returns to What's Next without opening the thread. */
    entryContext?: "current_work" | null;
    className?: string;
    /** Opportunity-only: lightweight starter templates when there is no message history yet. */
    opportunityComposeContext?: OpportunityComposeContext | null;
    /** Optional compact header metadata (status, location, children, related contacts). */
    threadContextMetadata?: {
        primaryLabel?: string | null;
        status?: string | null;
        location?: string | null;
        children?: string | null;
        relatedContacts?: string | null;
    } | null;
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

/**
 * Whether the send advanced the open work, in the operator's terms. Sending and having nothing
 * happen used to be indistinguishable from sending and advancing the step — the API said which,
 * but nothing read it.
 */
function contactAttemptNote(assoc: unknown): string {
    if (assoc == null || typeof assoc !== "object") return "";
    const a = assoc as { associated?: boolean; reason?: string };
    if (a.associated) return " Contact attempt recorded.";
    if (a.reason === "no_configured_sufficiency") {
        return " This step isn’t set up to complete on a sent message, so nothing advanced.";
    }
    if (a.reason === "no_open_work") return "";
    return "";
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

/**
 * Numeric sort key for ordering messages oldest→newest. Parses each row's timestamp
 * once (vs. inside the comparator, which re-parses O(n·log n) times); non-finite or
 * absent values sort as 0 — identical to the prior inline comparator semantics.
 */
function messageSortTimestamp(m: { created_at?: string | null; sent_at?: string | null }): number {
    const t = Date.parse(String(m.created_at ?? m.sent_at ?? 0));
    return Number.isFinite(t) ? t : 0;
}

/** Stable oldest→newest order using a precomputed timestamp key (decorate-sort-undecorate). */
function sortMessagesByInstantAscending<T extends { created_at?: string | null; sent_at?: string | null }>(
    rows: T[],
): T[] {
    return rows
        .map((row) => ({ row, ts: messageSortTimestamp(row) }))
        .sort((a, b) => a.ts - b.ts)
        .map((decorated) => decorated.row);
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
function CommunicationsDrawerSectionLegacy({
    apiEntityType,
    entityId,
    active = true,
    backgroundPreload = false,
    embedded = true,
    className = "",
    opportunityComposeContext: _opportunityComposeContext = null,
    threadContextMetadata = null,
}: CommunicationsDrawerSectionProps) {
    const normalizedEntityType = normalizeDrawerCommunicationsEntityType(apiEntityType);
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

    const composerEntity = supportsDrawerCommunicationsComposer(normalizedEntityType)
        ? normalizedEntityType
        : null;
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

    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [sendOkNote, setSendOkNote] = useState<string | null>(null);

    /** When false, only the last {@link DEFAULT_VISIBLE_MESSAGE_COUNT} messages are listed (rest via “View older”). */
    const [showOlderMessages, setShowOlderMessages] = useState(false);
    const [expandedBodies, setExpandedBodies] = useState<Record<string, boolean>>({});

    const emailOutboundReady =
        channelsAvailable.includes("email") && !bindingsErr && !loadingBindings;
    const smsProviderReady =
        channelsAvailable.includes("sms") && !bindingsErr && !loadingBindings;
    const smsAvailability = resolveDrawerComposerSmsAvailability({
        smsProviderReady,
        loadingBindings,
        bindingsError: bindingsErr,
        recipients,
        selectedRecipientIds,
    });
    /** Provider-level gate for recipient fetch / send plumbing (not the SMS tab). */
    const smsOutboundReady = smsProviderReady;
    /** SMS channel toggle — provider + selected/available recipient phone. */
    const smsComposerReady = smsAvailability.available;
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
        setSendErr(null);
        setSendOkNote(null);
        setShowOlderMessages(false);
        setExpandedBodies({});
        markedReadSubmittedRef.current.clear();
        setBindingsRefreshGen(0);
    }, [entityId, apiEntityType]);

    /** When parent hides Communication (`active` false), drop thread detail unless background preload keeps warming. */
    useEffect(() => {
        if (active || backgroundPreload) return;
        setMsgs([]);
        setMsgErr(null);
        setShowOlderMessages(false);
        setExpandedBodies({});
        markedReadSubmittedRef.current.clear();
    }, [active, backgroundPreload]);

    /** Fetches run while tab is active or background preload is armed. */
    const dataLayerActive = active || backgroundPreload;

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

    /** Active-filter view of loaded messages — client-side channel filter (no refetch on tab switch). */
    const filteredMsgs = useMemo(() => {
        if (viewFilter === "all") return msgs;
        return msgs.filter((m) => (m.channel ?? "").trim().toLowerCase() === viewFilter);
    }, [msgs, viewFilter]);

    const displayedMsgs = useMemo(() => {
        if (showOlderMessages || filteredMsgs.length <= DEFAULT_VISIBLE_MESSAGE_COUNT) return filteredMsgs;
        return filteredMsgs.slice(-DEFAULT_VISIBLE_MESSAGE_COUNT);
    }, [filteredMsgs, showOlderMessages]);

    const hiddenOlderCount =
        filteredMsgs.length > DEFAULT_VISIBLE_MESSAGE_COUNT && !showOlderMessages
            ? filteredMsgs.length - DEFAULT_VISIBLE_MESSAGE_COUNT
            : 0;

    /** Inbound-unread counts per filter, computed once per msgs change (was rescanned 3×/render). */
    const inboundUnreadCounts = useMemo(() => {
        let all = 0;
        let email = 0;
        let sms = 0;
        for (const m of msgs) {
            if ((m.direction ?? "").toLowerCase() !== "inbound") continue;
            if (m.viewer_has_read === true) continue;
            all += 1;
            const ch = (m.channel ?? "").trim().toLowerCase();
            if (ch === "email") email += 1;
            else if (ch === "sms") sms += 1;
        }
        return { all, email, sms } as Record<ViewFilter, number>;
    }, [msgs]);

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

    const loadConversationMessages = useCallback(
        async (signal: AbortSignal, isCurrent: () => boolean) => {
            if (!dataLayerActive) return;

            const applyMessagesFromPrefetch = async (): Promise<boolean> => {
                const peek = takeCommunicationsDrawerPrefetch(apiEntityType, entityId);
                const snap = peek?.messages_snapshot;
                if (snap && !snap.error) {
                    if (!isCurrent()) return true;
                    setMsgs(sortMessagesByInstantAscending(snap.messages as MsgRowWithThread[]));
                    setMsgErr(null);
                    setShowOlderMessages(false);
                    setExpandedBodies({});
                    markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "messages");
                    setLoadingMsgs(false);
                    return true;
                }
                if (peek?.messages) {
                    try {
                        const pr = await peek.messages;
                        if (!pr.error) {
                            if (!isCurrent()) return true;
                            setMsgs(sortMessagesByInstantAscending(pr.messages as MsgRowWithThread[]));
                            setMsgErr(null);
                            setShowOlderMessages(false);
                            setExpandedBodies({});
                            markCommunicationsDrawerPrefetchConsumed(apiEntityType, entityId, "messages");
                            setLoadingMsgs(false);
                            return true;
                        }
                    } catch (e) {
                        if (signal.aborted || (e instanceof Error && e.name === "AbortError")) return true;
                    }
                }
                return false;
            };

            setLoadingMsgs(true);
            setMsgErr(null);
            if (await applyMessagesFromPrefetch()) return;

            // Load across all in-scope threads regardless of the active filter; the channel
            // filter is applied client-side (filteredMsgs) so tab switches never refetch.
            const scopeList = threads.slice(0, MAX_MERGE_THREADS);
            if (scopeList.length === 0) {
                if (!isCurrent()) return;
                setMsgs([]);
                setMsgErr(null);
                setShowOlderMessages(false);
                setExpandedBodies({});
                setLoadingMsgs(false);
                return;
            }
            try {
                const batches = await Promise.all(
                    scopeList.map(async (th) => {
                        const r = await fetch(
                            `/api/admin/communications/threads/${encodeURIComponent(th.id)}/messages?limit=${MESSAGES_PER_THREAD_LIMIT}&include_viewer_read=1`,
                            { credentials: "include", signal },
                        );
                        const j = await r.json().catch(() => ({}));
                        if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                        const raw = Array.isArray((j as { messages?: MsgRow[] }).messages)
                            ? (j as { messages: MsgRow[] }).messages
                            : [];
                        return raw.map((m) => ({ ...m, _thread_id: th.id }) as MsgRowWithThread);
                    }),
                );
                if (!isCurrent()) return;
                let merged = sortMessagesByInstantAscending(batches.flat());
                const cap = 200;
                if (merged.length > cap) merged = merged.slice(-cap);
                setMsgs(merged);
                setShowOlderMessages(false);
                setExpandedBodies({});
            } catch (e) {
                // A superseded load aborts its in-flight fetches; the current load owns state.
                if (signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
                if (!isCurrent()) return;
                setMsgErr(e instanceof Error ? e.message : "Failed to load messages");
                setMsgs([]);
                setShowOlderMessages(false);
                setExpandedBodies({});
            } finally {
                if (isCurrent()) setLoadingMsgs(false);
            }
        },
        [dataLayerActive, threads],
    );

    useEffect(() => {
        if (!dataLayerActive) return;
        const controller = new AbortController();
        let active = true;
        void loadConversationMessages(controller.signal, () => active);
        return () => {
            active = false;
            controller.abort();
        };
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
        if (!active || !dataLayerActive || loadingMsgs) return;
        // Only mark read the channel the viewer is actually looking at (the filtered view).
        const inboundUnreadIds = filteredMsgs
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
                    const markedReadIdSet = new Set(inboundUnreadIds);
                    inboundUnreadIds.forEach((id) => markedReadSubmittedRef.current.add(id));
                    setMsgs((prev) =>
                        prev.map((m) => (markedReadIdSet.has(m.id) ? { ...m, viewer_has_read: true } : m)),
                    );
                    window.dispatchEvent(new CustomEvent("alloy-comms-unread-refresh"));
                } catch {
                    /* ignore */
                }
            })();
        }, 550);
        return () => window.clearTimeout(t);
    }, [dataLayerActive, loadingMsgs, filteredMsgs]);

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
                // Email-only snapshots (taken before SMS activation) must not lock SMS off.
                if (!bsnap.error && isReusableOutboundBindingsSnapshot(bsnap.channels)) {
                    applyBindingsPayload(bsnap, { event: "prefetch_reused", path: "snapshot" });
                    return;
                }
                // Empty / email-only outbound snapshot — fetch fresh (force past stale module cache).
            }

            setLoadingBindings(true);
            setBindingsErr(null);
            try {
                if (peekB?.bindings) {
                    try {
                        const pb = await peekB.bindings;
                        if (cancelled) return;
                        if (!pb.error && isReusableOutboundBindingsSnapshot(pb.channels)) {
                            applyBindingsPayload(pb, { event: "prefetch_reused", path: "promise" });
                            return;
                        }
                        // Partial / email-only promise — fall through to forced network fetch.
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
                if (lateSnap && !lateSnap.error && isReusableOutboundBindingsSnapshot(lateSnap.channels)) {
                    if (cancelled) return;
                    applyBindingsPayload(lateSnap, {
                        event: "duplicate_prevented",
                        detail: "late_snapshot_before_network",
                        path: "snapshot",
                    });
                    return;
                }

                const pb = await fetchCommunicationsBindingsChannelsCached({ force: true });
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

    const sendFromComposer = async (values: { subject: string; body: string }): Promise<boolean> => {
        if (!composerEntity || selectedRecipientIds.size === 0 || !values.body.trim()) return false;
        if (effectiveComposer === "email" && !emailOutboundReady) return false;
        if (effectiveComposer === "sms" && !smsOutboundReady) return false;

        const channelSent = effectiveComposer === "sms" ? "sms" : "email";
        setSendBusy(true);
        setSendErr(null);
        setSendOkNote(null);
        const bodyTrim = values.body.trim();
        const subjectTrim = values.subject.trim();
        try {
            let lastNote = "";
            let lastAssociation: unknown = undefined;
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
                lastAssociation = (j as { contact_attempt_association?: unknown })
                    .contact_attempt_association;
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
            setSendOkNote(
                userFriendlySendNote(lastNote, channelSent === "sms" ? "sms" : "email")
                    + contactAttemptNote(lastAssociation),
            );
            invalidateCommunicationsDrawerPrefetch(apiEntityType, entityId);
            // The comms cache is not the only reader. Activity surfaces (What's Next "Recent
            // activity", the Activity timeline) compose from the drawer record, which a send never
            // recomposed — so a message sent today kept showing last week's activity until some
            // unrelated refresh happened to land.
            if (apiEntityType === "opportunities") {
                dispatchOpportunityDrawerScopedUpdate(entityId, "communications_send", ["activity"]);
            }
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
                    return sortMessagesByInstantAscending(merged);
                });
                setShowOlderMessages(false);
            }
            return true;
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
            return false;
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
                ? "bg-[#00A283]/12 text-alloy-midnight ring-1 ring-[#00A283]/25"
                : "border border-alloy-stone/18 bg-white text-alloy-forge hover:bg-[#E8F6F2]/50"
        }`;

    const emptyThreadsClass = embedded ? "text-[12px] text-alloy-midnight/60" : "text-sm text-alloy-midnight/60";
    const isPersonDrawerEntity = apiEntityType === "persons";

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
                        {isPersonDrawerEntity
                            ? "Add email or mobile on the person summary to send messages."
                            : "No eligible email or SMS recipients found for this record."}
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
                <p className="mt-1 leading-relaxed">
                    {isPersonDrawerEntity
                        ? "Message history for this person will appear here. Use the composer below to send email or SMS."
                        : "Start the conversation below."}
                </p>
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
        isPersonDrawerEntity,
    ]);

    if (!active) return null;

    const composerReady =
        (effectiveComposer === "email" && emailOutboundReady) || (effectiveComposer === "sms" && smsOutboundReady);

    // Every disabled reason except the empty-body case; the composer appends that from its own draft.
    const sendDisabledReasonBase: string | null = (() => {
        if (sendBusy) return null;
        if (!composerReady) {
            return effectiveComposer === "email"
                ? "Configure an active email (Resend) binding to send."
                : "Configure an active SMS binding to send.";
        }
        if (recipientsForComposer.length === 0) {
            return isPersonDrawerEntity
                ? effectiveComposer === "email"
                    ? "Add an email on the person summary to send."
                    : "Add a mobile number on the person summary to send SMS."
                : effectiveComposer === "email"
                  ? "No linked person has an email address for this channel."
                  : "No linked person has a mobile number for SMS.";
        }
        if (selectedRecipientIds.size === 0) return "Select at least one recipient.";
        return null;
    })();

    const drawerContextLine = formatMessagingThreadContextLine({
        location: threadContextMetadata?.location,
        status: threadContextMetadata?.status,
        channel: effectiveComposer,
    });
    const drawerMetadataLine = formatMessagingThreadMetadataLine({
        children: threadContextMetadata?.children,
        relatedContacts: threadContextMetadata?.relatedContacts,
    });

    const drawerComposerNode =
        showDrawerComposerChrome && composerEntity && normalizedEntityType ? (
            <DrawerMessagingComposer
                key={`${normalizedEntityType}:${entityId}`}
                apiEntityType={normalizedEntityType}
                entityId={entityId}
                columnLayout
                channel={effectiveComposer}
                onChannelChange={(ch) => {
                    if (viewFilter === "all") setAllComposerMode(ch);
                    else onViewFilter(ch);
                }}
                emailReady={emailOutboundReady}
                smsReady={smsComposerReady}
                smsDisabledTitle={smsAvailability.reason ?? "SMS is not available"}
                bindingsErr={bindingsErr}
                loadingBindings={loadingBindings}
                recipients={recipients}
                selectedRecipientIds={selectedRecipientIds}
                onToggleRecipient={toggleRecipient}
                sendBusy={sendBusy}
                sendDisabledReasonBase={sendDisabledReasonBase}
                sendLabel="Send now"
                onSend={sendFromComposer}
                sendErr={sendErr}
                sendOkNote={sendOkNote}
            />
        ) : null;

    const unreadTabDot = (f: ViewFilter) =>
        inboundUnreadCounts[f] > 0 ? (
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
    ) : filteredMsgs.length === 0 ? (
        // Card 4 P2 — occupy the same flex-1 footprint as the loading skeleton/list so the message
        // stream does not shift height across loading → empty → list.
        <div className="flex flex-1 flex-col items-center justify-center py-4">
            <p className="text-center text-[13px] text-alloy-midnight/58">No messages in this view yet.</p>
        </div>
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
            {showOlderMessages && filteredMsgs.length > DEFAULT_VISIBLE_MESSAGE_COUNT ? (
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
                const bubbleMessage: InboxThreadMessageRow = {
                    id: m.id,
                    direction: m.direction ?? "",
                    channel: m.channel ?? "",
                    body: m.body ?? null,
                    created_at: communicationMessageInstant(m) ?? null,
                };
                return (
                    <li
                        key={`${m.id}-${m._thread_id ?? ""}`}
                        className={`flex w-full ${inbound ? "justify-start" : "justify-end"}`}
                    >
                        <MessagingThreadMessageBubble message={bubbleMessage} compact />
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

    const compactHeader: ReactNode =
        drawerContextLine || drawerMetadataLine ? (
            <div
                className="shrink-0 border-b border-alloy-stone/18 bg-[#E8F6F2]/35 px-2 py-1.5"
                data-adminv2-drawer-comms-header="true"
            >
                {drawerContextLine ? (
                    <p className="text-[11px] leading-snug text-alloy-midnight/62">{drawerContextLine}</p>
                ) : null}
                {drawerMetadataLine ? (
                    <p className={`text-[10px] leading-snug text-alloy-midnight/50 ${drawerContextLine ? "mt-0.5" : ""}`}>
                        {drawerMetadataLine}
                    </p>
                ) : null}
            </div>
        ) : null;

    return (
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${className}`} data-adminv2-drawer-comms="true">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {headerTitle}
                {description}

                {loadingThreads ? (
                    // Card 4 P2 — reserve the same body footprint as the loaded split layout so the
                    // panel does not reshape when threads arrive.
                    <div className={COMMS_DRAWER_BODY_HEIGHT_CLASS}>
                        <CommsQuietSkeletonLines dense={Boolean(embedded)} />
                    </div>
                ) : (
                    <div
                        className={`${COMMS_DRAWER_BODY_HEIGHT_CLASS} ${COMMS_DRAWER_SPLIT_LAYOUT_CLASS}`}
                        data-comms-drawer-layout="split-workspace"
                    >
                        <div
                            className={COMMS_DRAWER_THREAD_COLUMN_CLASS}
                            data-comms-drawer-thread-column="true"
                        >
                            {compactHeader}
                            <div className="shrink-0 border-b border-alloy-stone/10 px-2 py-1.5">
                                {channelFilterTabs}
                            </div>
                            <div
                                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                                data-comms-thread-pane="true"
                            >
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#00A283]/12 bg-[#FAFBFC] shadow-sm max-[539px]:rounded-b-none max-[539px]:border-b-0">
                                    <div
                                        ref={conversationScrollRef}
                                        className={`comms-drawer-conversation ${CONVERSATION_SCROLL_CLASS_SPLIT}`}
                                        data-comms-thread-scroll="true"
                                    >
                                        {conversationPaneBody}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div
                            className={COMMS_DRAWER_COMPOSER_COLUMN_CLASS}
                            data-comms-drawer-composer-column="true"
                        >
                            {drawerComposerNode ?? (
                                <div className="flex flex-1 items-center justify-center px-3 py-6 text-center text-[12px] text-alloy-midnight/55">
                                    Composer unavailable for this record type.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}


export default function CommunicationsDrawerSection(props: CommunicationsDrawerSectionProps) {
    // PKG-18B: mount the dark RecordCommunicationsTab when comms_v2_record_tab is on; legacy preserved when off.
    if (isCommsV2FlagEnabled("comms_v2_record_tab")) {
        return (
            <RecordCommunicationsTab
                entityType={props.apiEntityType}
                entityId={props.entityId}
                initialPreviewVm={props.initialPreviewVm}
                compactActivityLoading={props.embedded}
                surfaceVariant={props.surfaceVariant}
                entryContext={props.entryContext}
            />
        );
    }
    return <CommunicationsDrawerSectionLegacy {...props} />;
}
