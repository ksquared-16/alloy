/**
 * Platform presentation date formatting — display surfaces only.
 *
 * Doctrine: `docs/system/typography-and-presentation-doctrine.md`
 *
 * Input / editable fields may continue using MM-DD-YYYY or picker formatting.
 * Do not use these formatters for audit-trail parity (`formatDateUtcAudit`).
 */

import { UTC_FALLBACK_IANA, isValidIanaTimeZone } from "@/lib/admin/timezoneContract";

export type PresentationDateFormatOptions = {
    /** IANA timezone for operator display. Defaults to UTC for stable server–client parity on date-only queue fields. */
    timeZone?: string;
    /** Reference instant for Today / Yesterday / year omission. Defaults to `Date.now()`. */
    nowMs?: number;
};

function resolveTimeZone(iana?: string): string {
    const t = (iana ?? UTC_FALLBACK_IANA).trim();
    return t && isValidIanaTimeZone(t) ? t : UTC_FALLBACK_IANA;
}

function toDate(value: string | number | Date): Date | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    const ms = typeof value === "number" ? value : Date.parse(String(value).trim());
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse common operator / queue date inputs into a Date + time flag. */
export function parsePresentationDateInput(value: string | number | Date): { date: Date; hasTime: boolean } | null {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        const hasTime =
            value.getUTCHours() !== 0 ||
            value.getUTCMinutes() !== 0 ||
            value.getUTCSeconds() !== 0 ||
            value.getUTCMilliseconds() !== 0;
        return { date: value, hasTime };
    }

    const t = String(value).trim();
    if (!t) return null;

    const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/.exec(t);
    if (slash) {
        const month = Number(slash[1]);
        const day = Number(slash[2]);
        const year = Number(slash[3]);
        const rest = slash[4]?.trim();
        if (rest && /\d{1,2}:\d{2}/.test(rest)) {
            const ms = Date.parse(`${month}/${day}/${year} ${rest}`);
            if (Number.isFinite(ms)) return { date: new Date(ms), hasTime: true };
        }
        const date = new Date(Date.UTC(year, month - 1, day));
        if (!Number.isNaN(date.getTime())) return { date, hasTime: false };
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        const iso = t.includes("T") ? t : `${t}T00:00:00.000Z`;
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return null;
        const hasTime =
            /T\d{2}:\d{2}/.test(t) &&
            (date.getUTCHours() !== 0 ||
                date.getUTCMinutes() !== 0 ||
                date.getUTCSeconds() !== 0 ||
                date.getUTCMilliseconds() !== 0);
        return { date, hasTime };
    }

    const monthDay = /^([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:\s*,?\s*(.+))?$/i.exec(t);
    if (monthDay) {
        const monthStr = monthDay[1]!;
        const day = Number(monthDay[2]);
        const year = monthDay[3] ? Number(monthDay[3]) : new Date().getUTCFullYear();
        const rest = monthDay[4]?.trim();
        const monthIndex = new Date(Date.parse(`${monthStr} 1, ${year}`)).getUTCMonth();
        if (!Number.isNaN(monthIndex)) {
            let hours = 0;
            let minutes = 0;
            let hasTime = false;
            if (rest) {
                const timeMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(rest);
                if (timeMatch) {
                    hasTime = true;
                    let h = Number(timeMatch[1]);
                    minutes = Number(timeMatch[2]);
                    const ampm = timeMatch[3]!.toUpperCase();
                    if (ampm === "PM" && h !== 12) h += 12;
                    if (ampm === "AM" && h === 12) h = 0;
                    hours = h;
                }
            }
            const date = new Date(Date.UTC(year, monthIndex, day, hours, minutes));
            if (!Number.isNaN(date.getTime())) return { date, hasTime };
        }
    }

    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) return null;
    const date = new Date(ms);
    const hasTime = /\d{1,2}:\d{2}/.test(t);
    return { date, hasTime };
}

function formatMonthDayYear(
    d: Date,
    timeZone: string,
    opts?: { includeYear?: boolean; referenceYear?: number },
): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: opts?.includeYear ? "numeric" : undefined,
        timeZone,
    }).formatToParts(d);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    const year = parts.find((p) => p.type === "year")?.value ?? "";
    if (opts?.includeYear) return `${month} ${day}, ${year}`;
    return `${month} ${day}`;
}

function formatCompactTime(d: Date, timeZone: string, includeMinutesWhenZero = false): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone,
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM").toUpperCase();
    if (!includeMinutesWhenZero && minute === "00") return `${hour} ${dayPeriod}`;
    return `${hour}:${minute} ${dayPeriod}`;
}

function calendarDayKey(d: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
    }).format(d);
}

function referenceYear(nowMs: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).formatToParts(new Date(nowMs));
    return Number(parts.find((p) => p.type === "year")?.value ?? new Date(nowMs).getUTCFullYear());
}

function shouldIncludeYear(d: Date, nowMs: number, timeZone: string): boolean {
    const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).formatToParts(d);
    const y = Number(parts.find((p) => p.type === "year")?.value ?? 0);
    return y !== referenceYear(nowMs, timeZone);
}

/**
 * General display date — `Jan 13, 2024`, `Jun 15, 2026`.
 * Never `YYYY-MM-DD` or `MM-DD-YYYY` on operator surfaces.
 */
export function formatDisplayDate(
    value: string | number | Date | null | undefined,
    opts?: PresentationDateFormatOptions,
): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parsePresentationDateInput(value);
    const d = parsed?.date ?? toDate(value);
    if (!d) return String(value).trim();
    const tz = resolveTimeZone(opts?.timeZone);
    return formatMonthDayYear(d, tz, { includeYear: true });
}

/**
 * Drawer / summary display datetime — `Jan 13, 2024 · 2:30 PM`.
 */
export function formatDisplayDateTime(
    value: string | number | Date | null | undefined,
    opts?: PresentationDateFormatOptions,
): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parsePresentationDateInput(value);
    if (!parsed) {
        const d = toDate(value);
        if (!d) return String(value).trim();
        return formatDisplayDate(d, opts);
    }
    const tz = resolveTimeZone(opts?.timeZone);
    const datePart = formatMonthDayYear(parsed.date, tz, { includeYear: true });
    if (!parsed.hasTime) return datePart;
    return `${datePart} · ${formatCompactTime(parsed.date, tz, true)}`;
}

/**
 * Activity timestamps — `Today • 9:12 AM`, `Yesterday • 4:35 PM`, `Jun 15, 2026 • 2:15 PM`.
 */
export function formatActivityTimestamp(
    value: string | number | Date | null | undefined,
    opts?: PresentationDateFormatOptions,
): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parsePresentationDateInput(value);
    const d = parsed?.date ?? toDate(value);
    if (!d) return String(value).trim();

    const tz = resolveTimeZone(opts?.timeZone);
    const nowMs = opts?.nowMs ?? Date.now();
    const todayKey = calendarDayKey(new Date(nowMs), tz);
    const yesterdayKey = calendarDayKey(new Date(nowMs - 86_400_000), tz);
    const eventKey = calendarDayKey(d, tz);

    let dateLabel: string;
    if (eventKey === todayKey) dateLabel = "Today";
    else if (eventKey === yesterdayKey) dateLabel = "Yesterday";
    else dateLabel = formatMonthDayYear(d, tz, { includeYear: shouldIncludeYear(d, nowMs, tz) });

    if (!parsed?.hasTime) return dateLabel;
    return `${dateLabel} • ${formatCompactTime(d, tz, true)}`;
}

/**
 * Task due dates — `Tue, Jan 1 • 9 AM`, `Wed, Jun 15 • 2 PM`.
 */
export function formatTaskDueDate(
    value: string | number | Date | null | undefined,
    opts?: PresentationDateFormatOptions,
): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parsePresentationDateInput(value);
    const d = parsed?.date ?? toDate(value);
    if (!d) return String(value).trim();

    const tz = resolveTimeZone(opts?.timeZone);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(d);
    const nowMs = opts?.nowMs ?? Date.now();
    const datePart = formatMonthDayYear(d, tz, { includeYear: shouldIncludeYear(d, nowMs, tz) });
    const prefix = `${weekday}, ${datePart}`;
    if (!parsed?.hasTime) return prefix;
    return `${prefix} • ${formatCompactTime(d, tz, false)}`;
}

/**
 * Queue row compact dates — `Jan 15`, `Jun 22, 2026` (year when necessary).
 * Pair with configured field labels (`Created`, `Tour`, `Start`) in the renderer.
 */
export function formatQueueRowDateCompact(
    value: string | number | Date | null | undefined,
    opts?: PresentationDateFormatOptions,
): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parsePresentationDateInput(value);
    const d = parsed?.date ?? toDate(value);
    if (!d) return String(value).trim();

    const tz = resolveTimeZone(opts?.timeZone);
    const nowMs = opts?.nowMs ?? Date.now();
    return formatMonthDayYear(d, tz, { includeYear: shouldIncludeYear(d, nowMs, tz) });
}

/** Queue row date/event column — compact date; optional time segment when present in source. */
export function formatQueueRecordDateDisplay(
    value: string | number | Date | null | undefined,
    opts?: PresentationDateFormatOptions,
): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parsePresentationDateInput(value);
    if (!parsed) return String(value).trim();
    const tz = resolveTimeZone(opts?.timeZone);
    const nowMs = opts?.nowMs ?? Date.now();
    const datePart = formatQueueRowDateCompact(parsed.date, { timeZone: tz, nowMs });
    if (!parsed.hasTime) return datePart;
    return `${datePart} · ${formatCompactTime(parsed.date, tz, true)}`;
}
