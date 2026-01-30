import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

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

        // MVP: Hardcoded working hours (in target timezone)
        const workingHours = {
            monday: { start: 9, end: 17 }, // 9am - 5pm
            tuesday: { start: 9, end: 17 },
            wednesday: { start: 9, end: 17 },
            thursday: { start: 9, end: 17 },
            friday: { start: 9, end: 17 },
            saturday: { start: 10, end: 14 }, // 10am - 2pm
            sunday: null, // Closed
        };

        const slotDurationMinutes = 120; // 2 hours
        const bufferMinutes = 30; // 30 minutes buffer between bookings
        const slotIncrementMinutes = 30; // 30-minute increments
        const minimumLeadTimeHours = 48; // 48 hours minimum lead time
        const daysAhead = 30;

        // Generate all potential slots for next 30 days
        const now = new Date();
        const slots: Array<{
            start: Date;
            end: Date;
            display: string;
            timeWindow: string;
            isoStart: string;
            isoEnd: string;
        }> = [];

        // Helper to get day name in timezone
        const getDayName = (date: Date): keyof typeof workingHours => {
            const day = new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                timeZone: timezone,
            }).format(date);
            return day.toLowerCase() as keyof typeof workingHours;
        };

        // Helper to format time in timezone
        const formatTime = (date: Date): string => {
            return date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: timezone,
                hour12: true,
            });
        };

        // Helper to create a Date representing a specific local time in target timezone
        // This finds the UTC Date that represents the given local time in the target timezone
        const createLocalTimeInTimezone = (year: number, month: number, day: number, hour: number, minute: number): Date => {
            // Start with a reasonable guess: create date as if it's UTC, then adjust
            // We'll use binary search approach
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
            
            // Start with UTC assumption
            let candidate = new Date(`${dateStr}Z`);
            
            // Refine by checking what time this represents in target timezone
            for (let i = 0; i < 10; i++) {
                const parts = new Intl.DateTimeFormat("en-US", {
                    timeZone: timezone,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }).formatToParts(candidate);
                
                const tzYear = parseInt(parts.find(p => p.type === "year")!.value);
                const tzMonth = parseInt(parts.find(p => p.type === "month")!.value) - 1;
                const tzDay = parseInt(parts.find(p => p.type === "day")!.value);
                const tzHour = parseInt(parts.find(p => p.type === "hour")!.value);
                const tzMinute = parseInt(parts.find(p => p.type === "minute")!.value);
                
                // Check if we match
                if (tzYear === year && tzMonth === month && tzDay === day && tzHour === hour && tzMinute === minute) {
                    break;
                }
                
                // Calculate the difference in milliseconds
                // Create two dates in the same "local" context to compare
                const targetLocal = new Date(year, month, day, hour, minute, 0);
                const tzLocal = new Date(tzYear, tzMonth, tzDay, tzHour, tzMinute, 0);
                const diffMs = targetLocal.getTime() - tzLocal.getTime();
                
                // Adjust candidate
                candidate = new Date(candidate.getTime() + diffMs);
                
                // Safety check to avoid infinite loops
                if (Math.abs(diffMs) < 1000) break;
            }
            
            return candidate;
        };

        // Minimum start time: 48 hours from now
        const minStartTime = new Date(now.getTime() + minimumLeadTimeHours * 60 * 60 * 1000);

        // Generate slots for each day
        for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
            // Get the date in target timezone
            const targetDate = new Date(now);
            targetDate.setUTCDate(targetDate.getUTCDate() + dayOffset);
            targetDate.setUTCHours(12, 0, 0, 0); // Use noon UTC to avoid DST edge cases
            
            // Get date parts in target timezone
            const dateParts = new Intl.DateTimeFormat("en-US", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).formatToParts(targetDate);
            
            const year = parseInt(dateParts.find(p => p.type === "year")!.value);
            const month = parseInt(dateParts.find(p => p.type === "month")!.value) - 1;
            const day = parseInt(dateParts.find(p => p.type === "day")!.value);
            
            const dayName = getDayName(targetDate);
            const hours = workingHours[dayName];

            if (!hours) continue; // Skip closed days

            // Generate slots for this day
            for (let hour = hours.start; hour < hours.end; hour++) {
                for (let minute = 0; minute < 60; minute += slotIncrementMinutes) {
                    const slotStart = createLocalTimeInTimezone(year, month, day, hour, minute);
                    const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60 * 1000);

                    // Check minimum lead time (48 hours from now)
                    if (slotStart >= minStartTime) {
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
        }

        // Fetch existing schedules from Supabase to check conflicts
        const supabase = createAdminClient();
        const { data: existingSchedules, error: scheduleError } = await supabase
            .from("schedules")
            .select("start_at, end_at")
            .gte("start_at", now.toISOString())
            .lte("start_at", new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString());

        if (scheduleError) {
            console.error("[BOOK_V2_AVAILABILITY] Error fetching schedules:", scheduleError);
            // Continue without filtering - better to show slots than fail
        }

        // Filter out conflicting slots
        const availableSlots = slots.filter((slot) => {
            if (!existingSchedules || existingSchedules.length === 0) {
                return true;
            }

            // Check if slot overlaps with any existing schedule (including buffer)
            return !existingSchedules.some((existing) => {
                const existingStart = new Date(existing.start_at);
                const existingEnd = new Date(existing.end_at);

                // Add buffer to existing schedule
                const bufferedStart = new Date(existingStart.getTime() - bufferMinutes * 60 * 1000);
                const bufferedEnd = new Date(existingEnd.getTime() + bufferMinutes * 60 * 1000);

                // Check for overlap
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
        });
    } catch (error: any) {
        console.error("[BOOK_V2_AVAILABILITY_ERROR]", error);
        return NextResponse.json(
            {
                ok: false,
                error: error.message || "Failed to fetch availability",
            },
            { status: 500 }
        );
    }
}
