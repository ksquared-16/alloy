"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { launchAdminV2OpenOpportunityFromContext } from "@/lib/adminV2/contextualRecordOpen";
import {
    drawerRecipientToQuickMessageHit,
    fetchQuickMessageOpportunityRecipients,
    resolveQuickMessageSelection,
    type QuickMessagePersonHit,
} from "@/lib/adminV2/quickMessageRecordRecipients";

const COMPOSER_LABEL = "mb-1 text-[8px] font-semibold tracking-[0.12em] text-alloy-midnight/45";

type PersonHit = QuickMessagePersonHit;

type ThreadPreviewRow = {
    id: string;
    channel: string;
    recipient_key: string | null;
    updated_at: string | null;
    last_message_preview?: {
        direction: string;
        body: string | null;
        created_at: string | null;
        channel: string;
    } | null;
};

/** Last N messages in first thread (existing GET messages API; chronological for display). */
const THREAD_MESSAGE_PREVIEW_LIMIT = 5;

type ThreadMessagePreviewRow = {
    id: string;
    direction: string;
    channel: string;
    body: string | null;
    created_at: string | null;
};

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

function previewSnippet(body: string | null | undefined, max = 72): string {
    const t = String(body ?? "").replace(/\s+/g, " ").trim();
    if (!t) return "—";
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function userFriendlySendNote(processNote: string, channel: "email" | "sms"): string {
    const n = processNote.trim().toLowerCase();
    const queued =
        !n ||
        n.includes("unset") ||
        n.includes("queued until cron") ||
        n.includes("stays queued");
    const noun = channel === "sms" ? "SMS" : "Email";
    if (queued) return `${noun} queued for delivery.`;
    if (n.includes("dispatched") || n.includes("backend process trigger")) return `${noun} sent.`;
    return `${noun} queued for delivery.`;
}

export type QuickMessageModalSeed = {
    personId?: string;
    opportunityId?: string | null;
    recordDisplayName?: string | null;
    displayName?: string;
    email?: string | null;
    phone?: string | null;
    /** Record-scoped launch — load linked contacts for opportunity (no global search). */
    recordScoped?: boolean;
    defaultChannel?: "email" | "sms";
};

export interface QuickMessageModalProps {
    open: boolean;
    onClose: () => void;
    seed?: QuickMessageModalSeed | null;
}

export default function QuickMessageModal({ open, onClose, seed = null }: QuickMessageModalProps) {
    const [searchQ, setSearchQ] = useState("");
    const [searchHits, setSearchHits] = useState<PersonHit[]>([]);
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchErr, setSearchErr] = useState<string | null>(null);

    const [selectedRecipients, setSelectedRecipients] = useState<PersonHit[]>([]);
    const [channel, setChannel] = useState<"email" | "sms">("email");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const [channelsAvailable, setChannelsAvailable] = useState<string[]>([]);
    const [bindingsErr, setBindingsErr] = useState<string | null>(null);
    const [loadingBindings, setLoadingBindings] = useState(false);

    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [sendOk, setSendOk] = useState<string | null>(null);

    const [threadsPreview, setThreadsPreview] = useState<ThreadPreviewRow[]>([]);
    const [threadsLoading, setThreadsLoading] = useState(false);
    const [threadsErr, setThreadsErr] = useState<string | null>(null);

    const [threadMsgsPreview, setThreadMsgsPreview] = useState<ThreadMessagePreviewRow[]>([]);
    const [threadMsgsLoading, setThreadMsgsLoading] = useState(false);
    const [threadMsgsErr, setThreadMsgsErr] = useState<string | null>(null);

    const searchSeq = useRef(0);
    const scopedFetchSeq = useRef(0);

    const [scopedRecipients, setScopedRecipients] = useState<PersonHit[]>([]);
    const [scopedRecipientsLoading, setScopedRecipientsLoading] = useState(false);
    const [scopedRecipientsErr, setScopedRecipientsErr] = useState<string | null>(null);
    const [scopedRecipientsResolved, setScopedRecipientsResolved] = useState(false);

    const emailReady = channelsAvailable.includes("email") && !bindingsErr && !loadingBindings;
    const smsReady = channelsAvailable.includes("sms") && !bindingsErr && !loadingBindings;

    const previewPersonId = selectedRecipients[0]?.person_id ?? null;

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingBindings(true);
        setBindingsErr(null);
        (async () => {
            try {
                const r = await fetch("/api/admin/communications/bindings", { credentials: "include" });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                const ch = (j as { channels_available?: string[] }).channels_available;
                if (!cancelled) setChannelsAvailable(Array.isArray(ch) ? ch : []);
            } catch (e) {
                if (!cancelled) {
                    setBindingsErr(e instanceof Error ? e.message : "Failed to load bindings");
                    setChannelsAvailable([]);
                }
            } finally {
                if (!cancelled) setLoadingBindings(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            setSearchQ("");
            setSearchHits([]);
            setSearchErr(null);
            setSelectedRecipients([]);
            setChannel(seed?.defaultChannel === "sms" ? "sms" : "email");
            setSubject("");
            setBody("");
            setSendErr(null);
            setSendOk(null);
            setThreadsPreview([]);
            setThreadsErr(null);
            setThreadMsgsPreview([]);
            setThreadMsgsErr(null);
            setScopedRecipients([]);
            setScopedRecipientsErr(null);
            setScopedRecipientsResolved(false);
            return;
        }
    }, [open]);

    const recordScoped = Boolean(seed?.recordScoped && seed?.opportunityId?.trim());
    const opportunityId = seed?.opportunityId?.trim() ?? "";

    useEffect(() => {
        if (!open || !recordScoped || !opportunityId) return;
        const seq = ++scopedFetchSeq.current;
        setScopedRecipientsLoading(true);
        setScopedRecipientsErr(null);
        setScopedRecipientsResolved(false);
        setSelectedRecipients([]);
        void (async () => {
            const { recipients, error } = await fetchQuickMessageOpportunityRecipients(opportunityId, {
                personId: seed?.personId ?? null,
                displayName: seed?.displayName ?? seed?.recordDisplayName ?? null,
                email: seed?.email ?? null,
                phone: seed?.phone ?? null,
            });
            if (scopedFetchSeq.current !== seq) return;
            setScopedRecipientsLoading(false);
            setScopedRecipientsResolved(true);
            if (error) {
                setScopedRecipientsErr(error);
                setScopedRecipients([]);
                return;
            }
            const hits = recipients.map(drawerRecipientToQuickMessageHit);
            setScopedRecipients(hits);
            const selected = resolveQuickMessageSelection({
                rows: recipients,
                preferredPersonId: seed?.personId ?? null,
            });
            setSelectedRecipients(selected);
            if (selected[0]) setSearchQ(selected[0].display_name);
        })();
    }, [
        open,
        recordScoped,
        opportunityId,
        seed?.personId,
        seed?.displayName,
        seed?.recordDisplayName,
        seed?.email,
        seed?.phone,
    ]);

    useEffect(() => {
        if (!open || recordScoped) return;
        if (!seed?.personId) return;
        const hit: PersonHit = {
            person_id: seed.personId,
            display_name: seed.displayName?.trim() || "Contact",
            email: seed.email ?? null,
            phone: seed.phone ?? null,
            has_email: Boolean(seed.email?.trim()),
            has_phone: Boolean(seed.phone?.trim()),
            relationship_label: null,
        };
        setSelectedRecipients([hit]);
        setSearchQ(hit.display_name);
    }, [open, recordScoped, seed?.personId, seed?.displayName, seed?.email, seed?.phone]);

    const showRecordEmptyState =
        recordScoped && scopedRecipientsResolved && !scopedRecipientsLoading && scopedRecipients.length === 0;

    useEffect(() => {
        if (!open || !previewPersonId) {
            setThreadsPreview([]);
            setThreadsErr(null);
            return;
        }
        let cancelled = false;
        setThreadsLoading(true);
        setThreadsErr(null);
        (async () => {
            try {
                const qs = new URLSearchParams({
                    entity_type: "persons",
                    entity_id: previewPersonId,
                    limit: "8",
                });
                const r = await fetch(`/api/admin/communications/threads?${qs}`, { credentials: "include" });
                const j = await r.json().catch(() => ({}));
                if (cancelled) return;
                if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                const list = (j as { threads?: ThreadPreviewRow[] }).threads;
                setThreadsPreview(Array.isArray(list) ? list : []);
            } catch (e) {
                if (!cancelled) {
                    setThreadsErr(e instanceof Error ? e.message : "Failed to load threads");
                    setThreadsPreview([]);
                }
            } finally {
                if (!cancelled) setThreadsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, previewPersonId]);

    const firstPreviewThreadId = threadsPreview[0]?.id ?? null;

    useEffect(() => {
        if (!open || !firstPreviewThreadId) {
            setThreadMsgsPreview([]);
            setThreadMsgsErr(null);
            return;
        }
        let cancelled = false;
        setThreadMsgsPreview([]);
        setThreadMsgsLoading(true);
        setThreadMsgsErr(null);
        void (async () => {
            try {
                const r = await fetch(
                    `/api/admin/communications/threads/${encodeURIComponent(firstPreviewThreadId)}/messages?limit=${THREAD_MESSAGE_PREVIEW_LIMIT}`,
                    { credentials: "include" },
                );
                const j = await r.json().catch(() => ({}));
                if (cancelled) return;
                if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                const raw = (j as { messages?: Record<string, unknown>[] }).messages;
                const list = Array.isArray(raw) ? raw : [];
                const rows: ThreadMessagePreviewRow[] = list.map((m) => ({
                    id: String(m.id ?? ""),
                    direction: String(m.direction ?? ""),
                    channel: String(m.channel ?? ""),
                    body: m.body != null ? String(m.body) : null,
                    created_at: m.created_at != null ? String(m.created_at) : null,
                }));
                const newestFirst = [...rows].sort(
                    (a, b) => Date.parse(String(b.created_at ?? 0)) - Date.parse(String(a.created_at ?? 0)),
                );
                const lastN = newestFirst.slice(0, THREAD_MESSAGE_PREVIEW_LIMIT).reverse();
                setThreadMsgsPreview(lastN);
            } catch (e) {
                if (!cancelled) {
                    setThreadMsgsErr(e instanceof Error ? e.message : "Failed to load messages");
                    setThreadMsgsPreview([]);
                }
            } finally {
                if (!cancelled) setThreadMsgsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, firstPreviewThreadId]);

    useEffect(() => {
        if (!open || recordScoped) return;
        const q = searchQ.trim();
        if (q.length < 2) {
            setSearchHits([]);
            setSearchErr(null);
            return;
        }
        const seq = ++searchSeq.current;
        const t = window.setTimeout(() => {
            void (async () => {
                setSearchBusy(true);
                setSearchErr(null);
                try {
                    const qs = new URLSearchParams({ q });
                    const r = await fetch(`/api/admin/communications/person-search?${qs}`, { credentials: "include" });
                    const j = await r.json().catch(() => ({}));
                    if (searchSeq.current !== seq) return;
                    if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                    const list = (j as { persons?: PersonHit[] }).persons;
                    setSearchHits(Array.isArray(list) ? list : []);
                } catch (e) {
                    if (searchSeq.current === seq) {
                        setSearchErr(e instanceof Error ? e.message : "Search failed");
                        setSearchHits([]);
                    }
                } finally {
                    if (searchSeq.current === seq) setSearchBusy(false);
                }
            })();
        }, 280);
        return () => window.clearTimeout(t);
    }, [searchQ, open, recordScoped]);

    const toggleRecipient = useCallback((p: PersonHit) => {
        setSelectedRecipients((prev) => {
            const i = prev.findIndex((x) => x.person_id === p.person_id);
            if (i >= 0) {
                const next = [...prev.slice(0, i), ...prev.slice(i + 1)];
                return next;
            }
            return [...prev, p];
        });
        setSendErr(null);
        setSendOk(null);
    }, []);

    useEffect(() => {
        if (selectedRecipients.length !== 1) return;
        const only = selectedRecipients[0];
        if (only.has_email && !only.has_phone) setChannel("email");
        else if (only.has_phone && !only.has_email) setChannel("sms");
    }, [selectedRecipients]);

    const blockedForChannel = selectedRecipients.filter((p) =>
        channel === "email" ? !p.has_email : !p.has_phone,
    );

    const send = async () => {
        if (selectedRecipients.length === 0) return;
        if (channel === "email" && !emailReady) return;
        if (channel === "sms" && !smsReady) return;
        if (!body.trim()) return;
        if (blockedForChannel.length > 0) return;

        setSendBusy(true);
        setSendErr(null);
        setSendOk(null);
        const ok: string[] = [];
        const fail: { name: string; err: string }[] = [];
        try {
            for (const recipient of selectedRecipients) {
                try {
                    const payload: Record<string, unknown> = {
                        quick_message: true,
                        recipient_person_id: recipient.person_id,
                        channel,
                        body: body.trim(),
                    };
                    if (channel === "email") {
                        payload.subject = subject.trim();
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
                    const note =
                        typeof (j as { process_trigger_attempted_note?: string }).process_trigger_attempted_note === "string"
                            ? String((j as { process_trigger_attempted_note: string }).process_trigger_attempted_note)
                            : "";
                    ok.push(`${recipient.display_name}: ${userFriendlySendNote(note, channel)}`);
                } catch (e) {
                    fail.push({
                        name: recipient.display_name,
                        err: e instanceof Error ? e.message : "Send failed",
                    });
                }
            }
            if (fail.length === 0) {
                setSendOk(ok.length === 1 ? ok[0]! : `${ok.length} sends completed.`);
            } else if (ok.length === 0) {
                setSendErr(fail.map((f) => `${f.name}: ${f.err}`).join(" · "));
            } else {
                setSendOk(
                    `Partial: ${ok.length} sent, ${fail.length} failed — ${fail.map((f) => `${f.name}: ${f.err}`).join(" · ")}`,
                );
            }
            if (fail.length === 0) {
                setSubject("");
                setBody("");
            }
        } finally {
            setSendBusy(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const canSend =
        selectedRecipients.length > 0 &&
        blockedForChannel.length === 0 &&
        body.trim().length > 0 &&
        (channel === "email" ? emailReady : smsReady);

    const sendLabel =
        selectedRecipients.length <= 1
            ? channel === "email"
                ? "Send email"
                : "Send SMS"
            : `Send to ${selectedRecipients.length} people`;

    const threadStripFallback = threadsPreview.slice(0, 5);

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-alloy-midnight/45 px-2 py-6 backdrop-blur-[2px] sm:px-4 sm:py-10">
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close modal" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="quick-message-title"
                className="relative z-[101] mx-auto flex w-full max-w-5xl max-h-[min(92vh,56rem)] flex-col overflow-hidden rounded-2xl border border-alloy-stone/18 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 items-start justify-between gap-2 border-b border-alloy-stone/12 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                        <p id="quick-message-title" className="text-sm font-semibold text-alloy-midnight">
                            Quick message
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/55">
                            {recordScoped
                                ? "Message is scoped to this record. Choose a linked parent or contact below."
                                : "Person-first · org-scoped · person-anchored threads. Search to add or remove recipients."}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-lg border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-forge hover:bg-alloy-stone/[0.06]"
                    >
                        Close
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden lg:py-0">
                    {/* Left ~30% — search + chips */}
                    <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[30%] lg:min-w-0 lg:max-w-[22rem] lg:border-r lg:border-alloy-stone/12 lg:px-5 lg:py-5">
                        {recordScoped ? (
                            <div data-testid="quick-message-record-scoped">
                                {scopedRecipientsLoading ? (
                                    <p className="text-[11px] text-alloy-midnight/45" aria-live="polite">
                                        Loading linked contacts…
                                    </p>
                                ) : null}
                                {scopedRecipientsErr ? (
                                    <p className="text-[11px] text-alloy-ember">{scopedRecipientsErr}</p>
                                ) : null}
                                {showRecordEmptyState ? (
                                    <div
                                        className="rounded-lg border border-alloy-stone/16 bg-alloy-stone/[0.04] px-3 py-3 text-[12px] leading-snug text-alloy-midnight/70"
                                        data-testid="quick-message-no-contact"
                                    >
                                        <p>
                                            No parent/contact linked yet.{" "}
                                            <button
                                                type="button"
                                                className="font-semibold text-alloy-blue underline-offset-2 hover:underline"
                                                onClick={() => {
                                                    if (!opportunityId) return;
                                                    launchAdminV2OpenOpportunityFromContext(opportunityId);
                                                    onClose();
                                                }}
                                            >
                                                Add contact →
                                            </button>
                                        </p>
                                        {seed?.recordDisplayName?.trim() ? (
                                            <p className="mt-1 text-[11px] text-alloy-midnight/50">
                                                Inquiry: {seed.recordDisplayName.trim()}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}
                                {scopedRecipients.length > 0 ? (
                                    <div>
                                        <div className={COMPOSER_LABEL}>Recipients</div>
                                        <ul
                                            className="mt-1 max-h-[min(40vh,14rem)] overflow-y-auto rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.03] lg:max-h-[min(52vh,22rem)]"
                                            role="listbox"
                                            aria-label="Linked contacts for this record"
                                            data-testid="quick-message-recipient-list"
                                        >
                                            {scopedRecipients.map((p) => {
                                                const selected = selectedRecipients.some(
                                                    (r) => r.person_id === p.person_id
                                                );
                                                return (
                                                    <li key={p.person_id}>
                                                        <button
                                                            type="button"
                                                            role="option"
                                                            aria-selected={selected}
                                                            onClick={() => toggleRecipient(p)}
                                                            className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-[12px] transition ${
                                                                selected
                                                                    ? "bg-alloy-midnight/[0.1]"
                                                                    : "hover:bg-white/80"
                                                            }`}
                                                        >
                                                            <span className="font-semibold text-alloy-forge">
                                                                {p.display_name}
                                                                {p.relationship_label ? (
                                                                    <span className="ml-1 font-normal text-alloy-midnight/50">
                                                                        · {p.relationship_label}
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                            <span className="text-[10px] text-alloy-midnight/55">
                                                                {p.has_email ? p.email : "No email"}
                                                                {p.has_email && p.has_phone ? " · " : null}
                                                                {p.has_phone
                                                                    ? formatDisplayPhoneUs(p.phone)
                                                                    : p.has_email
                                                                      ? ""
                                                                      : " · No phone"}
                                                                <span className="ml-1 text-alloy-blue">
                                                                    {selected ? "· Remove" : "· Add"}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                        <div>
                            <div className={COMPOSER_LABEL}>Search</div>
                            <input
                                type="search"
                                value={searchQ}
                                onChange={(e) => setSearchQ(e.target.value)}
                                placeholder="Name, email, or phone…"
                                className="w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20"
                                autoComplete="off"
                                aria-label="Search people"
                            />
                            {searchBusy ? (
                                <p className="mt-1 text-[11px] text-alloy-midnight/45" aria-live="polite">
                                    Searching…
                                </p>
                            ) : null}
                            {searchErr ? <p className="mt-1 text-[11px] text-alloy-ember">{searchErr}</p> : null}
                            {searchQ.trim().length >= 2 && !searchBusy && searchHits.length === 0 && !searchErr ? (
                                <p className="mt-1 text-[11px] text-alloy-midnight/50">No matches.</p>
                            ) : null}
                            {searchHits.length > 0 ? (
                                <ul
                                    className="mt-1.5 max-h-[min(40vh,14rem)] overflow-y-auto rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.03] lg:max-h-[min(52vh,22rem)]"
                                    role="listbox"
                                    aria-label="Search results — click to add or remove"
                                >
                                    {searchHits.map((p) => {
                                        const selected = selectedRecipients.some((r) => r.person_id === p.person_id);
                                        return (
                                            <li key={p.person_id}>
                                                <button
                                                    type="button"
                                                    role="option"
                                                    aria-selected={selected}
                                                    onClick={() => toggleRecipient(p)}
                                                    className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-[12px] transition ${
                                                        selected ? "bg-alloy-midnight/[0.1]" : "hover:bg-white/80"
                                                    }`}
                                                >
                                                    <span className="font-semibold text-alloy-forge">{p.display_name}</span>
                                                    <span className="text-[10px] text-alloy-midnight/55">
                                                        {p.has_email ? p.email : "No email"}
                                                        {p.has_email && p.has_phone ? " · " : null}
                                                        {p.has_phone ? formatDisplayPhoneUs(p.phone) : p.has_email ? "" : " · No phone"}
                                                        <span className="ml-1 text-alloy-blue">{selected ? "· Remove" : "· Add"}</span>
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : null}
                        </div>
                        )}

                        <div>
                            <div className={COMPOSER_LABEL}>Selected</div>
                            {selectedRecipients.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {selectedRecipients.map((p) => (
                                        <span
                                            key={p.person_id}
                                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-alloy-midnight/15 bg-alloy-midnight/[0.05] py-0.5 pl-2 pr-1 text-[10px] font-medium text-alloy-forge"
                                        >
                                            <span className="truncate">{p.display_name}</span>
                                            <button
                                                type="button"
                                                aria-label={`Remove ${p.display_name}`}
                                                className="shrink-0 rounded-full px-1 text-alloy-midnight/55 hover:bg-alloy-stone/15 hover:text-alloy-ember"
                                                onClick={() => toggleRecipient(p)}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                    <button
                                        type="button"
                                        className="text-[10px] font-semibold text-alloy-blue hover:underline"
                                        onClick={() => {
                                            setSelectedRecipients([]);
                                            setSendErr(null);
                                            setSendOk(null);
                                        }}
                                    >
                                        Clear all
                                    </button>
                                </div>
                            ) : (
                                <p className="text-[11px] text-alloy-midnight/50">Add people from search.</p>
                            )}
                        </div>
                    </aside>

                    {/* Right ~70% — thread preview + composer */}
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 border-t border-alloy-stone/12 pt-4 lg:w-[70%] lg:border-t-0 lg:border-l lg:border-alloy-stone/12 lg:px-5 lg:py-5 lg:pt-5">
                        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-alloy-stone/14 bg-alloy-stone/[0.04] p-3 lg:min-h-[11rem]">
                            <div className={COMPOSER_LABEL}>Thread preview</div>
                            {!previewPersonId ? (
                                <p className="mt-1 text-[11px] text-alloy-midnight/50">Select a recipient to load context.</p>
                            ) : selectedRecipients.length > 1 ? (
                                <p className="text-[10px] text-alloy-midnight/50">
                                    Context for{" "}
                                    <span className="font-medium text-alloy-forge">{selectedRecipients[0]?.display_name}</span> (first
                                    selected).
                                </p>
                            ) : null}
                            {threadsLoading ? (
                                <p className="mt-2 text-[11px] text-alloy-midnight/45">Loading threads…</p>
                            ) : threadsErr ? (
                                <p className="mt-2 text-[11px] text-alloy-ember">{threadsErr}</p>
                            ) : !previewPersonId ? null : threadsPreview.length === 0 ? (
                                <p className="mt-2 text-[11px] text-alloy-midnight/52">No threads yet for this person.</p>
                            ) : threadMsgsLoading && threadMsgsPreview.length === 0 ? (
                                <p className="mt-2 text-[11px] text-alloy-midnight/45">Loading recent messages…</p>
                            ) : threadMsgsPreview.length > 0 ? (
                                <div
                                    className="mt-2 flex max-h-[min(36vh,16rem)] flex-col gap-1.5 overflow-y-auto lg:max-h-[min(40vh,20rem)]"
                                    aria-label={`Last ${THREAD_MESSAGE_PREVIEW_LIMIT} messages in first thread`}
                                >
                                    {threadMsgsPreview.map((m) => {
                                        const inbound = (m.direction ?? "").toLowerCase() === "inbound";
                                        const when = m.created_at ? new Date(m.created_at).toLocaleString() : "";
                                        const ch = (m.channel ?? "").toUpperCase();
                                        return (
                                            <div
                                                key={m.id}
                                                className={`flex w-full ${inbound ? "justify-start" : "justify-end"}`}
                                            >
                                                <div
                                                    className={`max-w-[min(100%,28rem)] rounded-xl px-2 py-1.5 text-[11px] leading-snug shadow-sm ${
                                                        inbound
                                                            ? "border border-alloy-stone/14 bg-white text-alloy-forge"
                                                            : "bg-alloy-midnight/[0.9] text-white"
                                                    }`}
                                                >
                                                    <div
                                                        className={`mb-0.5 flex flex-wrap items-center gap-x-1 text-[9px] font-semibold uppercase tracking-wide ${
                                                            inbound ? "text-alloy-midnight/40" : "text-white/55"
                                                        }`}
                                                    >
                                                        <span>{ch}</span>
                                                        <span className="opacity-50">·</span>
                                                        <span className="font-normal normal-case">{when}</span>
                                                    </div>
                                                    <p
                                                        className={`line-clamp-6 whitespace-pre-wrap break-words ${
                                                            inbound ? "text-alloy-forge" : "text-white/95"
                                                        }`}
                                                    >
                                                        {m.body?.trim() ? m.body : "—"}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : threadMsgsErr ? (
                                <div className="mt-2 space-y-1">
                                    <p className="text-[11px] text-alloy-ember">{threadMsgsErr}</p>
                                    <p className="text-[10px] text-alloy-midnight/50">Recent threads (fallback):</p>
                                    <ul className="max-h-28 space-y-1 overflow-y-auto text-[10px]">
                                        {threadStripFallback.map((t) => {
                                            const pv = t.last_message_preview;
                                            const ch = (t.channel ?? "").toUpperCase();
                                            const when = pv?.created_at ? new Date(pv.created_at).toLocaleString() : "";
                                            return (
                                                <li key={t.id} className="rounded border border-alloy-stone/10 bg-white/80 px-1.5 py-1">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="font-semibold text-alloy-midnight/70">{ch}</span>
                                                        <span className="shrink-0 text-alloy-midnight/40">{when}</span>
                                                    </div>
                                                    <p className="mt-0.5 line-clamp-2 text-alloy-forge/88">{previewSnippet(pv?.body)}</p>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ) : (
                                <ul className="mt-2 max-h-[min(32vh,14rem)] space-y-1 overflow-y-auto text-[10px]">
                                    {threadStripFallback.map((t) => {
                                        const pv = t.last_message_preview;
                                        const ch = (t.channel ?? "").toUpperCase();
                                        const when = pv?.created_at ? new Date(pv.created_at).toLocaleString() : "";
                                        return (
                                            <li key={t.id} className="rounded border border-alloy-stone/10 bg-white/80 px-1.5 py-1">
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="font-semibold text-alloy-midnight/70">{ch}</span>
                                                    <span className="shrink-0 text-alloy-midnight/40">{when}</span>
                                                </div>
                                                <p className="mt-0.5 line-clamp-2 text-alloy-forge/88">{previewSnippet(pv?.body)}</p>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <div className="shrink-0 space-y-3 border-t border-alloy-stone/12 pt-3 lg:border-t-0 lg:pt-0">
                            <div>
                                <div className={COMPOSER_LABEL}>Channel</div>
                                {blockedForChannel.length > 0 ? (
                                    <p className="mb-1 text-[11px] text-alloy-ember">
                                        {channel === "email"
                                            ? `Remove or fix recipients without email: ${blockedForChannel.map((p) => p.display_name).join(", ")}`
                                            : `Remove or fix recipients without mobile: ${blockedForChannel.map((p) => p.display_name).join(", ")}`}
                                    </p>
                                ) : null}
                                <div className="flex flex-wrap gap-1">
                                    <button
                                        type="button"
                                        disabled={!emailReady}
                                        onClick={() => setChannel("email")}
                                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                            channel === "email"
                                                ? "bg-alloy-midnight text-white"
                                                : "border border-alloy-stone/22 bg-white text-alloy-forge disabled:cursor-not-allowed disabled:opacity-45"
                                        }`}
                                    >
                                        Email
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!smsReady}
                                        onClick={() => setChannel("sms")}
                                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                            channel === "sms"
                                                ? "bg-alloy-midnight text-white"
                                                : "border border-alloy-stone/22 bg-white text-alloy-forge disabled:cursor-not-allowed disabled:opacity-45"
                                        }`}
                                    >
                                        SMS
                                    </button>
                                </div>
                                {loadingBindings ? (
                                    <p className="mt-1 text-[10px] text-alloy-midnight/48">Loading outbound configuration…</p>
                                ) : bindingsErr ? (
                                    <p className="mt-1 text-[10px] text-alloy-ember">{bindingsErr}</p>
                                ) : !emailReady && !smsReady ? (
                                    <p className="mt-1 text-[10px] text-alloy-midnight/55">
                                        No outbound email or SMS bindings are active for this org.
                                    </p>
                                ) : null}
                            </div>

                            {channel === "email" ? (
                                <label className="block space-y-0.5">
                                    <span className="text-[11px] font-medium text-alloy-midnight/75">Subject</span>
                                    <input
                                        type="text"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        disabled={sendBusy}
                                        placeholder="Optional"
                                        className="w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                                        autoComplete="off"
                                    />
                                </label>
                            ) : null}

                            <label className="block space-y-0.5">
                                <span className="text-[11px] font-medium text-alloy-midnight/75">
                                    {channel === "email" ? "Email body" : "Message"}
                                </span>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    disabled={sendBusy}
                                    rows={4}
                                    placeholder={channel === "sms" ? "SMS…" : "Email…"}
                                    className="w-full resize-none rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] leading-snug text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                                    aria-label={channel === "email" ? "Email body" : "SMS message"}
                                />
                            </label>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void send()}
                                    disabled={sendBusy || !canSend}
                                    className="rounded-lg border border-alloy-midnight/20 bg-alloy-midnight px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-midnight/90 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    {sendBusy ? "Sending…" : sendLabel}
                                </button>
                            </div>
                            {sendErr ? <p className="text-[11px] text-alloy-ember">{sendErr}</p> : null}
                            {sendOk ? (
                                <p
                                    className={`text-[11px] ${sendOk.startsWith("Partial:") ? "text-amber-900/90" : "text-green-800/85"}`}
                                >
                                    {sendOk}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
