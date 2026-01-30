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

        // MVP: Hardcoded working hours
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
        const minimumLeadTimeHours = 12;
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

        // Helper to get day name
        const getDayName = (date: Date): keyof typeof workingHours => {
            const day = date.getDay();
            const days: (keyof typeof workingHours)[] = [
                "sunday",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
            ];
            return days[day];
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

        // Generate slots for each day
        for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
            const dayDate = new Date(now);
            dayDate.setDate(dayDate.getDate() + dayOffset);
            dayDate.setHours(0, 0, 0, 0);

            const dayName = getDayName(dayDate);
            const hours = workingHours[dayName];

            if (!hours) continue; // Skip closed days

            // Check minimum lead time
            const minStartTime = new Date(now);
            minStartTime.setHours(minStartTime.getHours() + minimumLeadTimeHours);

            // Generate slots for this day
            let slotStart = new Date(dayDate);
            slotStart.setHours(hours.start, 0, 0, 0);

            while (slotStart.getHours() < hours.end) {
                const slotEnd = new Date(slotStart);
                slotEnd.setMinutes(slotEnd.getMinutes() + slotDurationMinutes);

                // Check if slot is in the past or before minimum lead time
                if (slotStart >= minStartTime && slotEnd <= new Date(dayDate.getTime() + 24 * 60 * 60 * 1000)) {
                    const startTimeStr = formatTime(slotStart);
                    const endTimeStr = formatTime(slotEnd);
                    const timeWindow = `${startTimeStr} - ${endTimeStr}`;

                    slots.push({
                        start: new Date(slotStart),
                        end: new Date(slotEnd),
                        display: startTimeStr,
                        timeWindow,
                        isoStart: slotStart.toISOString(),
                        isoEnd: slotEnd.toISOString(),
                    });
                }

                // Move to next slot
                slotStart.setMinutes(slotStart.getMinutes() + slotIncrementMinutes);
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

