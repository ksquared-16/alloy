import { addMinutes, addDays, isAfter, isBefore } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { TOUR_BOOKING_BLOCKING_STATUS_KEYS } from "@/lib/tours/constants";
import type {
    AvailableTourSlot,
    TourAvailabilityRuleRow,
    TourBookingOverlapRow,
} from "@/lib/tours/availability/types";

const BLOCKING = new Set<string>(TOUR_BOOKING_BLOCKING_STATUS_KEYS);

/** ISO weekday 1=Mon … 7=Sun → 0=Sun … 6=Sat (matches DB `day_of_week`). */
export function dayOfWeekSun0FromUtc(utc: Date, timeZone: string): number {
    const iso = Number(formatInTimeZone(utc, timeZone, "i"));
    if (!Number.isFinite(iso) || iso < 1 || iso > 7) {
        throw new RangeError(`Invalid weekday from formatInTimeZone: ${iso}`);
    }
    return iso === 7 ? 0 : iso;
}

export function parsePgTimeToParts(t: string): { hours: number; minutes: number; seconds: number } {
    const s = String(t).trim();
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) {
        throw new RangeError(`Invalid time string: ${t}`);
    }
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    const seconds = m[3] != null ? Number(m[3]) : 0;
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new RangeError(`Invalid time parts: ${t}`);
    }
    return { hours, minutes, seconds };
}

/**
 * Wall-clock instant on a calendar day in `timeZone` (same-day window only; no overnight rules).
 */
function wallInstantOnYmd(
    ymd: string,
    timeZone: string,
    parts: { hours: number; minutes: number; seconds: number }
): Date {
    const { hours, minutes, seconds } = parts;
    const wall = `${ymd}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return toDate(wall, { timeZone });
}

function effectiveLocationIdForRule(rule: TourAvailabilityRuleRow, filterLocationId: string): string {
    return rule.location_id != null && String(rule.location_id).trim() !== "" ? String(rule.location_id) : filterLocationId;
}

function ruleMatchesUserFilter(rule: TourAvailabilityRuleRow, filterUserId: string | null | undefined): boolean {
    if (filterUserId == null || String(filterUserId).trim() === "") return true;
    const fu = String(filterUserId).trim();
    if (rule.user_id == null || String(rule.user_id).trim() === "") return true;
    return String(rule.user_id).trim() === fu;
}

function overlapsHalfOpen(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return isBefore(aStart, bEnd) && isAfter(aEnd, bStart);
}

function countOverlappingBlockingBookings(
    bookings: TourBookingOverlapRow[],
    locationId: string,
    slotStart: Date,
    slotEnd: Date,
    excludeBookingId?: string | null
): number {
    let n = 0;
    for (const b of bookings) {
        if (excludeBookingId != null && b.id === excludeBookingId) continue;
        if (String(b.location_id) !== String(locationId)) continue;
        if (!BLOCKING.has(String(b.status_key))) continue;
        const bs = new Date(b.start_at);
        const be = new Date(b.end_at);
        if (overlapsHalfOpen(slotStart, slotEnd, bs, be)) n += 1;
    }
    return n;
}

/**
 * Pure availability: expand active rules into half-open UTC slots `[startAt, endAt)`,
 * apply buffer as **end-to-next-start** between generated slots, drop trailing partials,
 * enforce `max_bookings_per_slot` using blocking bookings only.
 */
export function computeSlotsFromRulesAndBookings(
    rules: TourAvailabilityRuleRow[],
    bookings: TourBookingOverlapRow[],
    params: {
        locationId: string;
        userId?: string | null;
        fromUtc: Date;
        toUtc: Date;
        /** When rescheduling, ignore this booking id in overlap counts. */
        excludeBookingId?: string | null;
    }
): AvailableTourSlot[] {
    const { locationId, userId, fromUtc, toUtc, excludeBookingId } = params;
    const slots: AvailableTourSlot[] = [];

    const activeRules = rules.filter((r) => r.is_active !== false);

    for (const rule of activeRules) {
        if (!ruleMatchesUserFilter(rule, userId)) continue;
        const tz = String(rule.timezone || "").trim();
        if (!tz) continue;

        const slotLoc = effectiveLocationIdForRule(rule, locationId);
        if (String(slotLoc) !== String(locationId)) continue;

        const startParts = parsePgTimeToParts(rule.start_time);
        const endParts = parsePgTimeToParts(rule.end_time);

        const startYmd = formatInTimeZone(fromUtc, tz, "yyyy-MM-dd");
        const endYmd = formatInTimeZone(toUtc, tz, "yyyy-MM-dd");

        let ymd = startYmd;
        for (;;) {
            if (ymd > endYmd) break;

            const anchorNoon = toDate(`${ymd}T12:00:00`, { timeZone: tz });
            if (dayOfWeekSun0FromUtc(anchorNoon, tz) !== rule.day_of_week) {
                ymd = formatInTimeZone(addDays(toDate(`${ymd}T12:00:00`, { timeZone: tz }), 1), tz, "yyyy-MM-dd");
                continue;
            }

            const windowStart = wallInstantOnYmd(ymd, tz, startParts);
            const windowEnd = wallInstantOnYmd(ymd, tz, endParts);

            if (!isBefore(windowStart, windowEnd)) {
                ymd = formatInTimeZone(addDays(toDate(`${ymd}T12:00:00`, { timeZone: tz }), 1), tz, "yyyy-MM-dd");
                continue;
            }

            let cursor = windowStart;
            const duration = rule.slot_duration_minutes;
            const buffer = rule.buffer_minutes;
            const maxPer = rule.max_bookings_per_slot;

            for (;;) {
                const slotEnd = addMinutes(cursor, duration);
                if (isAfter(slotEnd, windowEnd)) {
                    break;
                }

                if (isBefore(cursor, fromUtc)) {
                    cursor = addMinutes(slotEnd, buffer);
                    continue;
                }
                if (isAfter(cursor, toUtc)) {
                    break;
                }

                const used = countOverlappingBlockingBookings(bookings, slotLoc, cursor, slotEnd, excludeBookingId);
                const remaining = Math.max(0, maxPer - used);
                if (remaining > 0) {
                    slots.push({
                        startAt: cursor.toISOString(),
                        endAt: slotEnd.toISOString(),
                        timezone: tz,
                        remainingCapacity: remaining,
                        capacity: maxPer,
                        ruleId: rule.id,
                        locationId: slotLoc,
                        userId: rule.user_id != null && String(rule.user_id).trim() !== "" ? String(rule.user_id) : null,
                    });
                }

                cursor = addMinutes(slotEnd, buffer);
            }

            ymd = formatInTimeZone(addDays(toDate(`${ymd}T12:00:00`, { timeZone: tz }), 1), tz, "yyyy-MM-dd");
        }
    }

    slots.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.ruleId.localeCompare(b.ruleId));
    return offerEachTimeOnce(slots, new Map(activeRules.map((r) => [r.id, r])));
}

/**
 * Two rules covering the same time (two schedules, an org-wide and a site rule, a hand-made copy)
 * used to list that time twice. It is one time at one site: offer it once.
 *
 * Bookings already share one overlap count, so the merged slot's room is the most generous rule's
 * (the same limit `offeredSlotCapacity` and the database guard apply). The rule the booking is
 * attributed to is the STRICTER one — an approval-required rule wins over an auto-confirm one,
 * so merging can never turn a time that needs staff approval into an auto-confirmed booking.
 */
function offerEachTimeOnce(slots: AvailableTourSlot[], rulesById: Map<string, TourAvailabilityRuleRow>): AvailableTourSlot[] {
    const byKey = new Map<string, AvailableTourSlot>();
    const order: string[] = [];
    for (const slot of slots) {
        const key = `${slot.locationId}|${slot.startAt}|${slot.endAt}`;
        const held = byKey.get(key);
        if (!held) {
            byKey.set(key, slot);
            order.push(key);
            continue;
        }
        const heldStrict = rulesById.get(held.ruleId)?.approval_required === true;
        const nextStrict = rulesById.get(slot.ruleId)?.approval_required === true;
        const attributed = nextStrict && !heldStrict ? slot : held;
        byKey.set(key, {
            ...attributed,
            capacity: Math.max(held.capacity, slot.capacity),
            remainingCapacity: Math.max(held.remainingCapacity, slot.remainingCapacity),
        });
    }
    return order.map((k) => byKey.get(k)!);
}

export function isSlotOffered(
    slots: AvailableTourSlot[],
    candidate: { startAt: string; endAt: string; locationId: string },
    minRemaining = 1
): boolean {
    return slots.some(
        (s) =>
            s.startAt === candidate.startAt &&
            s.endAt === candidate.endAt &&
            String(s.locationId) === String(candidate.locationId) &&
            s.remainingCapacity >= minRemaining
    );
}

/**
 * Capacity of the offered slot a write lands in, or `null` when the slot is not offered
 * with room left. Overlapping rules can offer the same slot; their bookings share one
 * count, so the most generous rule is the limit (matching {@link isSlotOffered}).
 */
export function offeredSlotCapacity(
    slots: AvailableTourSlot[],
    candidate: { startAt: string; endAt: string; locationId: string },
    minRemaining = 1
): number | null {
    let capacity: number | null = null;
    for (const s of slots) {
        if (
            s.startAt === candidate.startAt &&
            s.endAt === candidate.endAt &&
            String(s.locationId) === String(candidate.locationId) &&
            s.remainingCapacity >= minRemaining
        ) {
            capacity = Math.max(capacity ?? 0, s.capacity);
        }
    }
    return capacity;
}
