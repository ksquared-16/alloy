import { describe, expect, it } from "vitest";

import { DEFAULT_TOUR_COMMS_CONFIG } from "@/lib/tours/comms/tourCommsConfig";
import {
    buildTourReminderSchedulePlans,
    computeTourReminderInstant,
    deferTourReminderFromQuietHours,
    evaluateTourReminderScheduledTime,
    isInstantInQuietHours,
    isTourBookingEligibleForReminders,
    resolveTourReminderTimezone,
} from "@/lib/tours/comms/tourReminderTiming";

const enabledConfig = {
    ...DEFAULT_TOUR_COMMS_CONFIG,
    enabled: true,
    channels: { email: true, sms: true },
};

describe("tourReminderTiming", () => {
    it("schedules configured offsets (24h + 2h example — multi-timer via config, not one column)", () => {
        const tourStart = "2026-06-16T12:00:00.000Z";
        const now = new Date("2026-06-14T00:00:00.000Z");
        const config = {
            ...enabledConfig,
            quiet_hours: { ...enabledConfig.quiet_hours, enabled: false },
            reminder_offsets: [
                { reminder_key: "tour_reminder_24h", offset_minutes: 24 * 60, channels: ["email" as const] },
                { reminder_key: "tour_reminder_2h", offset_minutes: 2 * 60, channels: ["email" as const] },
            ],
        };

        const plans = buildTourReminderSchedulePlans({
            tourStartAtIso: tourStart,
            bookingStatusKey: "confirmed",
            bookingTimezone: "UTC",
            config,
            now,
        });

        const sched = plans.filter((p) => p.kind === "schedule");
        expect(sched).toHaveLength(2);
        const byKey = Object.fromEntries(sched.map((p) => [p.reminderKey, p]));
        expect(byKey.tour_reminder_24h?.scheduledForIso).toBe("2026-06-15T12:00:00.000Z");
        expect(byKey.tour_reminder_2h?.scheduledForIso).toBe("2026-06-16T10:00:00.000Z");
    });

    it("suppresses reminders that would fire in the past", () => {
        const tourStart = "2026-06-16T12:00:00.000Z";
        const now = new Date("2026-06-16T11:30:00.000Z");

        const plans = buildTourReminderSchedulePlans({
            tourStartAtIso: tourStart,
            bookingStatusKey: "confirmed",
            bookingTimezone: "UTC",
            config: enabledConfig,
            now,
        });

        expect(plans.every((p) => p.kind === "suppressed")).toBe(true);
        expect(plans.some((p) => p.kind === "suppressed" && p.reason === "past")).toBe(true);
    });

    it("does not schedule reminders for canceled, completed, or no_show bookings", () => {
        for (const status of ["canceled", "completed", "no_show"] as const) {
            const plans = buildTourReminderSchedulePlans({
                tourStartAtIso: "2026-06-20T12:00:00.000Z",
                bookingStatusKey: status,
                bookingTimezone: "UTC",
                config: enabledConfig,
                now: new Date("2026-06-10T00:00:00.000Z"),
            });
            expect(plans).toHaveLength(0);
            expect(isTourBookingEligibleForReminders(status)).toBe(false);
        }
    });

    it("defers reminders in quiet hours to next morning local time", () => {
        const quiet = DEFAULT_TOUR_COMMS_CONFIG.quiet_hours;
        const tz = "America/Los_Angeles";
        const raw = new Date("2026-06-16T22:00:00-07:00");
        expect(isInstantInQuietHours(raw, tz, quiet)).toBe(true);

        const deferred = deferTourReminderFromQuietHours(raw, tz, quiet);
        expect(deferred.toISOString()).toBe(new Date("2026-06-17T08:00:00-07:00").toISOString());
    });

    it("applies quiet-hours deferral when evaluating reminder time", () => {
        const config = {
            ...enabledConfig,
            reminder_offsets: [{ reminder_key: "evening_before", offset_minutes: 16 * 60, channels: ["email"] as const }],
        };
        const tourStart = "2026-06-17T14:00:00-07:00";
        const now = new Date("2026-06-15T00:00:00.000Z");

        const timing = evaluateTourReminderScheduledTime({
            tourStartAtIso: tourStart,
            offsetMinutes: 16 * 60,
            config,
            bookingTimezone: "America/Los_Angeles",
            now,
        });

        expect(timing.ok).toBe(true);
        if (timing.ok) {
            expect(timing.quietHoursAdjusted).toBe(true);
            expect(timing.scheduledFor.toISOString()).toBe(new Date("2026-06-17T08:00:00-07:00").toISOString());
        }
    });

    it("falls back safely when booking timezone is invalid", () => {
        const tz = resolveTourReminderTimezone({
            bookingTimezone: "Not/A_Real_Zone",
            orgTimezoneIana: "America/New_York",
            quietHoursTimezoneSource: "booking",
        });
        expect(tz).toBe("America/New_York");

        const fallbackOnly = resolveTourReminderTimezone({
            bookingTimezone: "bogus",
            orgTimezoneIana: "also-bogus",
            quietHoursTimezoneSource: "booking",
        });
        expect(fallbackOnly).toBe("UTC");
    });

    it("computes raw offset instants from tour start", () => {
        const tourStart = "2026-06-16T12:00:00.000Z";
        expect(computeTourReminderInstant({ tourStartAtIso: tourStart, offsetMinutes: 24 * 60 })?.toISOString()).toBe(
            "2026-06-15T12:00:00.000Z"
        );
        expect(computeTourReminderInstant({ tourStartAtIso: tourStart, offsetMinutes: 2 * 60 })?.toISOString()).toBe(
            "2026-06-16T10:00:00.000Z"
        );
    });
});
