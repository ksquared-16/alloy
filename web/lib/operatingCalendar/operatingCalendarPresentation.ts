/**
 * How the Operating Calendar is said to an operator. Pure. Dates are the
 * location's calendar dates and times are its wall clock on a 12-hour clock —
 * formatted WITHOUT converting through any zone, so nothing depends on the
 * browser.
 */

import type { OperatingCalendarEffect } from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import type { MinuteInterval } from "@/lib/operatingCalendar/resolveOperatingCalendar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(ymd: string) {
    const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { y, m, d, weekday };
}

/** "Thu, Dec 24, 2026" */
export function formatCalendarDate(ymd: string): string {
    const p = parts(ymd);
    return `${WEEKDAYS[p.weekday]}, ${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

/** "Thu, Dec 24 – Sat, Dec 26, 2026", or a single date. */
export function formatCalendarDateRange(fromYmd: string, toYmd: string): string {
    if (!toYmd || fromYmd === toYmd) return formatCalendarDate(fromYmd);
    const a = parts(fromYmd);
    const b = parts(toYmd);
    const left = `${WEEKDAYS[a.weekday]}, ${MONTHS[a.m - 1]} ${a.d}${a.y !== b.y ? `, ${a.y}` : ""}`;
    return `${left} – ${formatCalendarDate(toYmd)}`;
}

export function calendarDayCount(fromYmd: string, toYmd: string): number {
    return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000) + 1;
}

/** 540 → "9:00 AM"; 1440 → "midnight". */
export function formatWallMinutes(minutes: number): string {
    if (minutes >= 1440) return "midnight";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const suffix = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatWallTime(hhmm: string | null | undefined): string {
    if (!hhmm) return "";
    if (hhmm === "24:00") return "midnight";
    const [h, m] = hhmm.split(":").map(Number) as [number, number];
    return formatWallMinutes(h * 60 + m);
}

export const EFFECT_LABEL: Record<OperatingCalendarEffect, string> = {
    none: "No change to operation",
    closed: "Closed all day",
    partial_closure: "Closed part of the day",
    modified_hours: "Modified hours",
    open_as_usual: "Open as usual",
};

export function describeEntryEffect(effect: string, startTime: string | null, endTime: string | null): string {
    if (effect === "partial_closure") return `Closed ${formatWallTime(startTime)} – ${formatWallTime(endTime)}`;
    if (effect === "modified_hours") return `Open ${formatWallTime(startTime)} – ${formatWallTime(endTime)}`;
    return EFFECT_LABEL[effect as OperatingCalendarEffect] ?? effect;
}

export function describeDayState(state: { status: string; openIntervals: MinuteInterval[] | null }): string {
    if (state.status === "unresolved") return "Cannot be determined";
    if (state.status === "closed") return "Closed";
    if (state.openIntervals == null) return "Ordinary hours";
    return `Open ${state.openIntervals.map((iv) => `${formatWallMinutes(iv.start)} – ${formatWallMinutes(iv.end)}`).join(", ")}`;
}
