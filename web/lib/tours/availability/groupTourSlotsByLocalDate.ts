import { formatInTimeZone } from "date-fns-tz";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

function resolveTz(slot: AvailableTourSlot): string {
    const t = String(slot.timezone ?? "").trim();
    return t && isValidIanaTimeZone(t) ? t : UTC_FALLBACK_IANA;
}

/** Wall-calendar date key (`yyyy-MM-dd`) for the slot start in the slot's own timezone. */
export function localDateKeyForSlot(slot: AvailableTourSlot): string {
    return formatInTimeZone(new Date(slot.startAt), resolveTz(slot), "yyyy-MM-dd");
}

export type TourSlotsGroupedByLocalDate = {
    /** Sorted ascending `yyyy-MM-dd` keys. */
    orderedDayKeys: string[];
    byDay: Map<string, AvailableTourSlot[]>;
};

/** Groups slots by local calendar day; each day's slots sorted by start instant. */
export function groupTourSlotsByLocalDate(slots: AvailableTourSlot[]): TourSlotsGroupedByLocalDate {
    const byDay = new Map<string, AvailableTourSlot[]>();
    for (const s of slots) {
        const k = localDateKeyForSlot(s);
        const arr = byDay.get(k) ?? [];
        arr.push(s);
        byDay.set(k, arr);
    }
    for (const arr of byDay.values()) {
        arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    const orderedDayKeys = Array.from(byDay.keys()).sort();
    return { orderedDayKeys, byDay };
}

/** First local day that has at least one slot (by ascending date). */
export function firstAvailableLocalDateKey(slots: AvailableTourSlot[]): string | null {
    const { orderedDayKeys } = groupTourSlotsByLocalDate(slots);
    return orderedDayKeys[0] ?? null;
}

/** Compact time range for a slot button (wall times in the slot timezone). */
export function formatTourSlotTimeRangeLabel(slot: AvailableTourSlot): string {
    const tz = resolveTz(slot);
    const start = formatInTimeZone(new Date(slot.startAt), tz, "h:mm a");
    const end = formatInTimeZone(new Date(slot.endAt), tz, "h:mm a");
    return `${start} – ${end}`;
}

/** Short weekday + month + day for a tab, using an actual slot instant (correct wall day in rule TZ). */
export function formatTourDayTabLabel(dateKey: string, sampleSlot: AvailableTourSlot | undefined): string {
    if (!sampleSlot) return dateKey;
    const tz = resolveTz(sampleSlot);
    return formatInTimeZone(new Date(sampleSlot.startAt), tz, "EEE MMM d");
}
