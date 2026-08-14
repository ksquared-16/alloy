import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import type { TourCommsChannel, TourCommsConfig, TourCommsQuietHoursConfig, TourReminderOffset } from "@/lib/tours/comms/tourCommsConfig";
import {
    evaluateTourAutomationConditions,
    type TourAutomationConditionFacts,
} from "@/lib/tours/comms/tourCommsAutomationConditions";
import type { TourBookingStatusKey } from "@/lib/tours/bookings/types";

export type TourReminderSuppressionReason =
    | "booking_terminal"
    | "booking_not_eligible"
    | "comms_disabled"
    | "channel_disabled"
    | "conditions_not_met"
    | "past"
    | "after_tour_start"
    | "too_close_to_start"
    | "quiet_hours_past_tour"
    | "quiet_hours_still_past";

export type TourReminderTimingResult =
    | { ok: true; scheduledFor: Date; quietHoursAdjusted: boolean }
    | { ok: false; reason: TourReminderSuppressionReason };

const REMINDER_ELIGIBLE_STATUS_KEYS = new Set<TourBookingStatusKey>(["confirmed", "rescheduled"]);

const TERMINAL_STATUS_KEYS = new Set<TourBookingStatusKey>(["canceled", "completed", "no_show"]);

function parseHHmm(hhmm: string): { h: number; m: number } | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, m: min };
}

function minutesOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

export function resolveTourReminderTimezone(input: {
    bookingTimezone: string | null | undefined;
    orgTimezoneIana?: string | null;
    quietHoursTimezoneSource: TourCommsQuietHoursConfig["timezone_source"];
}): string {
    if (input.quietHoursTimezoneSource === "org") {
        const orgTz = String(input.orgTimezoneIana ?? "").trim();
        if (orgTz && isValidIanaTimeZone(orgTz)) return orgTz;
    }
    const bookingTz = String(input.bookingTimezone ?? "").trim();
    if (bookingTz && isValidIanaTimeZone(bookingTz)) return bookingTz;
    const orgTz = String(input.orgTimezoneIana ?? "").trim();
    if (orgTz && isValidIanaTimeZone(orgTz)) return orgTz;
    return UTC_FALLBACK_IANA;
}

/** Whether booking status allows new reminder rows. */
export function isTourBookingEligibleForReminders(statusKey: string): boolean {
    return REMINDER_ELIGIBLE_STATUS_KEYS.has(String(statusKey ?? "").trim() as TourBookingStatusKey);
}

export function isTourBookingTerminalForReminders(statusKey: string): boolean {
    return TERMINAL_STATUS_KEYS.has(String(statusKey ?? "").trim() as TourBookingStatusKey);
}

export function isInstantInQuietHours(instant: Date, timezoneIana: string, quiet: TourCommsQuietHoursConfig): boolean {
    if (!quiet.enabled) return false;
    const start = parseHHmm(quiet.start);
    const end = parseHHmm(quiet.end);
    if (!start || !end) return false;

    const tz = isValidIanaTimeZone(timezoneIana) ? timezoneIana : UTC_FALLBACK_IANA;
    const local = toZonedTime(instant, tz);
    const mins = minutesOfDay(local);
    const startMins = start.h * 60 + start.m;
    const endMins = end.h * 60 + end.m;

    if (startMins < endMins) {
        return mins >= startMins && mins < endMins;
    }
    return mins >= startMins || mins < endMins;
}

/**
 * Defer a reminder out of quiet hours. Supports overnight windows and `next_morning` policy.
 */
export function deferTourReminderFromQuietHours(
    scheduledFor: Date,
    timezoneIana: string,
    quiet: TourCommsQuietHoursConfig
): Date {
    if (!quiet.enabled || !isInstantInQuietHours(scheduledFor, timezoneIana, quiet)) {
        return scheduledFor;
    }

    const tz = isValidIanaTimeZone(timezoneIana) ? timezoneIana : UTC_FALLBACK_IANA;
    const morning = parseHHmm(quiet.next_morning_time) ?? { h: 8, m: 0 };
    const end = parseHHmm(quiet.end) ?? { h: 8, m: 0 };

    const local = toZonedTime(scheduledFor, tz);
    const localMins = minutesOfDay(local);
    const endMins = end.h * 60 + end.m;

    const targetLocal = new Date(local);
    targetLocal.setSeconds(0, 0);
    targetLocal.setMilliseconds(0);
    targetLocal.setHours(morning.h, morning.m, 0, 0);

    if (localMins < endMins) {
        return fromZonedTime(targetLocal, tz);
    }

    targetLocal.setDate(targetLocal.getDate() + 1);
    return fromZonedTime(targetLocal, tz);
}

export function computeTourReminderInstant(input: {
    tourStartAtIso: string;
    offsetMinutes: number;
}): Date | null {
    const startMs = Date.parse(input.tourStartAtIso);
    if (Number.isNaN(startMs)) return null;
    const off = Math.max(0, Math.floor(input.offsetMinutes));
    return new Date(startMs - off * 60 * 1000);
}

export function evaluateTourReminderScheduledTime(input: {
    tourStartAtIso: string;
    offsetMinutes: number;
    config: Pick<TourCommsConfig, "min_reminder_lead_minutes" | "quiet_hours">;
    bookingTimezone: string;
    orgTimezoneIana?: string | null;
    now: Date;
}): TourReminderTimingResult {
    const raw = computeTourReminderInstant({
        tourStartAtIso: input.tourStartAtIso,
        offsetMinutes: input.offsetMinutes,
    });
    if (!raw) return { ok: false, reason: "past" };

    const startMs = Date.parse(input.tourStartAtIso);
    const nowMs = input.now.getTime();
    const minLeadMs = Math.max(0, input.config.min_reminder_lead_minutes) * 60 * 1000;

    if (raw.getTime() <= nowMs) {
        return { ok: false, reason: "past" };
    }
    if (raw.getTime() >= startMs) {
        return { ok: false, reason: "after_tour_start" };
    }
    if (startMs - raw.getTime() < minLeadMs) {
        return { ok: false, reason: "too_close_to_start" };
    }

    const tz = resolveTourReminderTimezone({
        bookingTimezone: input.bookingTimezone,
        orgTimezoneIana: input.orgTimezoneIana,
        quietHoursTimezoneSource: input.config.quiet_hours.timezone_source,
    });

    const beforeQuiet = raw.getTime();
    const adjusted = deferTourReminderFromQuietHours(raw, tz, input.config.quiet_hours);
    const quietHoursAdjusted = adjusted.getTime() !== beforeQuiet;

    if (adjusted.getTime() <= nowMs) {
        return { ok: false, reason: quietHoursAdjusted ? "quiet_hours_still_past" : "past" };
    }
    if (adjusted.getTime() >= startMs) {
        return { ok: false, reason: "quiet_hours_past_tour" };
    }
    if (startMs - adjusted.getTime() < minLeadMs) {
        return { ok: false, reason: "too_close_to_start" };
    }

    return { ok: true, scheduledFor: adjusted, quietHoursAdjusted };
}

export type TourReminderSchedulePlan =
    | {
          kind: "schedule";
          channel: TourCommsChannel;
          reminderKey: string;
          offsetMinutes: number;
          scheduledForIso: string;
          quietHoursAdjusted: boolean;
      }
    | {
          kind: "suppressed";
          channel: TourCommsChannel;
          reminderKey: string;
          offsetMinutes: number;
          reason: TourReminderSuppressionReason;
      };

export function buildTourReminderSchedulePlans(input: {
    tourStartAtIso: string;
    bookingStatusKey: string;
    bookingTimezone: string;
    config: TourCommsConfig;
    orgTimezoneIana?: string | null;
    now: Date;
    /** Opportunity/booking facts for automation_conditions_v1 (AND). */
    conditionFacts?: TourAutomationConditionFacts | null;
}): TourReminderSchedulePlan[] {
    if (isTourBookingTerminalForReminders(input.bookingStatusKey)) {
        return [];
    }
    if (!isTourBookingEligibleForReminders(input.bookingStatusKey)) {
        return [];
    }
    if (!input.config.enabled) {
        return [];
    }

    const conditions = input.config.automation_conditions_v1 ?? [];
    if (conditions.length > 0) {
        const facts = input.conditionFacts ?? {};
        if (!evaluateTourAutomationConditions(conditions, facts).pass) {
            const plans: TourReminderSchedulePlan[] = [];
            for (const offset of input.config.reminder_offsets) {
                for (const channel of offset.channels) {
                    plans.push({
                        kind: "suppressed",
                        channel,
                        reminderKey: offset.reminder_key,
                        offsetMinutes: offset.offset_minutes,
                        reason: "conditions_not_met",
                    });
                }
            }
            return plans;
        }
    }

    const plans: TourReminderSchedulePlan[] = [];

    for (const offset of input.config.reminder_offsets) {
        for (const channel of offset.channels) {
            if (!input.config.channels[channel]) {
                plans.push({
                    kind: "suppressed",
                    channel,
                    reminderKey: offset.reminder_key,
                    offsetMinutes: offset.offset_minutes,
                    reason: "channel_disabled",
                });
                continue;
            }

            const timing = evaluateTourReminderScheduledTime({
                tourStartAtIso: input.tourStartAtIso,
                offsetMinutes: offset.offset_minutes,
                config: input.config,
                bookingTimezone: input.bookingTimezone,
                orgTimezoneIana: input.orgTimezoneIana,
                now: input.now,
            });

            if (!timing.ok) {
                plans.push({
                    kind: "suppressed",
                    channel,
                    reminderKey: offset.reminder_key,
                    offsetMinutes: offset.offset_minutes,
                    reason: timing.reason,
                });
                continue;
            }

            plans.push({
                kind: "schedule",
                channel,
                reminderKey: offset.reminder_key,
                offsetMinutes: offset.offset_minutes,
                scheduledForIso: timing.scheduledFor.toISOString(),
                quietHoursAdjusted: timing.quietHoursAdjusted,
            });
        }
    }

    return plans;
}

export function filterEnabledTourReminderOffsets(config: TourCommsConfig): TourReminderOffset[] {
    return config.reminder_offsets.filter((o) => o.offset_minutes > 0 && o.reminder_key.trim() !== "");
}
