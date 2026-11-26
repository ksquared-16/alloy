/**
 * HUMAN DATES FOR OPERATOR-FACING FINANCIALS (W7-F011).
 *
 * One vocabulary, never year-first:
 *
 *   single day        Oct 19, 2026
 *   calendar month    October 2026
 *   same-month span   Oct 12–25, 2026
 *   cross-month span  Oct 26–Nov 8, 2026
 *
 * Pure string arithmetic on `YYYY-MM-DD` — no time zone can move a calendar day. APIs and audit
 * payloads keep ISO; only what an operator reads goes through here.
 */
import { billingPeriodFromKey, intervalLabel } from "@/lib/financials/billingPeriod";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "Oct 19, 2026". Anything that is not a `YYYY-MM-DD` day is returned unchanged. */
export function humanDay(ymd: string | null | undefined): string {
    if (!ymd) return "—";
    const m = YMD.exec(ymd.trim());
    if (!m) return ymd;
    return `${MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}

/** "Oct 19" — for a day whose year the surrounding text already states. */
export function humanDayNoYear(ymd: string): string {
    const m = YMD.exec(ymd.trim());
    if (!m) return ymd;
    return `${MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`;
}

/** "Wed" — the weekday of a calendar day. */
export function weekdayShort(ymd: string): string {
    const m = YMD.exec(ymd.trim());
    if (!m) return "";
    return WEEKDAYS_SHORT[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()] ?? "";
}

/**
 * An interval. A whole calendar month reads as the month ("October 2026"); anything else is a span.
 * An open end ("ongoing") reads as "From Oct 12, 2026".
 */
export function humanRange(start: string, end: string | null | undefined): string {
    if (!end) return `From ${humanDay(start)}`;
    if (!YMD.test(start) || !YMD.test(end)) return `${start} – ${end}`;
    const month = billingPeriodFromKey(start.slice(0, 7));
    if (month.start === start && month.end === end) return month.label;
    if (start === end) return humanDay(start);
    return intervalLabel(start, end);
}

/** Replace every embedded `YYYY-MM-DD` in an operator sentence with its human form. */
export function humanizeIsoDatesIn(text: string): string {
    return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => humanDay(iso));
}
