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

import { useCallback, useEffect, useState } from "react";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import type { TourParentAction, TourParentView } from "@/lib/tours/public/tourParentView";
import { formatParentTourTime } from "@/lib/tours/public/tourParentView";

type ResolveJson = { ok?: boolean; view?: TourParentView };
type SlotsJson = { ok?: boolean; slots?: AvailableTourSlot[] };

/** One authored sentence per failure. The server's own wording never reaches here. */
const TROUBLE = "We couldn't load this page just now. Please try again in a moment, or reply to our message and we'll help.";
const ACTION_TROUBLE = "That didn't go through. Please try again, or reply to our message and we'll sort it out.";
const GONE = "This link is no longer active. Please reply to our message and we'll send you a new one.";
const SPENT = "Thanks — we already have your answer. If something doesn't look right, reply to our message and we'll sort it out.";

export default function TourBookingPublicClient({ token }: { token: string }) {
    const [view, setView] = useState<TourParentView | null>(null);
    const [slots, setSlots] = useState<AvailableTourSlot[]>([]);
    const [pick, setPick] = useState<AvailableTourSlot | null>(null);
    const [trouble, setTrouble] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);

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
                case "cancel":
                    path = "/cancel";
                    break;
            }

            const res = await fetch(api(path), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!res.ok && res.status !== 409) {
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

    return (
        <main className="mx-auto max-w-md space-y-6 p-5 pb-16 pt-10">
            <header className="space-y-1.5">
                <h1 className="text-2xl font-semibold leading-tight text-alloy-midnight">{view.headline}</h1>
                {view.childLine ? <p className="text-[15px] text-alloy-midnight/70">{view.childLine}</p> : null}
                <p className="text-[15px] font-medium text-alloy-midnight/80">{view.locationLine}</p>
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
                    <ul className="space-y-2">
                        {slots.map((s) => {
                            const chosen = pick?.startAt === s.startAt && pick?.ruleId === s.ruleId;
                            return (
                                <li key={`${s.startAt}-${s.ruleId}`}>
                                    <button
                                        type="button"
                                        aria-pressed={chosen}
                                        onClick={() => setPick(chosen ? null : s)}
                                        className={`w-full rounded-xl border px-4 py-3.5 text-left text-[15px] transition ${
                                            chosen
                                                ? "border-alloy-midnight bg-alloy-midnight text-white"
                                                : "border-alloy-stone/25 text-alloy-midnight hover:border-alloy-midnight/40"
                                        }`}
                                    >
                                        {formatParentTourTime(s.startAt, s.timezone) ?? ""}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="text-[15px] leading-relaxed text-alloy-midnight/70">
                        We don&rsquo;t have times available right now. Reply to our message and we&rsquo;ll find one for you.
                    </p>
                )
            ) : null}

            <div className="space-y-2.5 pt-1">
                {view.actions.map((a) => {
                    const disabled = busy || (needsPick && a.intent === "book" && !pick);
                    const cls =
                        a.tone === "primary"
                            ? "bg-alloy-midnight text-white"
                            : a.tone === "secondary"
                              ? "border border-alloy-midnight/30 text-alloy-midnight"
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

            <p className="pt-2 text-[13px] leading-relaxed text-alloy-midnight/45">
                No account is needed — this link is just for you.
            </p>
        </main>
    );
}
