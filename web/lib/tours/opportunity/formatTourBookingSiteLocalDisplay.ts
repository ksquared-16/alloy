import { formatInTimeZone } from "date-fns-tz";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

function resolveDisplayIana(timezoneIana: string | null | undefined): string {
    const t = typeof timezoneIana === "string" ? timezoneIana.trim() : "";
    return t && isValidIanaTimeZone(t) ? t : UTC_FALLBACK_IANA;
}

/**
 * Formats a booking instant in the booking row's IANA zone (site-local wall clock).
 * Does not use the browser or viewer timezone.
 */
export function formatTourBookingInstantSiteLocal(startAtIso: string, timezoneIana: string | null | undefined): string {
    const d = new Date(startAtIso);
    if (Number.isNaN(d.getTime())) return "—";
    const tz = resolveDisplayIana(timezoneIana);
    return formatInTimeZone(d, tz, "MM/dd/yyyy, h:mm a");
}
