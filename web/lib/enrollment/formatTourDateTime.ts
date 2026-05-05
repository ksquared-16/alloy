import { fromZonedTime } from "date-fns-tz";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

function resolveDisplayTz(iana?: string | null): string {
    const t = typeof iana === "string" ? iana.trim() : "";
    return t && isValidIanaTimeZone(t) ? t : UTC_FALLBACK_IANA;
}

/**
 * Enrollment tour preview: `tour_date` (YYYY-MM-DD) + optional `tour_time` (HH:MM 24h).
 * When `displayTimeZoneIana` is set, date/time are interpreted as wall time in that zone (org/user operational view).
 * When omitted, formatting matches the historical client-local style (no explicit IANA; not recommended for Admin).
 */
export function formatTourDateTime(
    tourDateRaw: unknown,
    tourTimeRaw: unknown,
    opts?: { displayTimeZoneIana?: string | null }
): { display: string; hasDate: boolean; hasTime: boolean } {
    const tourDate = typeof tourDateRaw === "string" ? tourDateRaw.trim() : "";
    const tourTime = typeof tourTimeRaw === "string" ? tourTimeRaw.trim() : "";
    const tz = resolveDisplayTz(opts?.displayTimeZoneIana ?? null);

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tourDate);
    if (!dateMatch) {
        return { display: "—", hasDate: false, hasTime: false };
    }
    const y = Number(dateMatch[1]);
    const mo = Number(dateMatch[2]);
    const d = Number(dateMatch[3]);

    const timeMatch24 = /^(\d{1,2}):(\d{2})$/.exec(tourTime);
    let hh = 12;
    let mm = 0;
    let hasTime = false;
    if (timeMatch24) {
        hh = Math.min(23, Math.max(0, Number(timeMatch24[1])));
        mm = Math.min(59, Math.max(0, Number(timeMatch24[2])));
        hasTime = true;
    } else if (tourTime) {
        const m = /^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$/.exec(tourTime.replace(/\s+/g, ""));
        if (m) {
            let h = Number(m[1]);
            const minutes = Number(m[2]);
            const ap = m[3].toUpperCase();
            if (ap === "P" && h !== 12) h += 12;
            if (ap === "A" && h === 12) h = 0;
            hh = Math.min(23, Math.max(0, h));
            mm = Math.min(59, Math.max(0, minutes));
            hasTime = true;
        }
    }

    const anchorH = hasTime ? hh : 12;
    const anchorM = hasTime ? mm : 0;
    const wallAsUtcFields = new Date(Date.UTC(y, mo - 1, d, anchorH, anchorM, 0));
    const instant = fromZonedTime(wallAsUtcFields, tz);

    const dateFmt: Intl.DateTimeFormatOptions = {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: tz,
    };
    const dateStr = new Intl.DateTimeFormat("en-US", dateFmt).format(instant);
    if (!hasTime) {
        return { display: dateStr, hasDate: true, hasTime: false };
    }
    const withTime = new Intl.DateTimeFormat("en-US", {
        ...dateFmt,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: tz,
    }).format(instant);
    return { display: withTime, hasDate: true, hasTime: true };
}
