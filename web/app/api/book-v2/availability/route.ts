import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
  addCalendarDaysInTimezone,
  computeCustomerMinBookableDateYmd,
  createInstantForLocalClock,
  formatYmdInTimezone,
} from "@/lib/booking/customerMinBookableDate";
import { resolvePublicBookingOperationalTimezoneIana } from "@/lib/book-v2/publicOrgOperationalTimezone";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

/** Inclusive calendar-day window from "today" in the booking timezone (90 days → offsets 0..89). */
const AVAILABILITY_CALENDAR_DAYS = 90;

/**
 * GET /api/book-v2/availability
 *
 * Returns available time slots for the next AVAILABILITY_CALENDAR_DAYS calendar days in the
 * requested timezone (weekdays only, after min bookable date).
 *
 * Query params:
 * - timezone: IANA timezone string (default: org from ALLOY_PUBLIC_ORG_ID, else UTC)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const paramTz = searchParams.get("timezone")?.trim();
    const defaultTz = await resolvePublicBookingOperationalTimezoneIana();
    let timezone = paramTz || defaultTz;
    if (!isValidIanaTimeZone(timezone)) {
      timezone = UTC_FALLBACK_IANA;
    }

    const slotDurationMinutes = 120; // 2 hours
    const bufferMinutes = 30; // 30 minutes buffer between bookings
    const slotIncrementMinutes = 30; // 30-minute increments

    const now = new Date();
    const minBookableDateStr = computeCustomerMinBookableDateYmd(timezone, now);
    const todayYmd = formatYmdInTimezone(now, timezone);
    const maxBookableDateStr = addCalendarDaysInTimezone(
      timezone,
      todayYmd,
      AVAILABILITY_CALENDAR_DAYS - 1
    );

    const slots: Array<{
      start: Date;
      end: Date;
      display: string;
      timeWindow: string;
      isoStart: string;
      isoEnd: string;
    }> = [];

    const getDayName = (date: Date): string => {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: timezone,
      })
        .format(date)
        .toLowerCase();
    };

    const formatTime = (date: Date): string => {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
        hour12: true,
      });
    };

    const isWeekday = (dayName: string): boolean =>
      ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(dayName);

    for (let dayOffset = 0; dayOffset < AVAILABILITY_CALENDAR_DAYS; dayOffset++) {
      const dayDateStr = addCalendarDaysInTimezone(timezone, todayYmd, dayOffset);

      if (dayDateStr < minBookableDateStr) {
        continue;
      }

      const [year, monthOneBased, day] = dayDateStr.split("-").map(Number);
      const monthIndex = monthOneBased - 1;
      const noonAnchor = createInstantForLocalClock(timezone, year, monthIndex, day, 12, 0);
      const dayName = getDayName(noonAnchor);
      if (!isWeekday(dayName)) {
        continue;
      }

      for (let hour = 8; hour <= 15; hour++) {
        for (let minute = 0; minute < 60; minute += slotIncrementMinutes) {
          if (hour === 15 && minute === 30) {
            continue;
          }
          const slotStart = createInstantForLocalClock(timezone, year, monthIndex, day, hour, minute);
          const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60 * 1000);

          const startTimeStr = formatTime(slotStart);
          const endTimeStr = formatTime(slotEnd);
          const timeWindow = `${startTimeStr} - ${endTimeStr}`;

          slots.push({
            start: slotStart,
            end: slotEnd,
            display: startTimeStr,
            timeWindow,
            isoStart: slotStart.toISOString(),
            isoEnd: slotEnd.toISOString(),
          });
        }
      }
    }

    const supabase = createAdminClient();
    const scheduleHorizonMs = (AVAILABILITY_CALENDAR_DAYS + 2) * 24 * 60 * 60 * 1000;
    const { data: existingSchedules, error: scheduleError } = await supabase
      .from("schedules")
      .select("start_at, end_at")
      .gte("start_at", now.toISOString())
      .lte("start_at", new Date(now.getTime() + scheduleHorizonMs).toISOString());

    if (scheduleError) {
      console.error("[BOOK_V2_AVAILABILITY] Error fetching schedules:", scheduleError);
    }

    const availableSlots = slots.filter((slot) => {
      if (!existingSchedules || existingSchedules.length === 0) {
        return true;
      }

      return !existingSchedules.some((existing) => {
        const existingStart = new Date(existing.start_at);
        const existingEnd = new Date(existing.end_at);

        const bufferedStart = new Date(existingStart.getTime() - bufferMinutes * 60 * 1000);
        const bufferedEnd = new Date(existingEnd.getTime() + bufferMinutes * 60 * 1000);

        return (
          (slot.start >= bufferedStart && slot.start < bufferedEnd) ||
          (slot.end > bufferedStart && slot.end <= bufferedEnd) ||
          (slot.start <= bufferedStart && slot.end >= bufferedEnd)
        );
      });
    });

    return NextResponse.json({
      ok: true,
      slots: availableSlots,
      count: availableSlots.length,
      timezone,
      min_bookable_date: minBookableDateStr,
      max_bookable_date: maxBookableDateStr,
      availability_calendar_days: AVAILABILITY_CALENDAR_DAYS,
    });
  } catch (error: unknown) {
    console.error("[BOOK_V2_AVAILABILITY_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch availability",
      },
      { status: 500 }
    );
  }
}
