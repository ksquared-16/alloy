/**
 * Paged UTC windows for admin slot queries (aligned with `/api/admin/tours/slots` max span guard).
 * Page 0 starts at today 00:00 UTC; each page advances by `pageDays`.
 */

export const TOUR_SLOT_PAGE_DAYS = 14;

export type TourSlotUtcWindow = {
    from: Date;
    to: Date;
};

/** Inclusive `from`, exclusive-style `to` = `from` + `pageDays` calendar days (UTC midnight anchor). */
export function tourSlotWindowBoundsUtc(pageIndex: number, pageDays: number = TOUR_SLOT_PAGE_DAYS): TourSlotUtcWindow {
    const safePage = Math.max(0, Math.floor(pageIndex));
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() + safePage * pageDays);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + pageDays);
    return { from, to };
}

/** Human-readable range for the modal chrome (UTC calendar days). */
export function formatTourSlotWindowRangeLabel(from: Date, to: Date, locale = "en-US"): string {
    const endDisplay = new Date(to.getTime() - 1);
    const df: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
    const a = from.toLocaleDateString(locale, df);
    const b = endDisplay.toLocaleDateString(locale, df);
    return `${a} – ${b}`;
}
