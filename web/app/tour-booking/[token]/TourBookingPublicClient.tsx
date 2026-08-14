"use client";

/**
 * The parent's tour surface. No login, mobile-first, one screen.
 *
 * It renders the server-built `view` and nothing else. It does not know invitation
 * statuses, booking status keys, or ids, and it never shows a raw server error —
 * every message a parent can read is authored, either in `tourParentView` or here.
 *
 * Every action is a POST to a guarded route that consumes the credential exactly
 * once. Re-opening or re-submitting is safe because consumption is server-side and
 * idempotent; this page simply re-reads its state afterwards.
 */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import type { TourParentAction, TourParentView } from "@/lib/tours/public/tourParentView";
import {
    buildTourCalendarWeeks,
    formatParentDayLabel,
    formatParentMonthLabel,
    formatParentTimeOnly,
    tourSlotDayKey,
} from "@/lib/tours/public/tourParentView";

type ResolveJson = { ok?: boolean; view?: TourParentView };

/**
 * How many times to show at once. A full availability set runs to dozens of rows,
 * which reads as work rather than an invitation. The parent can ask for more.
 */
type SlotsJson = { ok?: boolean; slots?: AvailableTourSlot[] };

/** One authored sentence per failure. The server's own wording never reaches here. */
const TROUBLE = "We couldn't load this page just now. Please try again in a moment, or reply to our message and we'll help.";
const ACTION_TROUBLE = "That didn't go through. Please try again, or reply to our message and we'll sort it out.";
const GONE = "This link is no longer active. Please reply to our message and we'll send you a new one.";
const SPENT = "Thanks — we already have your answer. If something doesn't look right, reply to our message and we'll sort it out.";
const SLOT_GONE = "That time is no longer available. Please choose another.";

export default function TourBookingPublicClient({ token }: { token: string }) {
    const [view, setView] = useState<TourParentView | null>(null);
    const [slots, setSlots] = useState<AvailableTourSlot[]>([]);
    const [pick, setPick] = useState<AvailableTourSlot | null>(null);
    const [trouble, setTrouble] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [day, setDay] = useState<string | null>(null);
    /** Bounded cancellation: the parent has chosen Cancel and must confirm. */
    const [confirmingCancel, setConfirmingCancel] = useState(false);

    const api = useCallback((suffix: string) => `/api/public/tour-booking/${encodeURIComponent(token)}${suffix}`, [token]);

    const load = useCallback(async () => {
        try {
            const r = await fetch(api("/resolve"));
            if (r.status === 409) {
                // The authorizer's answer for a credential that has already been
                // spent. Not an error to the parent — they simply already replied.
                setTrouble(SPENT);
                setLoaded(true);
                return;
            }
            if (r.status === 404 || r.status === 403 || r.status === 410) {
                setTrouble(GONE);
                setLoaded(true);
                return;
            }
            if (!r.ok) {
                setTrouble(TROUBLE);
                setLoaded(true);
                return;
            }
            const j = (await r.json()) as ResolveJson;
            const v = j.view ?? null;
            setView(v);
            setTrouble(null);

            if (v?.showsOptions) {
                const from = new Date();
                const to = new Date(from.getTime() + 21 * 24 * 60 * 60 * 1000);
                const sr = await fetch(
                    api(`/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
                );
                if (sr.ok) {
                    const sj = (await sr.json()) as SlotsJson;
                    setSlots(sj.slots ?? []);
                }
                // A slots failure is not fatal: the parent still sees where they are
                // and can reply to the message.
            } else {
                setSlots([]);
            }
        } catch {
            setTrouble(TROUBLE);
        } finally {
            setLoaded(true);
        }
    }, [api]);

    useEffect(() => {
        void load();
    }, [load]);

    const act = async (action: TourParentAction) => {
        if (busy) return;
        setBusy(true);
        setTrouble(null);
        try {
            let path: string;
            let body: Record<string, unknown> | null = null;

            switch (action.intent) {
                case "book":
                    if (!pick) {
                        setBusy(false);
                        return;
                    }
                    path = "/book";
                    body = { rule_id: pick.ruleId, start_at: pick.startAt, end_at: pick.endAt, timezone: pick.timezone };
                    break;
                case "reschedule":
                    if (!pick) {
                        // Reschedule needs a new time; reveal the list rather than posting.
                        setView((v) => (v ? { ...v, showsOptions: true } : v));
                        await loadSlots();
                        setBusy(false);
                        return;
                    }
                    path = "/reschedule";
                    body = { start_at: pick.startAt, end_at: pick.endAt, timezone: pick.timezone };
                    break;
                case "decline":
                    path = "/decline";
                    break;
                case "confirm":
                    path = "/confirm";
                    break;
                case "confirm_attendance":
                    path = "/confirm-attendance";
                    break;
                case "cancel": {
                    if (!confirmingCancel) {
                        // First press only REVEALS the consequence. Nothing is
                        // authorised and nothing is mutated until the parent confirms.
                        setConfirmingCancel(true);
                        setBusy(false);
                        return;
                    }
                    // Confirmed. Ask for the bounded, single-use credential, then use
                    // it — the message never carried one.
                    const intent = await fetch(api("/cancel-intent"), { method: "POST" });
                    if (!intent.ok) {
                        setTrouble(intent.status === 409 ? GONE : ACTION_TROUBLE);
                        setBusy(false);
                        return;
                    }
                    const ij = (await intent.json()) as { cancel_url?: string };
                    const url = String(ij.cancel_url ?? "");
                    if (!url) {
                        setTrouble(ACTION_TROUBLE);
                        setBusy(false);
                        return;
                    }
                    // The intent returns the parent-facing PAGE url; the mutation lives
                    // on the API path for that same credential.
                    const boundedToken = url.split("/").filter(Boolean).pop() ?? "";
                    const res2 = await fetch(
                        `/api/public/tour-booking/${encodeURIComponent(boundedToken)}/cancel`,
                        { method: "POST" }
                    );
                    if (!res2.ok && res2.status !== 409) {
                        setTrouble(ACTION_TROUBLE);
                        setBusy(false);
                        return;
                    }
                    setConfirmingCancel(false);
                    await load();
                    setBusy(false);
                    return;
                }
                default:
                    setBusy(false);
                    return;
            }

            const res = await fetch(api(path), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (res.status === 409) {
                let code = "";
                try {
                    const j = (await res.json()) as { code?: string };
                    code = String(j.code ?? "");
                } catch {
                    /* ignore */
                }
                if (code === "SLOT_UNAVAILABLE" && action.intent === "book") {
                    setTrouble(SLOT_GONE);
                    setPick(null);
                    await loadSlots();
                    return;
                }
                // Spent / already answered — re-read so a successful double-confirm
                // still lands on the confirmation state when the server allows it.
                setPick(null);
                await load();
                return;
            }

            if (!res.ok) {
                setTrouble(res.status === 404 || res.status === 403 ? GONE : ACTION_TROUBLE);
                return;
            }

            // The server owns the outcome. Re-read rather than guessing it here — that
            // is also what makes a duplicate submit harmless.
            setPick(null);
            await load();
        } catch {
            setTrouble(ACTION_TROUBLE);
        } finally {
            setBusy(false);
        }
    };

    // Confirm I'm coming links auto-affirm attendance on open (idempotent; once per mount).
    const autoAttendanceRan = useRef(false);
    useEffect(() => {
        if (!loaded || busy || autoAttendanceRan.current) return;
        if (view?.autoIntent !== "confirm_attendance") return;
        autoAttendanceRan.current = true;
        void act({ intent: "confirm_attendance", label: "Confirm I'm coming", tone: "primary" });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot auto intent
    }, [view?.autoIntent, loaded, busy]);

    const loadSlots = async () => {
        const from = new Date();
        const to = new Date(from.getTime() + 21 * 24 * 60 * 60 * 1000);
        const sr = await fetch(api(`/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`));
        if (sr.ok) {
            const sj = (await sr.json()) as SlotsJson;
            setSlots(sj.slots ?? []);
        }
    };

    if (!loaded) {
        return (
            <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
                <p className="text-sm text-alloy-midnight/50">Loading…</p>
            </main>
        );
    }

    if (!view) {
        return (
            <main className="mx-auto max-w-md space-y-3 p-6 pt-16">
                <h1 className="text-xl font-semibold text-alloy-midnight">
                    {trouble === SPENT ? "You\u2019ve already replied" : "We couldn\u2019t open this link"}
                </h1>
                <p className="text-[15px] leading-relaxed text-alloy-midnight/70">{trouble ?? GONE}</p>
            </main>
        );
    }

    const needsPick = view.actions.some((a) => a.intent === "book");
    const bookAction = view.actions.find((a) => a.intent === "book") ?? null;
    const otherActions = view.actions.filter((a) => a.intent !== "book");

    return (
        <main className="mx-auto max-w-md space-y-6 p-5 pb-16 pt-6">
            {/* Brandmark only — the wordmark carries "SERVICES", which is our
                internal org naming and means nothing to a parent booking a visit. */}
            <div className="flex items-center gap-2 pb-1">
                <Image src="/brand/alloy-brandmark-gradient.svg" alt="Alloy" width={28} height={28} className="h-7 w-7" priority />
                <span className="text-[15px] font-semibold tracking-tight text-alloy-midnight">Alloy</span>
            </div>

            <header className="space-y-1.5">
                <h1 className="text-2xl font-semibold leading-tight text-alloy-midnight">{view.headline}</h1>
                <p className="text-[15px] font-medium text-alloy-midnight/80">{view.locationLine}</p>
                {view.locationAddress ? (
                    <p className="text-[15px] text-alloy-midnight/60">{view.locationAddress}</p>
                ) : null}
            </header>

            <p className="text-[15px] leading-relaxed text-alloy-midnight/75">{view.bodyLine}</p>

            {view.bookingLabel && !view.showsOptions ? (
                <div className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/5 p-4">
                    <p className="text-[15px] font-semibold text-alloy-midnight">{view.bookingLabel}</p>
                </div>
            ) : null}

            {trouble ? (
                <p role="alert" className="rounded-lg bg-amber-50 p-3 text-[14px] leading-relaxed text-amber-900">
                    {trouble}
                </p>
            ) : null}

            {view.showsOptions ? (
                slots.length ? (
                    (() => {
                        // Group by the CENTRE's calendar day, not the device's.
                        const byDay = new Map<string, AvailableTourSlot[]>();
                        for (const s of slots) {
                            const k = tourSlotDayKey(s.startAt, s.timezone);
                            if (!k) continue;
                            const list = byDay.get(k) ?? [];
                            list.push(s);
                            byDay.set(k, list);
                        }
                        const available = [...byDay.keys()].sort();
                        if (!available.length) return null;
                        const activeDay = day && byDay.has(day) ? day : available[0];
                        const weeks = buildTourCalendarWeeks(activeDay);

                        return (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-alloy-midnight/10 bg-white p-3 shadow-sm">
                                    <p className="pb-2 text-center text-[14px] font-semibold text-alloy-midnight">
                                        {formatParentMonthLabel(activeDay)}
                                    </p>
                                    <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden>
                                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                                            <div key={`${d}-${i}`} className="text-center text-[11px] font-medium text-alloy-midnight/40">
                                                {d}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-1">
                                        {weeks.map((week, wi) => (
                                            <div key={wi} className="grid grid-cols-7 gap-1">
                                                {week.map((key, di) => {
                                                    if (!key) return <div key={di} />;
                                                    const has = byDay.has(key);
                                                    const isActive = key === activeDay;
                                                    const dayNum = Number(key.slice(8));
                                                    return (
                                                        <button
                                                            key={key}
                                                            type="button"
                                                            disabled={!has}
                                                            aria-pressed={isActive}
                                                            aria-label={formatParentDayLabel(key)}
                                                            onClick={() => {
                                                                setDay(key);
                                                                setPick(null);
                                                            }}
                                                            // 44px tap target — thumb-sized on a phone.
                                                            className={`flex h-11 w-full items-center justify-center rounded-xl text-[15px] transition ${
                                                                isActive
                                                                    ? "bg-alloy-bend-pine font-semibold text-white"
                                                                    : has
                                                                      ? "font-medium text-alloy-midnight hover:bg-alloy-bend-pine/[0.10]"
                                                                      : "text-alloy-midnight/25"
                                                            }`}
                                                        >
                                                            {dayNum}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[15px] font-medium text-alloy-midnight">{formatParentDayLabel(activeDay)}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(byDay.get(activeDay) ?? []).map((s) => {
                                            const chosen = pick?.startAt === s.startAt && pick?.ruleId === s.ruleId;
                                            return (
                                                <button
                                                    key={`${s.startAt}-${s.ruleId}`}
                                                    type="button"
                                                    aria-pressed={chosen}
                                                    onClick={() => setPick(chosen ? null : s)}
                                                    className={`rounded-xl border px-3 py-3.5 text-center text-[15px] font-medium transition ${
                                                        chosen
                                                            ? "border-alloy-bend-pine bg-alloy-bend-pine text-white shadow-sm"
                                                            : "border-alloy-midnight/15 bg-white text-alloy-midnight hover:border-alloy-bend-pine"
                                                    }`}
                                                >
                                                    {formatParentTimeOnly(s.startAt, s.timezone)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {pick && bookAction ? (
                                    <div className="space-y-3 rounded-2xl border border-alloy-midnight/10 bg-white p-4 shadow-sm">
                                        <div className="space-y-0.5">
                                            <p className="text-[15px] font-semibold text-alloy-midnight">
                                                {formatParentDayLabel(tourSlotDayKey(pick.startAt, pick.timezone) ?? activeDay)}
                                            </p>
                                            <p className="text-[15px] text-alloy-midnight/80">
                                                {formatParentTimeOnly(pick.startAt, pick.timezone)}
                                            </p>
                                            <p className="text-[15px] text-alloy-midnight/70">{view.locationLine}</p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void act(bookAction)}
                                            className="w-full rounded-xl bg-alloy-bend-pine px-4 py-3.5 text-[15px] font-semibold text-white transition disabled:opacity-40"
                                        >
                                            {bookAction.label}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })()
                ) : (
                    <p className="text-[15px] leading-relaxed text-alloy-midnight/70">
                        We don&rsquo;t have times available right now. Reply to our message and we&rsquo;ll find one for you.
                    </p>
                )
            ) : null}

            {confirmingCancel ? (
                <div className="space-y-3 rounded-2xl border border-alloy-midnight/10 bg-white p-4 shadow-sm">
                    <p className="text-[15px] font-semibold text-alloy-midnight">Cancel this tour?</p>
                    <p className="text-[15px] leading-relaxed text-alloy-midnight/75">
                        {view.bookingLabel
                            ? `We'll release your ${view.bookingLabel} visit at ${view.locationLine}, and the time may be taken by another family.`
                            : `We'll release your visit at ${view.locationLine}, and the time may be taken by another family.`}
                    </p>
                    <p className="text-[14px] leading-relaxed text-alloy-midnight/60">
                        You can always ask us for a new time later.
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act({ intent: "cancel", label: "Cancel tour", tone: "quiet" })}
                        className="w-full rounded-xl border border-alloy-bend-pine bg-white px-4 py-3.5 text-[15px] font-semibold text-[#007d68] transition disabled:opacity-40"
                    >
                        Yes, cancel my tour
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmingCancel(false)}
                        className="w-full rounded-xl bg-alloy-bend-pine px-4 py-3.5 text-[15px] font-semibold text-white transition disabled:opacity-40"
                    >
                        Keep my tour
                    </button>
                </div>
            ) : null}

            <div className="space-y-2.5 pt-1">
                {(confirmingCancel ? [] : otherActions).map((a) => {
                    const disabled = busy || (needsPick && a.intent === "book" && !pick);
                    const cls =
                        a.tone === "primary"
                            ? "bg-alloy-bend-pine text-white"
                            : a.tone === "secondary"
                              ? "border border-alloy-bend-pine/40 text-[#007d68]"
                              : "text-alloy-midnight/60";
                    return (
                        <button
                            key={a.intent}
                            type="button"
                            disabled={disabled}
                            onClick={() => void act(a)}
                            className={`w-full rounded-xl px-4 py-3.5 text-[15px] font-semibold transition disabled:opacity-40 ${cls}`}
                        >
                            {a.label}
                        </button>
                    );
                })}
            </div>

            {view.notice ? <p className="text-[14px] leading-relaxed text-alloy-midnight/55">{view.notice}</p> : null}
        </main>
    );
}
