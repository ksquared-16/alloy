"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const COMPOSER_LABEL = "mb-1 text-[8px] font-semibold tracking-[0.12em] text-alloy-midnight/45";

type PersonHit = {
    person_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    has_email: boolean;
    has_phone: boolean;
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

export interface QuickMessageModalProps {
    open: boolean;
    onClose: () => void;
}

export default function QuickMessageModal({ open, onClose }: QuickMessageModalProps) {
    const [searchQ, setSearchQ] = useState("");
    const [searchHits, setSearchHits] = useState<PersonHit[]>([]);
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchErr, setSearchErr] = useState<string | null>(null);

    const [selected, setSelected] = useState<PersonHit | null>(null);
    const [channel, setChannel] = useState<"email" | "sms">("email");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const [channelsAvailable, setChannelsAvailable] = useState<string[]>([]);
    const [bindingsErr, setBindingsErr] = useState<string | null>(null);
    const [loadingBindings, setLoadingBindings] = useState(false);

    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [sendOk, setSendOk] = useState<string | null>(null);

    const searchSeq = useRef(0);

    const emailReady = channelsAvailable.includes("email") && !bindingsErr && !loadingBindings;
    const smsReady = channelsAvailable.includes("sms") && !bindingsErr && !loadingBindings;

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
            setSelected(null);
            setChannel("email");
            setSubject("");
            setBody("");
            setSendErr(null);
            setSendOk(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
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
    }, [searchQ, open]);

    const onPickPerson = useCallback((p: PersonHit) => {
        setSelected(p);
        setSendErr(null);
        setSendOk(null);
        if (p.has_email && !p.has_phone) setChannel("email");
        else if (p.has_phone && !p.has_email) setChannel("sms");
    }, []);

    const send = async () => {
        if (!selected) return;
        if (channel === "email" && !emailReady) return;
        if (channel === "sms" && !smsReady) return;
        if (!body.trim()) return;
        if (channel === "email" && !selected.has_email) {
            setSendErr("Selected person has no email on file.");
            return;
        }
        if (channel === "sms" && !selected.has_phone) {
            setSendErr("Selected person has no mobile number on file.");
            return;
        }

        setSendBusy(true);
        setSendErr(null);
        setSendOk(null);
        try {
            const payload: Record<string, unknown> = {
                quick_message: true,
                recipient_person_id: selected.person_id,
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
            setSendOk(userFriendlySendNote(note, channel));
            setSubject("");
            setBody("");
        } catch (e) {
            setSendErr(e instanceof Error ? e.message : "Send failed");
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
        !!selected &&
        body.trim().length > 0 &&
        (channel === "email" ? emailReady && selected.has_email : smsReady && selected.has_phone);

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-alloy-midnight/45 px-3 py-10 backdrop-blur-[2px]">
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close modal" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="quick-message-title"
                className="relative z-[101] w-full max-w-lg rounded-2xl border border-alloy-stone/18 bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-2 border-b border-alloy-stone/12 pb-3">
                    <div>
                        <p id="quick-message-title" className="text-sm font-semibold text-alloy-midnight">
                            Quick message
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/55">
                            Person-first · org-scoped · messages anchor to the selected person; related opportunity/job drawers still merge
                            those threads when the person is linked there.
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

                <div className="mt-3 space-y-3">
                    <div>
                        <div className={COMPOSER_LABEL}>Recipient</div>
                        <input
                            type="search"
                            value={searchQ}
                            onChange={(e) => setSearchQ(e.target.value)}
                            placeholder="Search name, email, or phone…"
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
                                className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.03]"
                                role="listbox"
                            >
                                {searchHits.map((p) => {
                                    const active = selected?.person_id === p.person_id;
                                    return (
                                        <li key={p.person_id}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={active}
                                                onClick={() => onPickPerson(p)}
                                                className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-[12px] transition ${
                                                    active ? "bg-alloy-midnight/[0.08]" : "hover:bg-white/80"
                                                }`}
                                            >
                                                <span className="font-semibold text-alloy-forge">{p.display_name}</span>
                                                <span className="text-[10px] text-alloy-midnight/55">
                                                    {p.has_email ? p.email : "No email"}
                                                    {p.has_email && p.has_phone ? " · " : null}
                                                    {p.has_phone ? formatDisplayPhoneUs(p.phone) : p.has_email ? "" : " · No phone"}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : null}
                    </div>

                    {selected ? (
                        <div className="rounded-lg border border-alloy-midnight/12 bg-alloy-midnight/[0.04] px-2 py-1.5 text-[11px] text-alloy-forge">
                            <span className="font-semibold">{selected.display_name}</span>
                            <button
                                type="button"
                                className="ml-2 text-alloy-blue hover:underline"
                                onClick={() => {
                                    setSelected(null);
                                    setSendErr(null);
                                    setSendOk(null);
                                }}
                            >
                                Change
                            </button>
                        </div>
                    ) : null}

                    <div>
                        <div className={COMPOSER_LABEL}>Channel</div>
                        {selected && channel === "email" && !selected.has_email ? (
                            <p className="mb-1 text-[11px] text-alloy-ember">
                                This person has no email on file. Switch to SMS or choose someone else.
                            </p>
                        ) : null}
                        {selected && channel === "sms" && !selected.has_phone ? (
                            <p className="mb-1 text-[11px] text-alloy-ember">
                                This person has no mobile number on file. Switch to email or choose someone else.
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
                            rows={3}
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
                            {sendBusy ? "Sending…" : channel === "email" ? "Send email" : "Send SMS"}
                        </button>
                    </div>
                    {sendErr ? <p className="text-[11px] text-alloy-ember">{sendErr}</p> : null}
                    {sendOk ? <p className="text-[11px] text-green-800/85">{sendOk}</p> : null}

                    <p className="border-t border-alloy-stone/10 pt-2 text-[10px] text-alloy-midnight/48">
                        <Link href="/adminV2/messages" className="font-semibold text-alloy-blue hover:underline" onClick={onClose}>
                            Messaging overview
                        </Link>{" "}
                        (scaffold) — templates and inbox are not in this version.
                    </p>
                </div>
            </div>
        </div>
    );
}
