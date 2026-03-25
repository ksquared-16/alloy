/**
 * Customer-facing SMS datetime: MM/DD/YYYY h:mm AM/PM in the given IANA timezone.
 * Uses en-US 12-hour clock; avoids raw ISO strings in SMS.
 */
export function formatSmsDateTime(isoUtc: string | null | undefined, timeZone: string): string {
    const z = String(timeZone ?? "").trim() || "UTC";
    const d = isoUtc ? new Date(isoUtc) : new Date();
    if (Number.isNaN(d.getTime())) return "";

    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: z,
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
    const parts = fmt.formatToParts(d);
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const month = pick("month");
    const day = pick("day");
    const year = pick("year");
    const hour = pick("hour");
    let minute = pick("minute");
    const dayPeriod = pick("dayPeriod").toUpperCase();
    if (minute.length === 1) minute = `0${minute}`;
    return `${month}/${day}/${year} ${hour}:${minute} ${dayPeriod}`;
}
