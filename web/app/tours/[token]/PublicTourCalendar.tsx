"use client";

/**
 * Step one of a school's public tour journey: pick a day, then a time (S7).
 *
 * The same month grid, day keys and 12-hour labels as the invitation surface
 * (`tourParentView`), over the same canonical availability — this is a second VIEW of one
 * slot engine, not a second calendar. Every time is the school's wall time in its own zone;
 * the family's device zone is never used.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    buildTourCalendarWeeks,
    formatParentDayLabel,
    formatParentMonthLabel,
    formatParentTimeOnly,
    isTourMonthInPast,
    shiftTourMonthKey,
    tourMonthAnchorDay,
    tourMonthKeyOf,
    tourMonthSlotsWindow,
    tourSlotDayKey,
} from "@/lib/tours/public/tourParentView";
import type { PublicTourSlot } from "@/lib/tours/publicCalendar/publicTourCalendarServer";

export type PublicTourPick = { startAt: string; endAt: string; timezone: string };

type SlotsJson = { ok?: boolean; slots?: PublicTourSlot[] };

const TROUBLE = "We couldn't load available times just now. Please try again in a moment.";

function zoneName(timezone: string): string {
    try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "long" }).formatToParts(new Date());
        return parts.find((p) => p.type === "timeZoneName")?.value ?? timezone;
    } catch {
        return timezone;
    }
}

export default function PublicTourCalendar({
    token,
    timezone,
    locationLabel,
    selected,
    onPick,
}: {
    token: string;
    timezone: string;
    locationLabel: string;
    /** The time already chosen (kept when the family comes back from step two). */
    selected: PublicTourPick | null;
    onPick: (pick: PublicTourPick) => void;
}) {
    const [slots, setSlots] = useState<PublicTourSlot[]>([]);
    const [loadedMonths, setLoadedMonths] = useState<string[]>([]);
    const [monthBusy, setMonthBusy] = useState(false);
    const [trouble, setTrouble] = useState<string | null>(null);
    const [month, setMonth] = useState<string | null>(null);
    const [day, setDay] = useState<string | null>(selected ? tourSlotDayKey(selected.startAt, selected.timezone) : null);
    const [pick, setPick] = useState<PublicTourPick | null>(selected);

    const byDay = useMemo(() => {
        const m = new Map<string, PublicTourSlot[]>();
        for (const s of slots) {
            const k = tourSlotDayKey(s.start_at, s.timezone);
            if (!k) continue;
            const list = m.get(k) ?? [];
            list.push(s);
            m.set(k, list);
        }
        for (const list of m.values()) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
        return m;
    }, [slots]);
    const availableDays = useMemo(() => [...byDay.keys()].sort(), [byDay]);

    const todayKey = tourSlotDayKey(new Date().toISOString(), timezone) ?? new Date().toISOString().slice(0, 10);
    const displayedMonth =
        month ?? (day ? tourMonthKeyOf(day) : null) ?? (availableDays.length ? tourMonthKeyOf(availableDays[0]!) : null) ?? tourMonthKeyOf(todayKey);

    const loadMonth = useCallback(
        async (monthKey: string) => {
            const { from, to } = tourMonthSlotsWindow(monthKey);
            setMonthBusy(true);
            try {
                const r = await fetch(
                    `/api/public/tours/${encodeURIComponent(token)}/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
                );
                if (r.ok) {
                    const j = (await r.json()) as SlotsJson;
                    const incoming = j.slots ?? [];
                    setSlots((prev) => {
                        const seen = new Set(prev.map((x) => `${x.start_at}|${x.end_at}`));
                        const merged = [...prev];
                        for (const x of incoming) {
                            const k = `${x.start_at}|${x.end_at}`;
                            if (seen.has(k)) continue;
                            seen.add(k);
                            merged.push(x);
                        }
                        return merged;
                    });
                    setTrouble(null);
                } else {
                    setTrouble(TROUBLE);
                }
            } catch {
                setTrouble(TROUBLE);
            } finally {
                setLoadedMonths((prev) => (prev.includes(monthKey) ? prev : [...prev, monthKey]));
                setMonthBusy(false);
            }
        },
        [token]
    );

    useEffect(() => {
        if (loadedMonths.includes(displayedMonth)) return;
        void loadMonth(displayedMonth);
    }, [displayedMonth, loadedMonths, loadMonth]);

    // The soonest open day is preselected once; browsing months afterwards selects nothing.
    const preselected = useRef(Boolean(selected));
    useEffect(() => {
        if (preselected.current || day || !availableDays.length) return;
        preselected.current = true;
        setDay(availableDays[0]!);
    }, [availableDays, day]);

    const activeDay = day && byDay.has(day) ? day : null;
    const weeks = buildTourCalendarWeeks(tourMonthAnchorDay(displayedMonth));
    const prevMonth = shiftTourMonthKey(displayedMonth, -1);
    const canGoBack = !isTourMonthInPast(prevMonth);
    const monthLoaded = loadedMonths.includes(displayedMonth);
    const monthHasTimes = availableDays.some((d) => tourMonthKeyOf(d) === displayedMonth);
    const times = activeDay ? (byDay.get(activeDay) ?? []) : [];
    const pickStillListed = pick ? slots.some((s) => s.start_at === pick.startAt && s.end_at === pick.endAt) : false;

    return (
        <div className="space-y-4" data-testid="public-tour-calendar">
            <p className="text-[13px] text-alloy-midnight/60" data-testid="public-tour-timezone">
                Times are shown in {zoneName(timezone)}, {locationLabel}&rsquo;s local time.
            </p>

            {trouble ? (
                <p role="alert" className="rounded-lg bg-amber-50 p-3 text-[14px] leading-relaxed text-amber-900">
                    {trouble}
                </p>
            ) : null}

            <div className="rounded-2xl border border-alloy-midnight/10 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between pb-2">
                    <button
                        type="button"
                        disabled={!canGoBack}
                        aria-label="Previous month"
                        onClick={() => setMonth(prevMonth)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-[18px] leading-none text-alloy-midnight transition hover:bg-participant-accent/[0.10] disabled:pointer-events-none disabled:text-alloy-midnight/20"
                    >
                        <span aria-hidden>&lsaquo;</span>
                    </button>
                    <p aria-live="polite" className="text-center text-[14px] font-semibold text-alloy-midnight">
                        {formatParentMonthLabel(tourMonthAnchorDay(displayedMonth))}
                    </p>
                    <button
                        type="button"
                        aria-label="Next month"
                        onClick={() => setMonth(shiftTourMonthKey(displayedMonth, 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-[18px] leading-none text-alloy-midnight transition hover:bg-participant-accent/[0.10]"
                    >
                        <span aria-hidden>&rsaquo;</span>
                    </button>
                </div>
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
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        disabled={!has}
                                        aria-pressed={isActive}
                                        aria-label={formatParentDayLabel(key)}
                                        data-day={key}
                                        onClick={() => {
                                            setDay(key);
                                            setPick(null);
                                        }}
                                        className={`flex h-11 w-full items-center justify-center rounded-xl text-[15px] transition ${
                                            isActive
                                                ? "bg-participant-accent font-semibold text-participant-on-accent"
                                                : has
                                                  ? "font-medium text-alloy-midnight hover:bg-participant-accent/[0.10]"
                                                  : "text-alloy-midnight/25"
                                        }`}
                                    >
                                        {Number(key.slice(8))}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
                {monthLoaded && !monthHasTimes && !trouble ? (
                    <p className="pt-2 text-center text-[13px] leading-relaxed text-alloy-midnight/55">
                        No tour times available this month. Try another month.
                    </p>
                ) : null}
                {monthBusy && !monthLoaded ? <p className="pt-2 text-center text-[13px] text-alloy-midnight/45">Loading times…</p> : null}
            </div>

            {activeDay ? (
                <div className="space-y-2">
                    <p className="text-[15px] font-medium text-alloy-midnight">{formatParentDayLabel(activeDay)}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="public-tour-times">
                        {times.map((s) => {
                            const chosen = pick?.startAt === s.start_at && pick?.endAt === s.end_at;
                            return (
                                <button
                                    key={`${s.start_at}-${s.end_at}`}
                                    type="button"
                                    aria-pressed={chosen}
                                    data-start={s.start_at}
                                    onClick={() => setPick(chosen ? null : { startAt: s.start_at, endAt: s.end_at, timezone: s.timezone })}
                                    className={`rounded-xl border px-3 py-3.5 text-center text-[15px] font-medium transition ${
                                        chosen
                                            ? "border-participant-accent bg-participant-accent text-participant-on-accent shadow-sm"
                                            : "border-alloy-midnight/15 bg-white text-alloy-midnight hover:border-participant-accent"
                                    }`}
                                >
                                    {formatParentTimeOnly(s.start_at, s.timezone)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : monthLoaded && !availableDays.length && !trouble ? (
                <p className="text-[15px] leading-relaxed text-alloy-midnight/70">
                    There are no tour times available right now. Please check back soon.
                </p>
            ) : null}

            {pick && (pickStillListed || !monthLoaded) ? (
                <div className="space-y-3 rounded-2xl border border-alloy-midnight/10 bg-white p-4 shadow-sm">
                    <div className="space-y-0.5">
                        <p className="text-[15px] font-semibold text-alloy-midnight">
                            {formatParentDayLabel(tourSlotDayKey(pick.startAt, pick.timezone) ?? "")}
                        </p>
                        <p className="text-[15px] text-alloy-midnight/80">{formatParentTimeOnly(pick.startAt, pick.timezone)}</p>
                        <p className="text-[15px] text-alloy-midnight/70">{locationLabel}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onPick(pick)}
                        data-testid="public-tour-continue"
                        className="w-full rounded-xl bg-participant-accent px-4 py-3.5 text-[15px] font-semibold text-participant-on-accent transition sm:w-auto sm:px-8"
                    >
                        Continue
                    </button>
                </div>
            ) : null}
        </div>
    );
}
