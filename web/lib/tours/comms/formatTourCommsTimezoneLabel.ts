import { isValidIanaTimeZone } from "@/lib/admin/timezoneContract";

/**
 * Parent-friendly timezone label for email copy. Returns empty when unavailable
 * (callers should omit redundant timezone lines when tour_display_label is local).
 */
export function formatTourCommsTimezoneLabel(timezoneIana: string | null | undefined): string {
    const tz = String(timezoneIana ?? "").trim();
    if (!tz || !isValidIanaTimeZone(tz)) return "";
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            timeZoneName: "longGeneric",
        }).formatToParts(new Date());
        const label = parts.find((p) => p.type === "timeZoneName")?.value?.trim();
        if (label && !label.includes("/")) return label;
    } catch {
        /* fall through */
    }
    return "";
}
