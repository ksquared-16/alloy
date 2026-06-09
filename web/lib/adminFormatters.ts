import { UTC_FALLBACK_IANA, isValidIanaTimeZone } from "@/lib/admin/timezoneContract";

/**
 * Shared formatting helpers for admin portal.
 * Use these for consistent date and currency display in tables and drawers.
 */

const usdOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
};

/** Format a value stored in cents as USD (value/100). */
export function formatMoneyFromCents(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num / 100);
}

/** Format a value already in dollars as USD (no conversion). */
export function formatMoneyFromDollars(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num);
}

/**
 * Format a value as USD.
 * Only treats as cents when fieldName ends with _cents (no special-case for quote_total etc).
 */
export function formatMoney(
    value: number | string | null | undefined,
    fieldName?: string
): string {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    const isCents = fieldName?.endsWith("_cents") ?? false;
    const dollars = isCents ? num / 100 : num;
    return new Intl.NumberFormat("en-US", usdOptions).format(dollars);
}

/**
 * Format payout_percent for display. Stored as decimal (0.7) -> show 70%.
 * If value is already 1–100, show as-is with %.
 */
export function formatPayoutPercent(value: number | string | null | undefined | unknown): string {
    if (value === null || value === undefined) return "—";
    const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return "—";
    const display = n > 0 && n <= 1 ? n * 100 : n;
    return `${display}%`;
}

/** MM-DD-YYYY in UTC — date-only queue/record preview (stable server–client). */
export function formatDateUsShortHyphenUtc(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const d = typeof value === "object" && value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(d.getTime())) {
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const yy = String(d.getUTCFullYear());
        return `${mm}-${dd}-${yy}`;
    }
    const s = String(value).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[2]}-${m[3]}-${m[1]}`;
    return s;
}

/**
 * MM-DD-YYYY + time in UTC (12-hour) — queue preview tour/datetime strings.
 * No timezone conversion beyond interpreting the instant as UTC for display.
 */
export function formatDateTimeUsShortHyphenUtc(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const d = typeof value === "object" && value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const datePart = formatDateUsShortHyphenUtc(d);
    const timePart = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
    }).format(d);
    return `${datePart} ${timePart}`;
}

/**
 * Normalize free-text queue preview lines: YYYY-MM-DD and MM/DD/YYYY tokens → MM-DD-YYYY.
 */
export function normalizePreviewLooseDateTokens(text: string): string {
    let s = text;
    s = s.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_full, mo: string, day: string, yr: string) => {
        return `${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}-${yr}`;
    });
    s = s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_full, yr: string, mo: string, day: string) => `${mo}-${day}-${yr}`);
    return s;
}

/**
 * Normalize tour/timing preview values to MM-DD-YYYY (optional UTC time segment).
 * Handles enrollment queue `Tour: MM/DD/YYYY …`, ISO date/datetime, and plain YYYY-MM-DD.
 */
export function formatQueuePreviewTourTimingUtc(value: string | null | undefined): string {
    const t = (value ?? "").trim();
    if (!t || t === "—" || t === "-") return "";
    const slashFull = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.*))?$/.exec(t);
    if (slashFull) {
        const mm = slashFull[1]!.padStart(2, "0");
        const dd = slashFull[2]!.padStart(2, "0");
        const yy = slashFull[3]!;
        const datePart = `${mm}-${dd}-${yy}`;
        const rest = slashFull[4]?.trim();
        return rest ? `${datePart} ${rest}` : datePart;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return formatDateUsShortHyphenUtc(t);
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) {
        const d = new Date(ms);
        const hasExplicitTime =
            /\d{1,2}:\d{2}/.test(t) ||
            (/[Tt]/.test(t) &&
                (d.getUTCHours() !== 0 ||
                    d.getUTCMinutes() !== 0 ||
                    d.getUTCSeconds() !== 0 ||
                    d.getUTCMilliseconds() !== 0));
        return hasExplicitTime ? formatDateTimeUsShortHyphenUtc(d) : formatDateUsShortHyphenUtc(d);
    }
    return normalizePreviewLooseDateTokens(t);
}

/** MM/DD/YYYY in UTC — audit trail parity / stable server–client comparison. */
export function formatDateUtcAudit(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(d as Date);
}

/** MM/DD/YYYY, h:mm A in UTC — audit trail parity / stable server–client comparison. */
export function formatDateTimeUtcAudit(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
    }).format(d as Date);
}

/** @deprecated Prefer formatDateUtcAudit. */
export function formatDate(value: string | number | Date | null | undefined): string {
    return formatDateUtcAudit(value);
}

function parseQueueRecordDateInput(value: string | number | Date): { date: Date; hasTime: boolean } | null {
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

/**
 * Queue row date/event display — MM-DD-YYYY; optional time segment.
 * Date only: "05-11-2026". Date + time: "05-11-2026 · 10:00 AM".
 */
export function formatQueueRecordDateDisplay(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parseQueueRecordDateInput(value);
    if (!parsed) {
        const tour = formatQueuePreviewTourTimingUtc(String(value).trim());
        if (!tour) return String(value).trim();
        const withTime = /^(\d{2}-\d{2}-\d{4})\s+(.+)$/.exec(tour);
        return withTime ? `${withTime[1]} · ${withTime[2]}` : tour;
    }

    const datePart = formatDateUsShortHyphenUtc(parsed.date);
    if (!parsed.hasTime) return datePart;

    const timePart = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
    }).format(parsed.date);

    return `${datePart} · ${timePart}`;
}

/** Format subscription cadence + interval as label, e.g. "Every 1 week", "Every 2 weeks", "Every 3 months". */
export function formatFrequencyLabel(cadence: string | null | undefined, interval: number | string | null | undefined): string {
    const c = (cadence ?? "month").toLowerCase();
    const n = Math.max(1, Number(interval) || 1);
    if (c === "week") return n === 1 ? "Every 1 week" : `Every ${n} weeks`;
    return n === 1 ? "Every 1 month" : `Every ${n} months`;
}

/** Format US phone for display: (541) 654-3217. Uses last 10 digits when country code 1 is present. */
export function formatPhoneUS(value: string | null | undefined): string {
    if (value == null || value === "") return "—";
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 10) return String(value).trim() || "—";
    const area = digits.slice(-10, -7);
    const mid = digits.slice(-7, -4);
    const last = digits.slice(-4);
    return `(${area}) ${mid}-${last}`;
}

/** Format US phone for editable inputs; empty string when no value. */
export function formatPhoneUSForEdit(value: string | null | undefined): string {
    if (value == null || String(value).trim() === "") return "";
    const formatted = formatPhoneUS(value);
    return formatted === "—" ? String(value).trim() : formatted;
}

/** @deprecated Prefer formatDateTimeUtcAudit. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
    return formatDateTimeUtcAudit(value);
}

function resolveDisplayTimeZone(iana: string): string {
    const t = (iana ?? "").trim();
    return t && isValidIanaTimeZone(t) ? t : UTC_FALLBACK_IANA;
}

/** User-facing date in resolved profile/org timezone (explicit IANA — not browser default). */
export function formatDateForUserDisplay(
    value: string | number | Date | null | undefined,
    timeZoneIana: string
): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    const tz = resolveDisplayTimeZone(timeZoneIana);
    try {
        return new Intl.DateTimeFormat("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
            timeZone: tz,
        }).format(d as Date);
    } catch {
        return formatDateUtcAudit(d);
    }
}

/** User-facing datetime in resolved profile/org timezone (explicit IANA — not browser default). */
export function formatDateTimeForUserDisplay(
    value: string | number | Date | null | undefined,
    timeZoneIana: string
): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    const tz = resolveDisplayTimeZone(timeZoneIana);
    try {
        return new Intl.DateTimeFormat("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: tz,
        }).format(d as Date);
    } catch {
        return formatDateTimeUtcAudit(d);
    }
}

/**
 * System-default timezone (often browser local on the client). Avoid for Timezone Contract v1;
 * prefer formatDateTimeForUserDisplay with resolved profile/org IANA.
 */
export function formatDateTimeLocal(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    const s = new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(d as Date);
    return s.replace(",", "").replace(/\s+/g, " ").trim();
}

/** Recurrence unit values for dropdowns (stored lowercase). */
export const RECURRENCE_UNIT_OPTIONS = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "quarter", label: "Quarter" },
    { value: "year", label: "Year" },
] as const;

/**
 * Format (recurrence_unit, recurrence_interval) for display.
 * e.g. week/1 → "Weekly", month/1 → "Monthly", quarter/1 → "Quarterly", year/1 → "Annually".
 */
export function formatRecurrenceLabel(unit: string | null, interval: number | null): string | null {
    if (!unit || interval == null || interval < 1) return null;
    const i = Math.max(1, Number(interval) || 1);
    const u = unit.toLowerCase();
    if (u === "day" && i === 1) return "Daily";
    if (u === "day") return `Every ${i} days`;
    if (u === "week" && i === 1) return "Weekly";
    if (u === "week") return `Every ${i} weeks`;
    if (u === "month" && i === 1) return "Monthly";
    if (u === "month") return `Every ${i} months`;
    if (u === "quarter" && i === 1) return "Quarterly";
    if (u === "quarter") return `Every ${i} quarters`;
    if (u === "year" && i === 1) return "Annually";
    if (u === "year") return `Every ${i} years`;
    return `${i} ${u}(s)`;
}

/**
 * Display name for a person/contact: full_name if set, otherwise first_name + last_name, otherwise "—".
 * Use wherever full_name may be null but first_name/last_name exist to avoid blank names.
 */
export function personDisplayName(o: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
} | null | undefined): string {
    if (!o) return "—";
    const full = (o.full_name as string | null | undefined)?.trim();
    if (full) return full;
    const parts = [o.first_name, o.last_name].filter(Boolean).map((s) => String(s).trim());
    return parts.length ? parts.join(" ") : "—";
}

/**
 * Schedule drawer title: `4/30/26 · 430p` / `4/30/26 · 8a` using schedule timezone when provided.
 */
export function formatScheduleDrawerHeaderTitle(iso: string | null | undefined, timeZone?: string | null): string {
    if (iso == null || String(iso).trim() === "") return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const tz = timeZone && String(timeZone).trim() ? String(timeZone).trim() : undefined;
    const dateParts = new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        timeZone: tz,
    }).formatToParts(d);
    const month = dateParts.find((p) => p.type === "month")?.value ?? "";
    const day = dateParts.find((p) => p.type === "day")?.value ?? "";
    const year = dateParts.find((p) => p.type === "year")?.value ?? "";
    const dateStr = `${month}/${day}/${year}`;

    const tp = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: tz,
    }).formatToParts(d);
    const hourRaw = tp.find((p) => p.type === "hour")?.value ?? "12";
    const minRaw = tp.find((p) => p.type === "minute")?.value ?? "00";
    const dayPeriod = (tp.find((p) => p.type === "dayPeriod")?.value ?? "am").toLowerCase();
    const isPm = dayPeriod.startsWith("p");
    let hour12 = parseInt(hourRaw, 10);
    if (Number.isNaN(hour12)) hour12 = 12;
    if (hour12 === 0) hour12 = 12;
    const minNum = parseInt(minRaw, 10);
    const suffix = isPm ? "p" : "a";
    let timeCompact: string;
    if (!Number.isNaN(minNum) && minNum === 0) {
        timeCompact = `${hour12}${suffix}`;
    } else {
        const mm = Number.isNaN(minNum) ? "00" : String(minNum).padStart(2, "0");
        timeCompact = `${hour12}${mm}${suffix}`;
    }
    return `${dateStr} · ${timeCompact}`;
}
