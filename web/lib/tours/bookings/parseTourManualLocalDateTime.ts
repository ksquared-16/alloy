import { addMinutes } from "date-fns";
import { toDate } from "date-fns-tz";

import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

export type ParseTourManualLocalDateTimeInput = {
    tourDate: string;
    tourTime: string;
    timezoneIana: string;
    durationMinutes?: number;
};

export type ParseTourManualLocalDateTimeResult = {
    startAt: Date;
    endAt: Date;
    timezone: string;
};

function resolveTimezone(timezoneIana: string): string {
    const tz = String(timezoneIana ?? "").trim();
    return tz && isValidIanaTimeZone(tz) ? tz : UTC_FALLBACK_IANA;
}

/**
 * Interpret HTML `date` / `time` inputs as wall clock in the booking location timezone.
 * Stored instants remain UTC; mirror/drawer labels derive from start_at + timezone.
 */
export function parseTourManualLocalDateTime(input: ParseTourManualLocalDateTimeInput): ParseTourManualLocalDateTimeResult {
    const tourDate = String(input.tourDate ?? "").trim();
    const tourTime = String(input.tourTime ?? "").trim();
    const tz = resolveTimezone(input.timezoneIana);
    const durationMinutes = Number.isFinite(Number(input.durationMinutes)) && Number(input.durationMinutes) > 0
        ? Math.floor(Number(input.durationMinutes))
        : 60;

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tourDate);
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(tourTime);
    if (!dateMatch || !timeMatch) {
        throw new RangeError("tour_date (YYYY-MM-DD) and tour_time (HH:MM) required");
    }

    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        throw new RangeError("tour_time out of range");
    }

    const wall = `${tourDate}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
    const startAt = toDate(wall, { timeZone: tz });
    if (Number.isNaN(startAt.getTime())) {
        throw new RangeError("invalid manual tour local date/time");
    }
    const endAt = addMinutes(startAt, durationMinutes);
    return { startAt, endAt, timezone: tz };
}
