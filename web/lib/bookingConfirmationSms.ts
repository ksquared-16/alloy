import { formatSmsDateTime } from "@/lib/formatSmsDateTime";
import { UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

export function resolveBookingSmsTimeZone(params: {
    scheduleTimezone?: string | null;
    contactTimezone?: string | null;
}): string {
    const st = String(params.scheduleTimezone ?? "").trim();
    if (st) return st;
    const ct = String(params.contactTimezone ?? "").trim();
    if (ct) return ct;
    const env = String(process.env.ALLOY_DEFAULT_BUSINESS_TIMEZONE ?? "").trim();
    if (env) return env;
    return UTC_FALLBACK_IANA;
}

/** Single outbound SMS body for booking confirmation + reschedule/cancel links (workflow can use this or template vars). */
export function buildBookingConfirmationSmsBody(params: {
    contactFirstName: string | null | undefined;
    formattedStartAt: string;
    shortRescheduleUrl: string;
    shortCancelUrl: string;
}): string {
    const name = String(params.contactFirstName ?? "").trim() || "there";
    const when = String(params.formattedStartAt ?? "").trim() || "your scheduled time";
    return `Hi ${name}, your cleaning is confirmed for ${when}. We’re finding the right professional to assign and will send an update shortly. Reschedule: ${params.shortRescheduleUrl} Cancel: ${params.shortCancelUrl}`;
}

export function formatBookingStartForSms(startAtIso: string | null | undefined, timeZone: string): string {
    return formatSmsDateTime(startAtIso, timeZone);
}
