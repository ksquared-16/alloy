import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
  computeCustomerMinBookableDateYmd,
  createInstantForLocalClock,
} from "@/lib/booking/customerMinBookableDate";

/**
 * GET /api/book-v2/availability
 *
 * Returns available time slots for the next 30 days.
 *
 * Query params:
 * - timezone: IANA timezone string (default: America/Los_Angeles)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timezone = searchParams.get("timezone") || "America/Los_Angeles";

    const slotDurationMinutes = 120; // 2 hours
    const bufferMinutes = 30; // 30 minutes buffer between bookings
    const slotIncrementMinutes = 30; // 30-minute increments
    const daysAhead = 30;

    const now = new Date();
    const minBookableDateStr = computeCustomerMinBookableDateYmd(timezone, now);

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

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
      const targetDate = new Date(now);
      targetDate.setUTCDate(targetDate.getUTCDate() + dayOffset);
      targetDate.setUTCHours(12, 0, 0, 0);

      const dateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(targetDate);

      const year = parseInt(dateParts.find((p) => p.type === "year")!.value);
      const month = parseInt(dateParts.find((p) => p.type === "month")!.value) - 1;
      const day = parseInt(dateParts.find((p) => p.type === "day")!.value);

      const dayDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(targetDate);

      if (dayDateStr < minBookableDateStr) {
        continue;
      }

      const dayName = getDayName(targetDate);
      if (!isWeekday(dayName)) {
        continue;
      }

      for (let hour = 8; hour <= 15; hour++) {
        for (let minute = 0; minute < 60; minute += slotIncrementMinutes) {
          if (hour === 15 && minute === 30) {
            continue;
          }
          const slotStart = createInstantForLocalClock(timezone, year, month, day, hour, minute);
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
    const { data: existingSchedules, error: scheduleError } = await supabase
      .from("schedules")
      .select("start_at, end_at")
      .gte("start_at", now.toISOString())
      .lte("start_at", new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString());

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
